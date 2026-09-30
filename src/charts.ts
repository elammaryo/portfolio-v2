import { REPO_META, type CommitData } from './repos';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

// 24-hour radial chart. Bars grow outward from a ring; 10 PM–5 AM is shaded.
export function drawClock(svg: SVGSVGElement, hours: number[]) {
  const cx = 160, cy = 160, r0 = 58, r1 = 140;
  const max = Math.max(...hours);
  const angle = (h: number) => (h / 24) * Math.PI * 2 - Math.PI / 2;
  // Night arc: 22:00 → 05:00
  const a0 = angle(22), a1 = angle(29);
  const arc = (r: number, s: number, _e: number) => `${cx + Math.cos(s) * r},${cy + Math.sin(s) * r}`;
  const path = `M${arc(r0 - 6, a0, a1)} A${r0 - 6},${r0 - 6} 0 0 1 ${arc(r0 - 6, a1, a1)} L${arc(r1 + 8, a1, a1)} A${r1 + 8},${r1 + 8} 0 0 0 ${arc(r1 + 8, a0, a0)} Z`;
  svg.appendChild(el('path', { d: path, fill: 'rgba(255,179,107,0.07)', stroke: 'rgba(255,179,107,0.25)', 'stroke-dasharray': '2 4' }));
  svg.appendChild(el('circle', { cx, cy, r: r0 - 2, fill: 'none', stroke: 'rgba(237,235,245,0.12)' }));
  const bars: SVGLineElement[] = [];
  hours.forEach((n, h) => {
    const a = angle(h + 0.5);
    const len = (n / max) * (r1 - r0);
    const night = h >= 22 || h < 5;
    const line = el('line', {
      x1: cx + Math.cos(a) * r0, y1: cy + Math.sin(a) * r0,
      x2: cx + Math.cos(a) * (r0 + len), y2: cy + Math.sin(a) * (r0 + len),
      stroke: night ? '#ffb36b' : '#9d8cff', 'stroke-width': 9, 'stroke-linecap': 'round',
    }) as SVGLineElement;
    line.dataset.len = String(len);
    const t = el('title', {}); t.textContent = `${fmtHour(h)}: ${n} commits`;
    line.appendChild(t);
    svg.appendChild(line);
    bars.push(line);
  });
  for (const h of [0, 6, 12, 18]) {
    const a = angle(h);
    const t = el('text', { x: cx + Math.cos(a) * (r1 + 20), y: cy + Math.sin(a) * (r1 + 20) + 3, 'text-anchor': 'middle' });
    t.textContent = fmtHour(h);
    svg.appendChild(t);
  }
  const total = hours.reduce((a, b) => a + b, 0);
  const night = [22, 23, 0, 1, 2, 3, 4].reduce((a, h) => a + hours[h], 0);
  const big = el('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', style: 'font-family:Syne,sans-serif;font-size:30px;font-weight:700;fill:#edebf5' });
  big.textContent = `${Math.round((night / total) * 100)}%`;
  const small = el('text', { x: cx, y: cy + 20, 'text-anchor': 'middle' });
  small.textContent = 'after 10 PM';
  svg.append(big, small);
  return bars;
}
const fmtHour = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

// GitHub-style calendar, Monday-first weeks, from the first commit's week to today.
export function drawHeatmap(svg: SVGSVGElement, days: Record<string, number>, first: string, last: string) {
  const start = new Date(first + 'T12:00:00');
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(last + 'T12:00:00');
  const cell = 11, gap = 3, top = 18, left = 26;
  const weeks = Math.ceil(((end.getTime() - start.getTime()) / 86400000 + 1) / 7);
  const w = left + weeks * (cell + gap), h = top + 7 * (cell + gap);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const lvl = (n: number) => (n === 0 ? 0 : n < 4 ? 1 : n < 10 ? 2 : n < 25 ? 3 : 4);
  const colors = ['#16152a', '#3a3170', '#6a58d6', '#b08fff', '#ffb36b'];
  const monthFmt = new Intl.DateTimeFormat('en-CA', { month: 'short' });
  const cells: SVGRectElement[] = [];
  let lastMonth = -1;
  for (let wk = 0; wk < weeks; wk++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + wk * 7 + d);
      if (date > end) break;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const n = days[key] ?? 0;
      const r = el('rect', { x: left + wk * (cell + gap), y: top + d * (cell + gap), width: cell, height: cell, rx: 2.5, fill: colors[lvl(n)] }) as SVGRectElement;
      const t = el('title', {}); t.textContent = `${key}: ${n} commit${n === 1 ? '' : 's'}`;
      r.appendChild(t);
      svg.appendChild(r);
      cells.push(r);
      if (d === 0 && date.getMonth() !== lastMonth && date.getDate() <= 7) {
        lastMonth = date.getMonth();
        const lbl = el('text', { x: left + wk * (cell + gap), y: 10 });
        lbl.textContent = date.getMonth() === 0 ? `${monthFmt.format(date)} ${date.getFullYear()}` : monthFmt.format(date);
        svg.appendChild(lbl);
      }
    }
  }
  ['Mon', 'Wed', 'Fri'].forEach((d, i) => {
    const t = el('text', { x: 0, y: top + (i * 2) * (cell + gap) + 9 });
    t.textContent = d;
    svg.appendChild(t);
  });
  return cells;
}

/**
 * What the commits were built with: each repo's commits count toward every framework in its
 * `stack` (REPO_META), so the bars overlap and are shown as commit counts, not shares.
 * Frameworks rather than languages: by lines, TypeScript was 71% and Dart 11%, which hid
 * that the most-worked-on app here is Flutter.
 */
export function drawStack(host: HTMLElement, data: CommitData, top = 6) {
  const count = new Map<string, number>();
  data.repos.forEach((r) => (REPO_META[r.id]?.stack ?? []).forEach((f) => count.set(f, (count.get(f) ?? 0) + r.mine)));
  const rows = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  const max = rows[0]?.[1] ?? 1;
  return rows.map(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'lang';
    row.innerHTML = `<span>${k}</span><span class="lang__bar"><i style="width:${Math.max((v / max) * 100, 2)}%"></i></span><span class="lang__pct">${v.toLocaleString('en-CA')}</span>`;
    host.appendChild(row);
    return row.querySelector('i')!;
  });
}

// The data file only keeps the messages this shows (scripts/prep.py blanks the rest), so a
// change to the rule or the count here has to be made there too.
export function fillTicker(host: HTMLElement, data: CommitData) {
  const recent = data.commits.filter((c) => c[2] && c[2].length > 12 && !/^merge/i.test(c[2])).slice(-90).reverse();
  const html = recent.map(([r, , m]) => `<span><b>${REPO_META[data.repos[r].id].label}</b>${escapeHtml(m)}</span>`).join('');
  host.innerHTML = html + html;
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
