import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';
import { createPlanet, type Planet } from './planet';
import { player } from '../audio';
import { meteorShower } from '../sky';

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
  if (!reduced && !still) {
    lenis?.stop();
    helloEl.hidden = false;
    const hello = splitWords(helloEl);
    gsap.set(hello, { yPercent: 110 });
    gsap.set(parts, { opacity: 0, y: 16 });
    gsap.set(words, { yPercent: 110 });
    gsap.set('.nav > *', { opacity: 0, y: -16 });
    document.documentElement.classList.remove('intro-pending');
    const tl = gsap.timeline({ onComplete: () => { title.classList.add('is-set'); lenis?.start(); } });
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
  }

  // ---------- scroll ----------
  // Leaving the hero, the words lift away and the planet sinks a little slower than the page.
  // Nothing is pinned: the old fly-through held the page still for most of a screen.
  if (!reduced) {
    const copy = $('.hero__copy');
    ScrollTrigger.create({
      trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true,
      onUpdate: (st) => {
        planet?.setScroll(st.progress);
        copy.style.opacity = String(1 - Math.min(1, st.progress * 1.5));
        copy.style.transform = `translateY(${-50 * st.progress}px)`;
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
