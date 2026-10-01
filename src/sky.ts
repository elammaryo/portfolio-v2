// The night sky behind the page: dim stars, a meteor every few seconds, and a shower when the
// contact section comes into view.
//
// Omer's first portfolio (elammaryo/cosmic-portfolio) had a starfield with meteors, and on
// 2026-10-01 he asked for it back. It returns quieter than it was: this page already has the
// particle hero and the beat-reactive mug, so the stars hold still (drawn once, onto a canvas),
// only a dozen of them twinkle, and meteors come one at a time instead of four on a loop. The
// shower is kept for the end of the page.
//
// It sits behind everything (z-index -1; html carries the page colour and body has none), so the
// hero and the cards cover it and the open stretches between them show it. Meteors are elements
// moved by the Web Animations API, transform and opacity only, so they run on the compositor and
// nothing redraws the stars. Reduced motion keeps the stars and drops the meteors and twinkle.

/** One star per this many square pixels of window. The old site used 10,000, at 1–4px each. */
const STAR_AREA = 7000;
const TWINKLES = 14;
/** Seconds between meteors, at random within this range. */
const EVERY: [number, number] = [3.5, 8];

type Star = { u: number; v: number; r: number; a: number; halo: boolean; rgb: string };

// A seeded generator, so a resize redraws the same sky rather than a new one.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function initSky({ reduced }: { reduced: boolean }) {
  const sky = document.createElement('div');
  sky.className = 'sky';
  sky.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  sky.append(canvas);
  document.body.prepend(sky);

  const rand = seeded(1729);
  // Mostly starlight white, a few violet and a few warm, like the page's own two accents.
  const pool: Star[] = Array.from({ length: 900 }, () => {
    const big = rand() < 0.09, k = rand();
    return {
      u: rand(), v: rand(),
      r: big ? 0.85 + rand() * 0.55 : 0.35 + rand() * 0.5,
      a: big ? 0.55 + rand() * 0.35 : 0.2 + rand() * 0.45,
      halo: big,
      rgb: k < 0.12 ? '201,184,255' : k < 0.19 ? '255,214,170' : '237,235,245',
    };
  });
  for (let i = 0; i < TWINKLES; i++) {
    const t = document.createElement('i');
    t.className = 'sky__tw';
    t.style.cssText = `left:${(rand() * 100).toFixed(2)}%;top:${(rand() * 100).toFixed(2)}%;--d:${(2.5 + rand() * 4).toFixed(2)}s;--dl:-${(rand() * 6).toFixed(2)}s`;
    sky.append(t);
  }

  let drawn = '';
  const draw = () => {
    // The layer is 100lvh tall, so a phone's address bar coming and going doesn't resize it.
    const w = sky.clientWidth, h = sky.clientHeight;
    if (!w || !h || drawn === `${w}x${h}`) return;
    drawn = `${w}x${h}`;
    // 1.5x is plenty for dots this small, and a full-window canvas at 2x is a 20 MB texture.
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const n = Math.min(pool.length, Math.round((w * h) / STAR_AREA));
    for (let i = 0; i < n; i++) {
      const s = pool[i], x = s.u * w, y = s.v * h;
      if (s.halo) {
        const glow = g.createRadialGradient(x, y, 0, x, y, s.r * 6);
        glow.addColorStop(0, `rgba(${s.rgb},${(s.a * 0.32).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${s.rgb},0)`);
        g.fillStyle = glow;
        g.beginPath(); g.arc(x, y, s.r * 6, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = `rgba(${s.rgb},${s.a.toFixed(3)})`;
      g.beginPath(); g.arc(x, y, s.r, 0, Math.PI * 2); g.fill();
    }
  };
  draw();
  new ResizeObserver(draw).observe(sky);
  if (reduced) return;

  // A meteor falls right and down at about 35°, as on the old site, its bright head first and
  // the tail fading behind. It brightens as it goes and then is gone.
  const meteor = (at?: { x: number; y: number }, scale = 1) => {
    const w = window.innerWidth, h = window.innerHeight;
    const el = document.createElement('i');
    el.className = 'meteor';
    el.style.width = `${Math.round((70 + Math.random() * 90) * scale)}px`;
    sky.append(el);
    const ang = 29 + Math.random() * 12, rad = (ang * Math.PI) / 180;
    const dist = (420 + Math.random() * 280) * scale;
    const x0 = at?.x ?? Math.random() * w * 0.9 - w * 0.08;
    const y0 = at?.y ?? Math.random() * h * 0.5 - 20;
    const x1 = x0 + Math.cos(rad) * dist, y1 = y0 + Math.sin(rad) * dist;
    // Turned to face back along its path, so the tail trails the head.
    const turn = `rotate(${ang + 180}deg)`;
    const run = el.animate([
      { transform: `translate(${x0}px, ${y0}px) ${turn}`, opacity: 0 },
      { opacity: 1, offset: 0.62 },
      { transform: `translate(${x1}px, ${y1}px) ${turn}`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 900, easing: 'linear' });
    run.onfinish = () => el.remove();
    run.oncancel = () => el.remove();
  };

  // Behind the hero there is nothing to see (it covers the sky), and a hidden tab needs none.
  let heroShown = 1;
  const hero = document.querySelector('#hero');
  if (hero) new IntersectionObserver(([e]) => { heroShown = e.intersectionRatio; }, { threshold: [0, 0.3, 0.6, 1] }).observe(hero);
  const ambient = () => window.setTimeout(() => {
    if (!document.hidden && heroShown < 0.6) {
      meteor();
      if (Math.random() < 0.2) window.setTimeout(() => meteor(), 300 + Math.random() * 500);
    }
    ambient();
  }, (EVERY[0] + Math.random() * (EVERY[1] - EVERY[0])) * 1000);
  ambient();

  // The shower: ten meteors in under three seconds as the contact section arrives, at most once
  // every twenty seconds however often you scroll back and forth past it.
  let lastShower = -Infinity;
  const shower = () => {
    const now = performance.now();
    if (document.hidden || now - lastShower < 20000) return;
    lastShower = now;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = 0; i < 10; i++) {
      window.setTimeout(() => meteor({ x: Math.random() * w * 0.85 - w * 0.12, y: Math.random() * h * 0.42 - 30 }, 0.9 + Math.random() * 0.45), i * 230 + Math.random() * 180);
    }
  };
  const contact = document.querySelector('#contact');
  if (contact) new IntersectionObserver(([e]) => { if (e.isIntersecting) shower(); }, { rootMargin: '0px 0px -40% 0px' }).observe(contact);
}
