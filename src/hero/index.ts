import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';
import { createPlanet, type Planet } from './planet';
import { player } from '../audio';
import { meteorShower, skyFlight } from '../sky';

/** How long the hero holds for its flight out, in screens of scrolling. */
const FLIGHT = 1.4;
const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;

/**
 * The hero: the headline on the left, the planet on the right (planet.ts). It opens by saying
 * hello in the headline's own type while dawn comes up on the planet and the two words write
 * themselves round their orbits; then the greeting lifts away and the headline rises in.
 */
export async function initHeroSection(opts: { reduced: boolean; lenis: Lenis | null }) {
  const { reduced, lenis } = opts;
  // ?still starts with everything in place and no intro (screenshots).
  const still = new URLSearchParams(location.search).has('still');
  let planet: Planet | null = null;
  try {
    planet = await createPlanet({
      canvas: $<HTMLCanvasElement>('#heroCanvas'), reduced, formed: still,
      levels: () => (player?.playing ? player.levels() : null),
      // Tapping the planet calls up the old site's meteor shower.
      onTap: () => meteorShower(true),
    });
    document.documentElement.classList.add('has-webgl');
  } catch (e) {
    console.warn('The hero falls back to the flat planet:', e);
    document.documentElement.classList.add('no-webgl');
  }

  // ---------- intro ----------
  const title = $('#heroTitle');
  const words = splitWords(title);
  const helloEl = $('#heroHello');
  const parts = ['.hero__who', '.hero__thesis', '.hero__ctas', '.orbit__caption', '.hero__cue'];
  // The first moments of the flight: the headline comes apart. Each word lifts at its own speed
  // and turns a little as it fades; higher lines lift faster than lower ones, so the copy fans
  // out upward and no line slides into another. A paused timeline that the pin below plays
  // through its first 30%. Built only once the intro is over, since the intro animates some of
  // the same elements and a timeline built mid-intro would keep their half-faded values.
  let exit: gsap.core.Timeline | null = null;
  let lastT = 0;
  const armExit = () => {
    if (reduced) return;
    const outer = [...title.querySelectorAll<HTMLElement>(':scope > .hero__w')];
    const tops = [...new Set(outer.map((w) => w.offsetTop))].sort((a, b) => a - b);
    const lift = outer.map((w, i) => 80 + (tops.length - 1 - tops.indexOf(w.offsetTop)) * 42 + (((i * 7) % 5) - 2) * 8);
    const top = 80 + tops.length * 42;
    exit = gsap.timeline({ paused: true })
      .to(outer, { y: (i) => -lift[i], rotation: (i) => ((i % 3) - 1) * 2.5, ease: 'none', duration: 1 }, 0)
      .to(outer, { opacity: 0, ease: 'power1.in', duration: 0.62 }, 0)
      .to('.hero__who', { y: -(top + 30), opacity: 0, ease: 'none', duration: 0.5 }, 0)
      .to('.hero__thesis', { y: -48, opacity: 0, ease: 'none', duration: 0.55 }, 0)
      .to('.hero__ctas', { y: -24, opacity: 0, ease: 'none', duration: 0.55 }, 0)
      .to('.orbit__caption', { y: -16, opacity: 0, ease: 'none', duration: 0.3 }, 0)
      .to('.hero__cue', { opacity: 0, ease: 'none', duration: 0.2 }, 0);
    exit.progress(Math.min(1, lastT / 0.3));
  };

  if (!reduced && !still) {
    lenis?.stop();
    helloEl.hidden = false;
    const hello = splitWords(helloEl);
    gsap.set(hello, { yPercent: 110 });
    gsap.set(parts, { opacity: 0, y: 16 });
    gsap.set(words, { yPercent: 110 });
    gsap.set('.nav > *', { opacity: 0, y: -16 });
    document.documentElement.classList.remove('intro-pending');
    const tl = gsap.timeline({ onComplete: () => { title.classList.add('is-set'); lenis?.start(); armExit(); } });
    if (planet) tl.add(planet.intro(), 0);
    else tl.fromTo('.orbit-flat', { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 1.6, ease: 'power3.out' }, 0.3);
    tl.to(hello, { yPercent: 0, duration: 0.95, ease: 'expo.out', stagger: 0.09 }, 0.2)
      .to(hello, { yPercent: -110, duration: 0.5, ease: 'power3.in', stagger: 0.04 }, 1.75)
      .add(() => { helloEl.hidden = true; }, 2.4)
      .to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07 }, 2.25)
      .to(parts, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.09 }, 2.65)
      .to('.nav > *', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.05 }, 2.85);
  } else {
    title.classList.add('is-set');
    document.documentElement.classList.remove('intro-pending');
    armExit();
  }

  // ---------- the flight out ----------
  // Scrolling down from the hero holds it for FLIGHT screens while a scrubbed sequence plays (it
  // runs backwards on the way up): the headline comes apart, the planet glides to the middle and
  // spins up while the stars swirl round it, the camera swings round to the night side and dives
  // through the rings at the lamps as the stars go to warp, and the flight lands in the next
  // section. Every scroll moves something, so the hold never reads as the page stalling.
  // planet.ts and sky.ts have the details. Reduced motion skips all of it: no hold, the hero
  // scrolls away.
  if (!reduced) {
    const flat = $('.orbit-flat');
    const stage = $('.hero__stage');
    ScrollTrigger.create({
      trigger: '#hero', start: 'top top', end: () => `+=${Math.round(window.innerHeight * FLIGHT)}`,
      pin: true, anticipatePin: 1, invalidateOnRefresh: true,
      onUpdate: (st) => {
        const t = (lastT = st.progress);
        exit?.progress(Math.min(1, t / 0.3));
        planet?.setFlight(t, st.getVelocity());
        if (!planet) flat.style.opacity = String(1 - ss(0.3, 0.7, t));
        const r = stage.getBoundingClientRect();
        const c = planet?.centre() ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        skyFlight(ss(0.04, 0.42, t) * (1 - ss(0.62, 0.82, t)), ss(0.6, 0.82, t) * (1 - ss(0.93, 1, t)), c.x, c.y);
      },
    });
  }
  return planet;
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
