import gsap from 'gsap';
import { FLOWS, KIND_LABEL, type Dir, type Flow, type FlowNode, type NodeKind } from './flows';

// A pulse of light walks one real request through a system, hop by hop. Each hop is
// labelled with what travels along it; return trips get their own arc. Failure paths the
// code handles hang off the nodes in red, and the safeguards light up in a rail as the
// request passes them. Autoplays while on screen; tabs, steps and the pause button take over.

const KIND_COLOR: Record<NodeKind, string> = {
  client: '#9d8cff',
  server: '#ffb36b',
  data: '#6fd6ff',
  service: '#d9d5ea',
  job: '#ff8fb1',
};
const ICON: Record<NodeKind, string> = {
  client: '<rect x="-5" y="-8" width="10" height="16" rx="2.5"/><path d="M-2 5h4"/>',
  server: '<rect x="-7.5" y="-7.5" width="15" height="6.5" rx="1.6"/><rect x="-7.5" y="1" width="15" height="6.5" rx="1.6"/><path d="M-4.5 -4.2h.01M-4.5 4.3h.01"/>',
  data: '<ellipse cx="0" cy="-5" rx="7" ry="2.8"/><path d="M-7 -5v10a7 2.8 0 0 0 14 0v-10"/><path d="M-7 0a7 2.8 0 0 0 14 0"/>',
  service: '<path d="M0 -8l7 4v8l-7 4l-7 -4v-8z"/><circle r="2.2"/>',
  job: '<circle r="7.5"/><path d="M0 -4.2v4.2l3 2"/>',
};
const DWELL = 3400;
const HOP = 1.05;
const WIDE = { w: 1000, h: 600, bw: 196, bh: 68 };
const TALL = { w: 460, bw: 196, bh: 64 };

type Placed = FlowNode & { x: number; y: number };
type Hop = { path: SVGPathElement; len: number; key: string };

export function initSystems(root: HTMLElement, reduced: boolean) {
  const tabs = root.querySelector<HTMLElement>('#sysTabs')!;
  const svg = root.querySelector<SVGSVGElement>('#sysSvg')!;
  const stepEl = root.querySelector<HTMLElement>('#sysStep')!;
  const list = root.querySelector<HTMLOListElement>('#sysList')!;
  const stats = root.querySelector<HTMLElement>('#sysStats')!;
  const guards = root.querySelector<HTMLElement>('#sysGuards')!;
  const playBtn = root.querySelector<HTMLButtonElement>('#sysPlay')!;
  const flowTitle = root.querySelector<HTMLElement>('#sysFlowTitle')!;
  const stage = root.querySelector<HTMLElement>('.sys__diagram')!;

  let flow: Flow = FLOWS[0];
  let step = -1;
  let playing = !reduced;
  let visible = false;
  let timer: number | undefined;
  let hopTween: gsap.core.Tween | gsap.core.Timeline | null = null;
  let layout: 'wide' | 'tall' = 'wide';
  let hops: (Hop | null)[] = [];
  let nodeEls = new Map<string, SVGGElement>();
  let placed = new Map<string, Placed>();
  let pulse: SVGGElement;

  tabs.innerHTML = FLOWS.map((f, i) => `
    <button type="button" role="tab" class="sys__tab${i === 0 ? ' is-active' : ''}" aria-selected="${i === 0}" data-flow="${f.id}" style="--fc:${f.color}">
      <span class="sys__tabdot"></span><span class="sys__tabname">${f.project}</span><span class="sys__tabflow">${f.name}</span>
    </button>`).join('');
  tabs.querySelectorAll<HTMLButtonElement>('.sys__tab').forEach((b) => b.addEventListener('click', () => {
    const f = FLOWS.find((x) => x.id === b.dataset.flow)!;
    if (f === flow) return;
    tabs.querySelectorAll('.sys__tab').forEach((o) => { o.classList.toggle('is-active', o === b); o.setAttribute('aria-selected', String(o === b)); });
    gsap.to(svg, { opacity: 0, duration: 0.25, onComplete: () => { setFlow(f); gsap.to(svg, { opacity: 1, duration: 0.4 }); } });
  }));

  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(!playing));
    window.clearTimeout(timer);
    if (playing) schedule();
  });

  const fromOf = (i: number) => flow.steps[i].from ?? (i > 0 ? flow.steps[i - 1].at : flow.steps[i].at);

  function place(f: Flow): { nodes: Placed[]; w: number; h: number } {
    if (layout === 'wide') return { nodes: f.nodes.map((n) => ({ ...n, x: n.at[0], y: n.at[1] })), w: WIDE.w, h: WIDE.h };
    // Phone: two hand-placed columns. An automatic zig-zag was tried first and tangled
    // every flow whose hops skip a row, so each flow carries its own phone layout.
    const nodes = f.nodes.map((n) => ({ ...n, x: n.tall[0], y: n.tall[1] }));
    return { nodes, w: TALL.w, h: Math.max(...nodes.map((n) => n.y)) + TALL.bh / 2 + 13 };
  }

  // Arcs bow to one side of the line between two nodes. A return trip bows to the
  // other side (the normal flips with direction), so both directions stay readable.
  function arc(a: Placed, b: Placed, bend: number) {
    const rail = layout === 'tall' ? flow.rails?.[`${a.id}>${b.id}`] : undefined;
    if (rail) {
      // Round the outside of the column instead of through the nodes in between.
      const x = rail === 'right' ? TALL.w - 8 : 8, r = 16, s = rail === 'right' ? 1 : -1, dy = b.y < a.y ? -1 : 1;
      return `M${a.x},${a.y} L${x - s * r},${a.y} Q${x},${a.y} ${x},${a.y + dy * r} L${x},${b.y - dy * r} Q${x},${b.y} ${x - s * r},${b.y} L${b.x},${b.y}`;
    }
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const c1x = a.x + dx * 0.3 + nx * bend, c1y = a.y + dy * 0.3 + ny * bend;
    const c2x = a.x + dx * 0.7 + nx * bend, c2y = a.y + dy * 0.7 + ny * bend;
    return `M${a.x},${a.y} C${c1x},${c1y} ${c2x},${c2y} ${b.x},${b.y}`;
  }

  function render() {
    const { nodes, w, h } = place(flow);
    placed = new Map(nodes.map((n) => [n.id, n]));
    const bw = layout === 'wide' ? WIDE.bw : TALL.bw;
    const bh = layout === 'wide' ? WIDE.bh : TALL.bh;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.classList.toggle('is-tall', layout === 'tall');

    // Directed edges, one per distinct (from → to).
    const keys: string[] = [];
    for (let i = 1; i < flow.steps.length; i++) {
      const a = fromOf(i), b = flow.steps[i].at;
      if (a !== b && !keys.includes(`${a}>${b}`)) keys.push(`${a}>${b}`);
    }
    let edges = '', labels = '';
    for (const key of keys) {
      const [ai, bi] = key.split('>');
      const pair = keys.includes(`${bi}>${ai}`);
      const bend = layout === 'wide' ? (pair ? 30 : 12) : (pair ? 16 : 8);
      const d = arc(placed.get(ai)!, placed.get(bi)!, bend);
      edges += `<path class="sys-edge" d="${d}"/><path class="sys-lit" data-key="${key}" d="${d}" stroke="${flow.color}"/>`;
      // A phone is too narrow for a label on every wire; the panel right below names the hop.
      if (layout === 'wide') labels += `<g class="sys-elabel" data-key="${key}"><rect rx="9" height="18"/><text y="12.5"></text></g>`;
    }

    // Failure paths hang off their node on desktop. On a phone there is no room for the
    // labels, so a node that handles a failure wears a small red mark instead.
    const OFF: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    let rejects = '', marks = '';
    if (layout === 'wide') {
      rejects = flow.steps.map((s, i) => {
        if (!s.reject) return '';
        const n = placed.get(s.at)!;
        const [ox, oy] = OFF[s.reject.dir];
        const sx = n.x + ox * (bw / 2), sy = n.y + oy * (bh / 2);
        const ex = sx + ox * 38, ey = sy + oy * 38;
        // Mono glyphs are 0.6em wide, and the label is 10.5px (see style.css).
        const tw = s.reject.text.length * 6.3 + 30;
        const lx = s.reject.dir === 'left' ? ex - tw : s.reject.dir === 'right' ? ex : ex - tw / 2;
        const ly = s.reject.dir === 'up' ? ey - 22 : s.reject.dir === 'down' ? ey + 4 : ey - 9;
        return `<g class="sys-reject" data-steps="${i}">
          <path d="M${sx},${sy} L${ex},${ey}"/>
          <g transform="translate(${lx},${ly})"><rect width="${tw}" height="18" rx="9"/><text x="12" y="12.5">×</text><text class="t" x="26" y="12.5">${s.reject.text}</text></g>
        </g>`;
      }).join('');
    } else {
      const byNode = new Map<string, number[]>();
      flow.steps.forEach((s, i) => { if (s.reject) byNode.set(s.at, [...(byNode.get(s.at) ?? []), i]); });
      marks = [...byNode].map(([id, ks]) => {
        const n = placed.get(id)!;
        return `<g class="sys-reject sys-reject--mark" data-steps="${ks.join(' ')}"><g transform="translate(${n.x - bw / 2 + 6},${n.y - bh / 2})"><circle r="10"/><text y="4.5">×</text></g></g>`;
      }).join('');
    }

    const badge = new Map<string, number[]>();
    flow.steps.forEach((s, i) => badge.set(s.at, [...(badge.get(s.at) ?? []), i + 1]));
    const tx = layout === 'wide' ? 40 : 37;
    const nodeSvg = nodes.map((n) => {
      const c = KIND_COLOR[n.kind];
      const nums = (badge.get(n.id) ?? []).map((k) => String(k).padStart(2, '0')).join(' · ');
      const bwid = 14 + nums.length * 6.4;
      return `<g class="sys-node" data-id="${n.id}" transform="translate(${n.x},${n.y})" style="--kc:${c}">
        <rect class="sys-node__glow" x="${-bw / 2 - 6}" y="${-bh / 2 - 6}" width="${bw + 12}" height="${bh + 12}" rx="20"/>
        <rect class="sys-node__box" x="${-bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" rx="15"/>
        <g class="sys-node__icon" transform="translate(${-bw / 2 + (layout === 'wide' ? 22 : 20)},0)">${ICON[n.kind]}</g>
        <text class="sys-node__label" x="${-bw / 2 + tx}" y="-4">${n.label}</text>
        <text class="sys-node__sub" x="${-bw / 2 + tx}" y="15">${n.sub}</text>
        ${nums ? `<g class="sys-node__badge" transform="translate(${bw / 2 - bwid + 6},${-bh / 2 - 9})"><rect width="${bwid}" height="18" rx="9"/><text x="${bwid / 2}" y="12.5">${nums}</text></g>` : ''}
      </g>`;
    }).join('');

    svg.innerHTML = `
      <defs>
        <pattern id="sysDots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(237,235,245,0.08)"/></pattern>
        <filter id="sysGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="sysHalo"><stop offset="0" stop-color="${flow.color}" stop-opacity="0.6"/><stop offset="1" stop-color="${flow.color}" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#sysDots)"/>
      <g class="sys-edges">${edges}</g>
      <g class="sys-rejects">${rejects}</g>
      <g class="sys-pulse" opacity="0"><circle r="26" fill="url(#sysHalo)"/><circle r="5.5" fill="#fff"/><circle r="9" fill="none" stroke="${flow.color}" stroke-width="2"/></g>
      <g>${nodeSvg}</g>
      <g class="sys-marks">${marks}</g>
      <g class="sys-labels">${labels}</g>`;

    const litByKey = new Map<string, SVGPathElement>();
    svg.querySelectorAll<SVGPathElement>('.sys-lit').forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      litByKey.set(p.dataset.key!, p);
    });
    hops = flow.steps.map((s, i) => {
      if (i === 0) return null;
      const key = `${fromOf(i)}>${s.at}`;
      const path = litByKey.get(key);
      return path ? { path, len: path.getTotalLength(), key } : null;
    });
    // Place each edge label at the middle of its arc, nudged off the line.
    svg.querySelectorAll<SVGGElement>('.sys-elabel').forEach((g) => {
      const p = litByKey.get(g.dataset.key!)!;
      const m = p.getPointAtLength(p.getTotalLength() / 2);
      g.setAttribute('transform', `translate(${m.x},${m.y - 9})`);
    });
    nodeEls = new Map([...svg.querySelectorAll<SVGGElement>('.sys-node')].map((g) => [g.dataset.id!, g]));
    nodeEls.forEach((g, id) => g.addEventListener('click', () => {
      const next = flow.steps.findIndex((s, k) => s.at === id && k > step);
      const j = next >= 0 ? next : flow.steps.findIndex((s) => s.at === id);
      if (j >= 0) goTo(j);
    }));
    pulse = svg.querySelector<SVGGElement>('.sys-pulse')!;
  }

  function setLabel(key: string, text: string, state: 'on' | 'done' | 'off') {
    const g = svg.querySelector<SVGGElement>(`.sys-elabel[data-key="${key}"]`);
    if (!g) return;
    const t = g.querySelector('text')!;
    if (text && t.textContent !== text) {
      t.textContent = text;
      const wdt = text.length * (layout === 'wide' ? 6.6 : 7.5) + 18;
      const r = g.querySelector('rect')!;
      r.setAttribute('width', String(wdt));
      r.setAttribute('x', String(-wdt / 2));
      t.setAttribute('x', '0');
    }
    g.classList.toggle('is-on', state === 'on');
    g.classList.toggle('is-done', state === 'done');
  }

  function setFlow(f: Flow) {
    flow = f;
    step = -1;
    window.clearTimeout(timer);
    hopTween?.kill();
    root.style.setProperty('--flow', f.color);
    flowTitle.textContent = `${f.project} · ${f.name}`;
    list.innerHTML = f.steps.map((s, i) => `<li><button type="button" data-step="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${s.title}</span>${s.guard ? '<span class="g" aria-hidden="true"></span>' : ''}</button></li>`).join('');
    list.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.step))));
    guards.innerHTML = `<span class="sys__guards-k mono">Safeguards on this path</span><div class="sys__guardlist">${f.steps.map((s, i) => s.guard
      ? `<button type="button" class="sys__guard" data-step="${i}"><i aria-hidden="true"></i>${s.guard}</button>` : '').join('')}</div>`;
    guards.querySelectorAll<HTMLButtonElement>('.sys__guard').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.step))));
    stats.innerHTML = f.stats.map(([v, k]) => `<div class="sys__stat"><span class="v">${v}</span><span class="k">${k}</span></div>`).join('');
    render();
    goTo(0);
  }

  function nodeCenter(id: string) { const n = placed.get(id)!; return { x: n.x, y: n.y }; }

  function goTo(i: number) {
    window.clearTimeout(timer);
    hopTween?.kill();
    const s = flow.steps[i];
    const forward = i === step + 1;
    // Trails and labels: hops before this one are drawn, later ones are dark.
    const doneKeys = new Set<string>();
    hops.forEach((h, k) => { if (h && k < i) doneKeys.add(h.key); });
    hops.forEach((h, k) => {
      if (!h) return;
      if (k < i) h.path.style.strokeDashoffset = '0';
      else if (!doneKeys.has(h.key)) h.path.style.strokeDashoffset = String(h.len);
    });
    svg.querySelectorAll<SVGGElement>('.sys-elabel').forEach((g) => setLabel(g.dataset.key!, '', doneKeys.has(g.dataset.key!) ? 'done' : 'off'));
    for (let k = 1; k < i; k++) { const h = hops[k]; if (h) setLabel(h.key, flow.steps[k].via ?? '', 'done'); }
    nodeEls.forEach((g) => g.classList.remove('is-active'));
    gsap.killTweensOf(svg.querySelectorAll('.sys-node__glow'));
    gsap.set(svg.querySelectorAll('.sys-node__glow'), { clearProps: 'opacity,transform' });
    const visited = new Set(flow.steps.slice(0, i).map((x) => x.at));
    nodeEls.forEach((g, id) => g.classList.toggle('is-done', visited.has(id)));
    let rejectNow: SVGGElement | undefined;
    svg.querySelectorAll<SVGGElement>('.sys-reject').forEach((g) => {
      const ks = g.dataset.steps!.split(' ').map(Number);
      const on = ks.includes(i);
      if (on) rejectNow = g;
      g.classList.toggle('is-on', on);
      g.classList.toggle('is-done', !on && ks.some((k) => k < i));
    });
    guards.querySelectorAll<HTMLElement>('.sys__guard').forEach((g) => {
      const k = Number(g.dataset.step);
      g.classList.toggle('is-on', k <= i);
      g.classList.toggle('is-now', k === i);
    });

    const target = nodeEls.get(s.at)!;
    const arrive = () => {
      target.classList.add('is-active');
      if (!reduced) gsap.fromTo(target.querySelector('.sys-node__glow'), { opacity: 0.9, scale: 1.12, transformOrigin: 'center' }, { opacity: 0.55, scale: 1, duration: 0.8, ease: 'power3.out' });
      if (rejectNow && !reduced) gsap.fromTo(rejectNow, { x: -3 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      schedule();
    };
    const hop = hops[i];
    const origin = fromOf(i);
    const prevAt = i > 0 ? flow.steps[i - 1].at : origin;
    if (hop && forward && !reduced) {
      setLabel(hop.key, s.via ?? '', 'on');
      const tl = gsap.timeline({ onComplete: arrive });
      if (origin !== prevAt) {
        // The signal starts somewhere new: fade out, reappear at the origin.
        const o = nodeCenter(origin);
        tl.to(pulse, { attr: { opacity: 0 }, duration: 0.2 })
          .set(pulse, { attr: { transform: `translate(${o.x},${o.y})` } });
      }
      tl.set(pulse, { attr: { opacity: 1 } });
      const t = { v: 0 };
      tl.to(t, {
        v: 1, duration: HOP, ease: 'power2.inOut',
        onUpdate: () => {
          const pt = hop.path.getPointAtLength(t.v * hop.len);
          pulse.setAttribute('transform', `translate(${pt.x},${pt.y})`);
          hop.path.style.strokeDashoffset = String(hop.len * (1 - t.v));
        },
      });
      hopTween = tl;
    } else {
      if (hop) { hop.path.style.strokeDashoffset = '0'; setLabel(hop.key, s.via ?? '', 'on'); }
      const c = nodeCenter(s.at);
      pulse.setAttribute('transform', `translate(${c.x},${c.y})`);
      pulse.setAttribute('opacity', i === 0 || !hop ? '0' : '1');
      arrive();
    }
    step = i;
    updatePanel();
  }

  function stepHtml(f: Flow, i: number) {
    const s = f.steps[i];
    const kind = f.nodes.find((n) => n.id === s.at)!.kind;
    return `
      <p class="sys__count mono">Step ${String(i + 1).padStart(2, '0')} of ${String(f.steps.length).padStart(2, '0')} · ${KIND_LABEL[kind]}${s.via ? ` · <span class="sys__via">${s.via}</span>` : ''}</p>
      <h3 class="sys__title">${s.title}</h3>
      <p class="sys__body">${s.body}</p>
      ${s.guard ? `<p class="sys__flag sys__flag--guard"><i aria-hidden="true"></i><span>Safeguard</span><b>${s.guard}</b></p>` : ''}
      ${s.reject ? `<p class="sys__flag sys__flag--reject"><i aria-hidden="true">×</i><span>If it fails</span><b>${s.reject.text}</b></p>` : ''}
      <div class="sys__tech">${s.tech.map((t) => `<span>${t}</span>`).join('')}</div>
      <p class="sys__file mono"><span>in code</span>${s.file}</p>`;
  }

  // The step text is as tall as the longest step of any system, so stepping or switching
  // tabs never changes the stage's height (which moved the diagram under the reader).
  let fittedWidth = 0;
  function fitStepHeight() {
    const w = stepEl.clientWidth;
    if (!w || w === fittedWidth) return;
    fittedWidth = w;
    const probe = document.createElement('div');
    probe.className = stepEl.className;
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;min-height:0;width:${w}px`;
    stepEl.parentElement!.appendChild(probe);
    let max = 0;
    for (const f of FLOWS) f.steps.forEach((_, i) => { probe.innerHTML = stepHtml(f, i); max = Math.max(max, probe.offsetHeight); });
    probe.remove();
    stepEl.style.minHeight = `${Math.ceil(max)}px`;
  }

  function updatePanel() {
    stepEl.innerHTML = stepHtml(flow, step);
    if (!reduced) gsap.fromTo(stepEl.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'power3.out' });
    list.querySelectorAll<HTMLButtonElement>('button').forEach((b, k) => {
      b.classList.toggle('is-active', k === step);
      b.classList.toggle('is-done', k < step);
      b.setAttribute('aria-current', k === step ? 'step' : 'false');
    });
  }

  function schedule() {
    window.clearTimeout(timer);
    if (!playing || !visible) return;
    const last = step >= flow.steps.length - 1;
    timer = window.setTimeout(() => {
      if (last) {
        // Let the finished path glow for a moment, then run it again.
        gsap.to(svg.querySelectorAll('.sys-lit'), { opacity: 0.25, duration: 0.6, onComplete: () => {
          svg.querySelectorAll<SVGPathElement>('.sys-lit').forEach((p) => { p.style.opacity = '1'; });
          step = -1;
          goTo(0);
        } });
      } else goTo(step + 1);
    }, last ? DWELL + 1800 : DWELL);
  }

  const pickLayout = () => (stage.clientWidth < 700 ? 'tall' : 'wide');
  layout = pickLayout();
  setFlow(flow);
  new ResizeObserver(() => {
    const next = pickLayout();
    if (next !== layout) { layout = next; const keep = step; render(); step = -1; goTo(Math.max(0, keep)); }
  }).observe(stage);
  // Re-measure when the panel's width changes, and once the web fonts are in (they change line breaks).
  document.fonts.ready.then(() => { fittedWidth = 0; fitStepHeight(); });
  new ResizeObserver(() => fitStepHeight()).observe(stepEl.parentElement!);
  const io = new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) schedule();
    if (!visible) window.clearTimeout(timer);
  }, { threshold: 0.3 });
  io.observe(stage);

  return {
    /** Switch to a flow by project id (used by the "How it works" buttons). */
    select(id: string) {
      tabs.querySelector<HTMLButtonElement>(`.sys__tab[data-flow="${id}"]`)?.click();
    },
  };
}
