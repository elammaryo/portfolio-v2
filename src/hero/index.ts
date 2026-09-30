import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';
import type { CommitData } from '../repos';
import { createHero, type Hero } from './scene';
import type { ShapeId } from './shapes';
import { player } from '../audio';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll(s)] as T[];
// 12-hour with AM/PM: "03:37" on a 24-hour clock read as the afternoon.
const torontoTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Toronto' });
const torontoDate = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' });
const fmtHour = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

/**
 * The mug's caption is the fact that earns the headline: where the busiest late-night hour
 * ranks across the whole day (3 AM, second only to 5 PM, when this was written). Computed, so
 * it stays true as the data is refreshed; if night ever stops ranking, it falls back to the
 * share of commits pushed between 10 PM and 5 AM.
 */
function caffeineCaption(hours: number[]) {
  const order = hours.map((n, h) => ({ h, n })).sort((a, b) => b.n - a.n);
  const rank = order.findIndex((o) => o.h >= 22 || o.h < 5);
  const words = ['busiest', 'second-busiest', 'third-busiest'];
  if (rank >= 0 && rank < words.length) return `Caffeine · ${fmtHour(order[rank].h)} is my ${words[rank]} commit hour`;
  const total = hours.reduce((a, b) => a + b, 0) || 1;
  const night = [22, 23, 0, 1, 2, 3, 4].reduce((a, h) => a + hours[h], 0);
  return `Caffeine · ${Math.round((night / total) * 100)}% of my commits land between 10 PM and 5 AM`;
}

export async function initHeroSection(opts: { data: CommitData; reduced: boolean; lenis: Lenis | null }) {
  const { data, reduced, lenis } = opts;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const caffeine = caffeineCaption(data.hours);
  const CAPTIONS: Record<ShapeId, string> = {
    iced: caffeine,
    mug: caffeine,
    apps: 'Apps · SuperOver, live on the App Store and Google Play',
    systems: 'Systems · apps, APIs, data and the jobs between them',
    commits: 'Commits · all 2,062 since Oct 2024, one colour per project',
    me: 'Me · Florence, golden hour',
    hello: 'Hello · the inbox is open',
  };

  // Static HUD facts
  const last = data.commits[data.commits.length - 1];
  const lastD = new Date(last[1] * 1000);
  $('#lastPush').textContent = `${torontoDate.format(lastD)}, ${torontoTime.format(lastD)}`;
  $('#heroCount').textContent = data.stats.total.toLocaleString('en-CA');
  const caption = $('#shapeCaption');
  // The hot mug is the default (it reads as caffeine at a glance); ?coffee=iced starts on his
  // usual, and tapping the Caffeine chip while it's showing swaps the two.
  const first: ShapeId = new URLSearchParams(location.search).get('coffee') === 'iced' ? 'iced' : 'mug';
  let coffee: ShapeId = first;
  caption.textContent = CAPTIONS[first];
  const hint = $('#heroHint');
  const setHint = () => { hint.textContent = `${coffee === 'iced' ? 'swirl the ice' : 'stir the steam'} · ${touch ? 'tap' : 'click'} Caffeine again for ${coffee === 'iced' ? 'hot' : 'iced'}`; };
  setHint();

  let hero: Hero | null = null;
  const chips = $$<HTMLButtonElement>('.chip');
  chips.forEach((c) => { if (c.dataset.shape !== 'caffeine') c.disabled = true; });
  try {
    hero = await createHero({
      canvas: $('#heroCanvas'), data, reduced, first,
      onShapeReady: (id) => chips.forEach((c) => { if (c.dataset.shape === id) c.disabled = false; }),
      levels: () => (player?.playing ? player.levels() : null),
    });
    document.documentElement.classList.add('has-webgl');
  } catch (e) {
    console.warn('Hero falls back to type:', e);
    $('.hud__switch').hidden = true;
  }

  // ---------- shape control ----------
  let chosen: ShapeId = first;
  let introDone = reduced;
  const show = (id: ShapeId) => {
    if (!hero || !hero.has(id)) return;
    hero.setShape(id);
    if (caption.textContent !== CAPTIONS[id]) {
      gsap.fromTo(caption, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
      caption.textContent = CAPTIONS[id];
    }
  };
  // The beat chip: whatever shape is up pulses to the GameOver player.
  if (player && hero) {
    const p = player;
    const beat = document.createElement('button');
    beat.type = 'button';
    beat.className = 'chip chip--beat';
    beat.setAttribute('aria-pressed', 'false');
    beat.innerHTML = '<span aria-hidden="true">♪</span> Beat';
    $('.hud__chips').append(beat);
    let before = '';
    const sync = () => {
      beat.classList.toggle('is-active', p.playing);
      beat.setAttribute('aria-pressed', String(p.playing));
      if (p.playing) {
        if (!before) before = caption.textContent ?? '';
        const t = p.track;
        caption.textContent = `Beat · ${t.title} · the light is listening`;
      } else if (before) { caption.textContent = before; before = ''; }
    };
    beat.addEventListener('click', () => void p.toggle());
    p.on(sync);
  }
  chips.forEach((c) => c.addEventListener('click', () => {
    let id = c.dataset.shape as ShapeId | 'caffeine';
    if (id === 'caffeine') {
      const other: ShapeId = coffee === 'iced' ? 'mug' : 'iced';
      if (chosen === coffee && hero?.has(other)) { coffee = other; setHint(); }
      id = coffee;
    }
    chosen = id;
    chips.forEach((o) => { o.classList.toggle('is-active', o === c); o.setAttribute('aria-pressed', String(o === c)); });
    show(chosen);
  }));
  // Hovering the menu previews each section in light.
  const heroInView = () => window.scrollY < window.innerHeight * 0.5;
  let revert: number | undefined;
  const map: [string, ShapeId][] = [['.nav__links a[href="#work"]', 'apps'], ['.nav__links a[href="#systems"]', 'systems'], ['.nav__links a[href="#about"]', 'me'], ['.nav__cta', 'hello']];
  for (const [sel, id] of map) {
    const el = $(sel);
    if (!el) continue;
    el.addEventListener('pointerenter', () => {
      if (!introDone || !heroInView()) return;
      window.clearTimeout(revert);
      show(id);
    });
    el.addEventListener('pointerleave', () => {
      window.clearTimeout(revert);
      revert = window.setTimeout(() => { if (heroInView()) show(chosen); }, 280);
    });
  }

  // ---------- intro ----------
  const label = $('#heroIntroLabel');
  const hudParts = ['.hud__tr', '.hero__who', '.hud__thesis', '.hud__ctas', '.hud__switch'];
  const stillMode = new URLSearchParams(location.search).has('still');
  const title = $('#heroTitle');
  const words = splitWords(title);
  const helloEl = $('#heroHello');
  if (!reduced && hero && !stillMode) {
    lenis?.stop();
    // It opens by saying hello in the headline's own type, while the first commit bursts
    // and the coffee gathers; then the greeting lifts away and the headline rises into its
    // place, so the name gets its moment without having to be the headline.
    helloEl.hidden = false;
    const hello = splitWords(helloEl);
    gsap.set(hello, { yPercent: 110 });
    gsap.set(hudParts, { opacity: 0, y: 16 });
    gsap.set(words, { yPercent: 110 });
    gsap.set('.hud__frame i', { opacity: 0, scale: 0.4 });
    gsap.set('.nav > *', { opacity: 0, y: -16 });
    document.documentElement.classList.remove('intro-pending');
    const count = { v: 0 };
    const tl = gsap.timeline({ onComplete: () => { introDone = true; title.classList.add('is-set'); lenis?.start(); } });
    tl.add(hero.intro(), 0)
      .to(label, { opacity: 1, duration: 0.5 }, 0.05)
      .add(() => { label.textContent = 'brewing 0000 commits'; }, 0.6)
      .to(count, {
        v: data.stats.total, duration: 2.3, ease: 'power2.inOut',
        onUpdate: () => { label.textContent = `brewing ${String(Math.round(count.v)).padStart(4, '0')} commits`; },
      }, 0.6)
      .to(label, { opacity: 0, y: 10, duration: 0.6 }, 3.1)
      .to(hello, { yPercent: 0, duration: 0.95, ease: 'expo.out', stagger: 0.09 }, 0.2)
      .to(hello, { yPercent: -110, duration: 0.5, ease: 'power3.in', stagger: 0.04 }, 1.85)
      .add(() => { helloEl.hidden = true; }, 2.5)
      .to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07 }, 2.38)
      .to('.hud__frame i', { opacity: 1, scale: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, 2.7)
      .to(hudParts, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.09 }, 2.8)
      .to('.nav > *', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.05 }, 3.0);
  } else {
    label.remove();
    title.classList.add('is-set');
    introDone = true;
    document.documentElement.classList.remove('intro-pending');
  }

  // ---------- scroll: dissolve and fly through ----------
  if (!reduced && hero) {
    const h = hero;
    const hud = $('.hud');
    // The HUD fade is driven by the pin itself: a separate trigger on a pinned element
    // would be pushed below the pin's spacing and start too late.
    ScrollTrigger.create({
      trigger: '#hero', start: 'top top', end: '+=75%', pin: true, scrub: true,
      onUpdate: (st) => {
        h.setScroll(st.progress);
        const t = Math.min(1, st.progress / 0.3);
        hud.style.opacity = String(1 - t);
        hud.style.transform = `translateY(${-30 * t}px)`;
        hud.style.visibility = t >= 1 ? 'hidden' : 'visible';
        // A menu preview should not outlive the hero: settle back on the chosen shape.
        if (st.progress > 0.35 && h.shape !== chosen) show(chosen);
      },
    });
  }
  return hero;
}

/**
 * Wraps each word of the headline (and the + badge and the italic word, whole) in a clipped
 * span so the intro can raise them in one by one. Returns the inner spans to animate.
 */
function splitWords(title: HTMLElement) {
  const out: HTMLElement[] = [];
  const wrap = (node: Node) => {
    const outer = document.createElement('span');
    outer.className = 'hero__w';
    const inner = document.createElement('span');
    inner.append(node);
    outer.append(inner);
    out.push(inner);
    return outer;
  };
  const parts: Node[] = [];
  for (const n of [...title.childNodes]) {
    if (n.nodeType === Node.TEXT_NODE) {
      // Ordinary spaces only: a no-break space holds its neighbours together.
      (n.textContent ?? '').split(/([ \t\n\r]+)/).forEach((w) => {
        if (!w) return;
        parts.push(/^[ \t\n\r]+$/.test(w) ? document.createTextNode(' ') : wrap(document.createTextNode(w)));
      });
    } else parts.push(wrap(n));
  }
  title.replaceChildren(...parts);
  return out;
}
