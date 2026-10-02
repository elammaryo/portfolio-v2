import '@fontsource/syne/latin-600.css';
import '@fontsource/syne/latin-700.css';
import '@fontsource/syne/latin-800.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/anton/latin-400.css';
import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import raw from './data/commits.json';
import type { CommitData } from './repos';
import { initHeroSection } from './hero/index';
import { initSystems } from './systems/diagram';
import { initCapabilities } from './capabilities';
import { initGameDayEgg } from './eggs/gameday';
import { initSuperOverEgg } from './eggs/superover';
import { initAthenaEgg } from './eggs/athena';
import { initBudgetEgg } from './eggs/budget';
import { initGlazeBot } from './glazebot';
import { initGameOverEgg } from './eggs/gameover';
import { initSky } from './sky';
import { drawClock, drawHeatmap, drawStack, fillTicker } from './charts';
import { player } from './audio';

gsap.registerPlugin(ScrollTrigger);
// ?slow=N slows every timeline down N times (used to inspect the intro frame by frame).
const slow = Number(new URLSearchParams(location.search).get('slow'));
if (slow > 1) gsap.globalTimeline.timeScale(1 / slow);
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __st: ScrollTrigger, __gsap: gsap, __player: player });
const data = raw as unknown as CommitData;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll(s)] as T[];

/* ---------- Smooth scroll ---------- */
const lenis = reduced ? null : new Lenis({
  lerp: 0.09, wheelMultiplier: 1,
  // Shift and the wheel over the roles row moves the row (initRoles), not the page.
  virtualScroll: ({ event }) => !(event.shiftKey && (event.target as Element | null)?.closest?.('#roles')),
});
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!;
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target as HTMLElement | number, { offset: 0, duration: 1.6, force: true });
    else if (typeof target === 'number') window.scrollTo({ top: 0 });
    else (target as HTMLElement).scrollIntoView();
  });
});

/* ---------- The sky behind the page ---------- */
initSky({ reduced });

/* ---------- WebGL ---------- */
initHeroSection({ reduced, lenis }).then(() => { ScrollTrigger.sort(); ScrollTrigger.refresh(); });
const systems = initSystems($('#systems'), reduced);
$$<HTMLAnchorElement>('[data-flow]').forEach((a) => a.addEventListener('click', () => systems.select(a.dataset.flow!)));

/* ---------- Mobile menu ---------- */
const menuBtn = $<HTMLButtonElement>('#navMenu');
const menu = $('#mobileMenu');
const setMenu = (open: boolean) => {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.textContent = open ? 'Close' : 'Menu';
  if (open) {
    lenis?.stop();
    if (!reduced) gsap.fromTo('.mmenu__links a, .mmenu__foot', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.05, ease: 'power3.out' });
  } else lenis?.start();
};
menuBtn.addEventListener('click', () => setMenu(menu.hidden === true));
$$('.mmenu a').forEach((a) => a.addEventListener('click', () => setMenu(false), { capture: true }));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
const caps = initCapabilities($('#capsMatrix'), $('#capsDetail'), reduced);
// Every artwork is playable now, so the card's big "View" cursor bubble would sit on top of
// the controls: switch it off over the art (an empty data-cursor overrides the card's).
$$('.project__art').forEach((a) => { a.dataset.cursor = ''; });
initGameDayEgg($('.art-gameday'), reduced);
initSuperOverEgg($('.art-superover'), reduced);
initAthenaEgg($('.art-athena'), reduced);
initBudgetEgg($('.art-budget'), reduced);
initGlazeBot(reduced);

// Project names are set in a very wide display face, and one word can't wrap: "GameOver"
// ran under the artwork at 1440px and "SuperOver" did at 1280px. Shrink any name that
// overflows its column. Runs before ScrollTrigger measures, since it changes card heights.
function fitNames() {
  $$('.project__name').forEach((n) => {
    n.style.fontSize = '';
    const over = n.scrollWidth / n.clientWidth;
    if (over > 1.001) n.style.fontSize = `${(parseFloat(getComputedStyle(n).fontSize) / over) * 0.97}px`;
  });
}
fitNames();
ScrollTrigger.addEventListener('refreshInit', fitNames);
document.fonts.ready.then(() => ScrollTrigger.refresh());

/* ---------- Career map ---------- */
// Every role and stint below carries its dates; the map is drawn from them, so the list and
// the map can't disagree. Months are inclusive; a role with no end runs to this month.
function drawCareer(host: HTMLElement) {
  const now = new Date();
  const t0 = 2023 * 12;
  const t1 = now.getFullYear() * 12 + now.getMonth() + 1;
  const pos = (ym: string) => { const [y, m] = ym.split('-').map(Number); return ((y * 12 + (m - 1) - t0) / (t1 - t0)) * 100; };
  const axis = document.createElement('div');
  axis.className = 'career__axis';
  host.append(axis);
  for (let y = 2023; y <= now.getFullYear(); y++) {
    const t = document.createElement('span');
    t.className = 'career__tick mono';
    t.style.left = `${pos(`${y}-01`)}%`;
    t.textContent = String(y);
    host.append(t);
  }
  const nowTick = document.createElement('span');
  nowTick.className = 'career__tick career__tick--now mono';
  nowTick.style.left = '100%';
  nowTick.textContent = 'now';
  host.append(nowTick);
  const bars: HTMLElement[] = [];
  $$<HTMLElement>('.roles [data-from]').forEach((el) => {
    const role = el.closest<HTMLElement>('.role')!;
    const from = el.dataset.from!, to = el.dataset.to;
    const [ty, tm] = (to ?? `${now.getFullYear()}-${now.getMonth() + 1}`).split('-').map(Number);
    const end = to ? `${tm === 12 ? ty + 1 : ty}-${tm === 12 ? 1 : tm + 1}` : null;
    const bar = document.createElement('i');
    bar.className = `career__bar${to ? '' : ' career__bar--now'}`;
    bar.dataset.role = role.dataset.role;
    bar.style.setProperty('--c', getComputedStyle(role).getPropertyValue('--c'));
    bar.style.left = `${pos(from)}%`;
    // A 2px gap where one role ends the month before the next begins, so touching bars stay two.
    bar.style.width = `calc(${(end ? pos(end) : 100) - pos(from)}% - ${end ? 2 : 0}px)`;
    bar.style.top = `${46 + Number(el.dataset.lane ?? 0) * 38}px`;
    const label = document.createElement('span');
    label.textContent = el.dataset.label ?? '';
    bar.append(label);
    host.append(bar);
    bars.push(bar);
  });
  $$<HTMLElement>('.roles [data-at]').forEach((role) => {
    const m = document.createElement('i');
    m.className = 'career__mile';
    m.dataset.role = role.dataset.role;
    m.style.setProperty('--c', getComputedStyle(role).getPropertyValue('--c'));
    m.style.left = `${pos(`${role.dataset.at}-07`)}%`;
    const label = document.createElement('span');
    label.innerHTML = `B.Sc.<b> ${Number(role.dataset.at)}</b>`;
    m.append(label);
    host.append(m);
  });
  // Pointing at a company lights its bars on the map, and the other way round.
  const hot = (id: string | null) => {
    host.classList.toggle('is-hot', !!id);
    $$<HTMLElement>('.career__bar, .career__mile', host).forEach((b) => b.classList.toggle('is-hot', b.dataset.role === id));
    $$<HTMLElement>('.role').forEach((r) => r.classList.toggle('is-hot', r.dataset.role === id));
  };
  $$<HTMLElement>('.role').forEach((r) => { r.addEventListener('pointerenter', () => hot(r.dataset.role ?? null)); r.addEventListener('pointerleave', () => hot(null)); });
  bars.forEach((b) => { b.addEventListener('pointerenter', () => hot(b.dataset.role ?? null)); b.addEventListener('pointerleave', () => hot(null)); });
  return bars;
}
const careerBars = drawCareer($('#career'));

/* ---------- The roles, side by side ---------- */
// The row scrolls sideways to keep the page short (see "Journey" in style.css). A finger or a
// trackpad moves it natively and snaps to a card; a mouse wheel still moves the page, so a
// mouse drags the row instead, and the arrows step one card at a time. The map above follows
// along: the cards in full view light their bars, and clicking a bar brings its card in.
function initRoles(track: HTMLElement, map: HTMLElement) {
  const cards = $$<HTMLElement>('.role', track);
  const prev = $<HTMLButtonElement>('#rolesPrev'), next = $<HTMLButtonElement>('#rolesNext');
  const thumb = $('#rolesThumb');
  const marks = $$<HTMLElement>('.career__bar, .career__mile', map);
  const max = () => track.scrollWidth - track.clientWidth;
  // Where the row stops for a card: its left edge on the column line. The first card rests on
  // that line, so its offset is the row's padding. The last few can't all reach it.
  const stop = (c: HTMLElement) => Math.min(max(), c.offsetLeft - cards[0].offsetLeft);
  const go = (i: number) => track.scrollTo({ left: stop(cards[i]), behavior: reduced ? 'auto' : 'smooth' });
  const step = (dir: number) => {
    const x = track.scrollLeft, stops = cards.map(stop);
    const i = dir > 0 ? stops.findIndex((s) => s > x + 4) : stops.findLastIndex((s) => s < x - 4);
    if (i >= 0) go(i);
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  // Shift and the wheel steps a card per notch. Left to the browser, a notch on a snapping row
  // only nudged it, and the snap pulled it straight back to the card it started from.
  let notch = -1e9;
  track.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!e.shiftKey || !d) return;
    e.preventDefault();
    if (e.timeStamp - notch > 320) { notch = e.timeStamp; step(Math.sign(d)); }
  }, { passive: false });
  marks.forEach((m) => m.addEventListener('click', () => {
    const i = cards.findIndex((c) => c.dataset.role === m.dataset.role);
    if (i >= 0) go(i);
  }));

  let frame = 0;
  const sync = () => {
    frame = 0;
    const x = track.scrollLeft, w = track.clientWidth;
    prev.disabled = x <= 2;
    next.disabled = x >= max() - 2;
    thumb.style.width = `${(w / track.scrollWidth) * 100}%`;
    thumb.style.transform = `translateX(${(x / w) * 100}%)`;
    const shown = new Set(cards.filter((c) => c.offsetLeft - x > -8 && c.offsetLeft + c.offsetWidth - x < w + 8).map((c) => c.dataset.role));
    marks.forEach((m) => m.classList.toggle('is-here', shown.has(m.dataset.role)));
  };
  const later = () => { frame ||= requestAnimationFrame(sync); };
  track.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', later);
  sync();

  // Mouse drag. Snapping is off while the row follows the pointer (it would pull back to a card
  // every frame) and comes back once the glide to the card it was heading for has ended.
  let id = -1, x0 = 0, s0 = 0, moved = false, v = 0, lastX = 0, lastT = 0, drags = 0;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    id = e.pointerId; x0 = lastX = e.clientX; lastT = e.timeStamp; s0 = track.scrollLeft; moved = false; v = 0;
  });
  track.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - x0;
    if (!moved) {
      // A few pixels of give, so a click (or a double-click to select a word) is not a drag.
      if (Math.abs(dx) < 6) return;
      moved = true;
      drags++;
      track.setPointerCapture(id);
      track.classList.add('is-grabbing');
      getSelection()?.removeAllRanges();
    }
    track.scrollLeft = s0 - dx;
    if (e.timeStamp > lastT) v = (e.clientX - lastX) / (e.timeStamp - lastT);
    lastX = e.clientX; lastT = e.timeStamp;
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    if (!moved) return;
    // Carry the flick a little way, then land on the nearest card: a quick short flick still
    // moves on by one.
    const aim = track.scrollLeft - v * 240;
    const stops = cards.map(stop);
    const to = stops.reduce((a, s) => (Math.abs(s - aim) < Math.abs(a - aim) ? s : a), stops[0]);
    track.scrollTo({ left: to, behavior: reduced ? 'auto' : 'smooth' });
    // Only this drag's glide may turn snapping back on: a new drag inside the glide owns it now.
    const mine = drags;
    const end = () => { if (mine === drags) track.classList.remove('is-grabbing'); };
    track.addEventListener('scrollend', end, { once: true });
    setTimeout(end, 900);
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  // The click that ends a drag is not a click.
  track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}
initRoles($('#roles'), $('#career'));

/* ---------- Data-driven pieces ---------- */
const clockBars = drawClock($<SVGSVGElement>('#clock'), data.hours);
const heatCells = drawHeatmap($<SVGSVGElement>('#heatmap'), data.days, data.stats.first, data.stats.last);
const langBars = drawStack($('#langs'), data);
fillTicker($('#ticker'), data);
$('#factStreak').textContent = String(data.stats.bestStreak);
$('#factBusiest').textContent = String(data.stats.busiest[1]);
const busiestDate = new Date(data.stats.busiest[0] + 'T12:00:00');
$('#factBusiestK').textContent = `commits on ${busiestDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}, my busiest day`;
$('#factDays').textContent = String(data.stats.activeDays);
$('#lastCommit').textContent = `Last commit: ${new Date(data.stats.last + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;

/* ---------- GameOver waveform ---------- */
const wave = $('#goWave');
const waveBars: HTMLElement[] = [];
for (let i = 0; i < 48; i++) {
  const s = document.createElement('span');
  s.style.height = `${20 + Math.abs(Math.sin(i * 0.45)) * 70}%`;
  wave.appendChild(s);
  waveBars.push(s);
}
if (!reduced) {
  waveBars.forEach((b, i) => gsap.to(b, { scaleY: 0.25, duration: 0.35 + (i % 5) * 0.08, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.03 }));
}
initGameOverEgg($('.art-gameover'), waveBars, reduced);

/* ---------- Omer's clock in the nav ---------- */
// Always Omer's time in Toronto, whoever is reading. The status is a guess from that clock,
// not a presence signal: at CMiC in working hours (8:30 to 5 on weekdays), "probably
// committing" late at night (what the commit hours say), off the clock otherwise.
const clockTime = $('#clockTime'), clockDot = $('#clockDot'), clockStatus = $('#clockStatus');
const tFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' });
const tParts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23', timeZone: 'America/Toronto' });
function tick() {
  const now = new Date();
  clockTime.textContent = tFmt.format(now);
  const part = (t: string) => tParts.formatToParts(now).find((p) => p.type === t)?.value ?? '';
  const mins = Number(part('hour')) * 60 + Number(part('minute'));
  const weekday = !['Sat', 'Sun'].includes(part('weekday'));
  const night = mins >= 22 * 60 || mins < 5 * 60;
  const work = weekday && mins >= 8 * 60 + 30 && mins < 17 * 60;
  clockDot.classList.toggle('is-night', night);
  clockStatus.textContent = night ? '· probably committing' : work ? '· at CMiC' : '· off the clock';
}
tick();
setInterval(tick, 20000);

/* ---------- Nav behaviour ---------- */
const nav = $('#nav');
let lastY = 0;
const onScroll = (y: number) => {
  nav.classList.toggle('is-scrolled', y > 40);
  nav.classList.toggle('is-hidden', y > lastY && y > 400);
  lastY = y;
};
if (lenis) lenis.on('scroll', (l: Lenis) => onScroll(l.scroll));
else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });

/* ---------- Copy email ---------- */
const copyBtn = $<HTMLButtonElement>('#copyEmail');
copyBtn.addEventListener('click', async () => {
  const addr = $('#emailAddr').textContent ?? '';
  try {
    await navigator.clipboard.writeText(addr);
    copyBtn.textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#emailAddr'));
    const sel = window.getSelection();
    sel?.removeAllRanges(); sel?.addRange(range);
    copyBtn.textContent = 'Selected, press ⌘C';
  }
  setTimeout(() => (copyBtn.textContent = 'Copy'), 2200);
});

/* ---------- Cursor + magnetic ---------- */
if (finePointer && !reduced) {
  const cur = $('#cursor'), label = $('#cursorLabel');
  const xTo = gsap.quickTo(cur, 'x', { duration: 0.18, ease: 'power3' });
  const yTo = gsap.quickTo(cur, 'y', { duration: 0.18, ease: 'power3' });
  window.addEventListener('pointermove', (e) => { xTo(e.clientX); yTo(e.clientY); cur.classList.add('is-on'); }, { passive: true });
  document.addEventListener('pointerleave', () => cur.classList.remove('is-on'));
  // Delegated, so it covers elements the easter eggs create later, and nested labels
  // (the pitch says "Shoot" inside a card that says "View") resolve to the innermost one.
  // A link inside a labelled area shows the hover ring instead of the label.
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    const hov = t.closest('a, button');
    const lab = t.closest<HTMLElement>('[data-cursor]');
    // An empty data-cursor switches a parent's label off (the pitch, where it would hide the goal).
    const labelled = !!lab?.dataset.cursor && !(hov && hov !== lab && lab.contains(hov));
    if (labelled) label.textContent = lab!.dataset.cursor!;
    cur.classList.toggle('is-label', labelled);
    cur.classList.toggle('is-hover', !!hov && !labelled);
  });

  $$('.magnetic').forEach((n) => {
    const x = gsap.quickTo(n, 'x', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    const y = gsap.quickTo(n, 'y', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    n.addEventListener('pointermove', (e) => {
      const r = n.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.35);
      y((e.clientY - (r.top + r.height / 2)) * 0.35);
    });
    n.addEventListener('pointerleave', () => { x(0); y(0); });
  });

  // Project art tilts toward the cursor.
  $$('.project__art').forEach((art) => {
    // Nothing you type into or play with moves under the cursor: Athena's card and the
    // GameOver player stay put.
    const items = $$('.tilt, .gd-ticket, .bd-card', art);
    art.addEventListener('pointermove', (e) => {
      if (art.classList.contains('is-playing')) return;
      const r = art.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      items.forEach((it, i) => gsap.to(it, { x: px * (18 + i * 8), y: py * (14 + i * 6), duration: 0.8, ease: 'power3.out' }));
    });
    art.addEventListener('pointerleave', () => { if (!art.classList.contains('is-playing')) items.forEach((it) => gsap.to(it, { x: 0, y: 0, duration: 1, ease: 'power3.out' })); });
  });
}

/* ---------- Scroll choreography ---------- */
if (!reduced) {

  // Section titles rise in by word.
  $$('.reveal-title').forEach((t) => {
    const words = t.innerHTML.trim().split(/\s+(?![^<]*<\/em>)/);
    t.innerHTML = words.map((w) => `<span style="display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:0.08em"><span class="w" style="display:inline-block">${w}</span></span>`).join(' ');
    gsap.from($$('.w', t), { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: t, start: 'top 85%' } });
  });
  $$('.section-sub, .eyebrow').forEach((n) => {
    gsap.from(n, { y: 20, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: n, start: 'top 90%' } });
  });

  // Counters
  $$('.stat__num').forEach((n) => {
    const target = Number(n.dataset.count);
    const suffix = n.dataset.suffix ?? '';
    const o = { v: 0 };
    gsap.to(o, {
      v: target, duration: 2, ease: 'power3.out',
      scrollTrigger: { trigger: n, start: 'top 90%' },
      onUpdate: () => (n.textContent = Math.round(o.v).toLocaleString('en-CA') + suffix),
    });
  });
  gsap.from('.stat', { y: 40, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.stats', start: 'top 85%' } });

  // Marquee skews with scroll velocity.
  const skewTo = gsap.quickTo('.marquee__track', 'skewX', { duration: 0.4, ease: 'power3' });
  ScrollTrigger.create({ onUpdate: (st) => skewTo(gsap.utils.clamp(-12, 12, st.getVelocity() / -250)) });

  // The project deck (style.css, "Projects"). Each card sticks 14px lower than the one before,
  // so the ones you have passed show as a fan of edges; a card taller than the window sticks
  // with its bottom in view instead, so its links are never hidden. As the next card rises over
  // it, a card sinks back a little and dims, continuously, from the moment its bottom starts
  // being covered until the next card lands: no hold with nothing moving, no sudden dark.
  const cards = $$('.project');
  const mm = gsap.matchMedia();
  mm.add('(min-width: 961px)', () => {
    const top = (c: HTMLElement, i: number) => Math.min(88 + i * 14, window.innerHeight - $('.project__card', c).offsetHeight - 20);
    const place = () => cards.forEach((c, i) => { c.style.top = `${top(c, i)}px`; });
    place();
    ScrollTrigger.addEventListener('refreshInit', place);
    const shades = cards.map((c) => {
      const shade = document.createElement('i');
      shade.className = 'project__shade';
      $('.project__card', c).append(shade);
      return shade;
    });
    cards.forEach((card, i) => {
      if (i === cards.length - 1) return;
      const face = $('.project__card', card);
      gsap.timeline({
        scrollTrigger: {
          trigger: cards[i + 1], scrub: true, invalidateOnRefresh: true,
          start: () => `top ${top(card, i) + face.offsetHeight}px`,
          end: () => `top ${top(cards[i + 1], i + 1)}px`,
        },
      })
        .to(face, { scale: 0.94, ease: 'none' }, 0)
        .to(shades[i], { opacity: 0.6, ease: 'power1.in' }, 0);
    });
    return () => {
      ScrollTrigger.removeEventListener('refreshInit', place);
      cards.forEach((c) => { c.style.top = ''; });
      shades.forEach((sh) => sh.remove());
    };
  });
  cards.forEach((card) => {
    gsap.from($$('.project__name, .project__pitch, .project__desc, .project__bullets li, .project__stack, .project__links', card), {
      y: 30, opacity: 0, duration: 0.9, stagger: 0.06, ease: 'power3.out', scrollTrigger: { trigger: card, start: 'top 70%' },
    });
    // Easter-egg overlays (.egg-ui) are left out: a from-tween reads their resting opacity
    // while their CSS transitions are mid-flight and can record 0, leaving them invisible.
    gsap.from($$(':scope > :not(.egg-ui)', $('.project__art', card)), {
      scale: 0.85, opacity: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: card, start: 'top 70%' },
    });
  });
  const bl = $<SVGPathElement>('.bd-line');
  const blen = bl.getTotalLength();
  gsap.fromTo(bl, { strokeDasharray: blen, strokeDashoffset: blen }, { strokeDashoffset: 0, duration: 2.2, ease: 'power2.out', scrollTrigger: { trigger: '.art-budget', start: 'top 70%' } });
  gsap.from('.bd-band', { opacity: 0, duration: 1.5, delay: 0.8, scrollTrigger: { trigger: '.art-budget', start: 'top 70%' } });
  gsap.to('.phone--a', { y: -24, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to('.phone--b', { y: 20, duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });

  // Systems: the stage rises in; capabilities light up in a diagonal sweep.
  gsap.from('.sys__tabs, .sys__stage', { y: 40, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.sys__tabs', start: 'top 85%' } });
  ScrollTrigger.create({ trigger: '#capsMatrix', start: 'top 80%', once: true, onEnter: () => caps.reveal() });

  // Clock bars grow, heatmap fills week by week, language bars extend.
  clockBars.forEach((b) => {
    const len = Number(b.dataset.len);
    gsap.fromTo(b, { strokeDasharray: `0 ${len + 20}` }, { strokeDasharray: `${len} ${len + 20}`, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '#clock', start: 'top 80%' }, delay: Math.random() * 0.4 });
  });
  gsap.from(heatCells, { opacity: 0, scale: 0.2, transformOrigin: 'center', duration: 0.4, ease: 'back.out(2)', stagger: { amount: 1.6, from: 'start' }, scrollTrigger: { trigger: '#heatmap', start: 'top 85%' } });
  gsap.from(langBars, { scaleX: 0, duration: 1.4, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: '#langs', start: 'top 85%' } });
  gsap.from('.fact', { y: 30, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.facts', start: 'top 85%' } });

  // Journey: the career map plays its years in order, left to right, then the cards slide in
  // from the side the row scrolls toward.
  gsap.from(careerBars, { scaleX: 0, duration: 1.1, ease: 'expo.out', stagger: 0.18, scrollTrigger: { trigger: '#career', start: 'top 80%' } });
  gsap.from('.career__mile', { scale: 0, duration: 0.6, ease: 'back.out(2)', delay: 0.5, scrollTrigger: { trigger: '#career', start: 'top 80%' } });
  gsap.from('.role', { x: 80, opacity: 0, duration: 1.1, stagger: 0.09, ease: 'power3.out', scrollTrigger: { trigger: '#roles', start: 'top 85%' } });
  gsap.from('.journey__nav', { opacity: 0, duration: 0.8, delay: 0.3, scrollTrigger: { trigger: '.journey__head', start: 'top 85%' } });

  // About photo parallax, contact marquee speed.
  gsap.fromTo('.about__photo img', { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.about__copy p:not(.eyebrow), .about__links', { y: 30, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: '.about__copy', start: 'top 75%' } });
  gsap.from('.contact__title, .contact__email, .social', { y: 40, opacity: 0, duration: 1, stagger: 0.08, ease: 'power3.out', scrollTrigger: { trigger: '.contact__body', start: 'top 80%' } });
}

window.addEventListener('load', () => ScrollTrigger.refresh());
