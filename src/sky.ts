// The night sky behind the page: dim stars, a meteor every few seconds, and a shower when the
// contact section comes into view.
//
// Omer's first portfolio (elammaryo/cosmic-portfolio) had a starfield with meteors, and on
// 2026-10-01 he asked for it back. It returns quieter than it was: the stars hold still (drawn
// once, onto a canvas), only a dozen of them twinkle, and meteors come one at a time instead of
// four on a loop. The shower is kept for the end of the page, and for a tap on the hero's planet.
//
// It sits behind everything (z-index -1; html carries the page colour and body has none). The
// hero is transparent, so the planet hangs in this sky; the cards cover it and the open
// stretches between them show it. Meteors are elements moved by the Web Animations API,
// transform and opacity only, so they run on the compositor and nothing redraws the stars.
// Reduced motion keeps the stars and drops the meteors and twinkle.

/** One star per this many square pixels of window. The old site used 10,000, at 1–4px each. */
const STAR_AREA = 7000;
const TWINKLES = 14;
/** Seconds between meteors, at random within this range. */
const EVERY: [number, number] = [3.5, 8];

type Star = { u: number; v: number; r: number; a: number; halo: boolean; rgb: string };

let showerNow: ((force: boolean) => void) | null = null;
/**
 * A meteor shower. On its own the sky allows one every twenty seconds; `force` (a tap on the
 * planet) only waits for the last one to clear. Does nothing under reduced motion.
 */
export const meteorShower = (force = false) => showerNow?.(force);

let flightNow: ((swirl: number, warp: number, x: number, y: number) => void) | null = null;
/**
 * Drives the stars during the hero's flight: `swirl` and `warp` (0–1) about a centre in viewport
 * pixels (the planet). Both back at 0 lets them settle into the still sky. Nothing under reduced
 * motion.
 */
export const skyFlight = (swirl: number, warp: number, x: number, y: number) => flightNow?.(swirl, warp, x, y);

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
  const tws = document.createElement('div');
  tws.className = 'sky__tws';
  sky.append(tws);
  for (let i = 0; i < TWINKLES; i++) {
    const t = document.createElement('i');
    t.className = 'sky__tw';
    t.style.cssText = `left:${(rand() * 100).toFixed(2)}%;top:${(rand() * 100).toFixed(2)}%;--d:${(2.5 + rand() * 4).toFixed(2)}s;--dl:-${(rand() * 6).toFixed(2)}s`;
    tws.append(t);
  }

  let size = '', w = 0, h = 0, n = 0;
  const g = canvas.getContext('2d');
  /**
   * Draws the sky. `streak` (px, signed) stretches every star into a short line along the
   * scroll, longer for the bigger, nearer-looking stars: the warp while the page moves.
   */
  const paint = (streak = 0, still = 1) => {
    if (!g || !w || !h) return;
    const dpr = canvas.width / w;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round';
    g.globalAlpha = still;
    for (let i = 0; i < n; i++) {
      const s = pool[i], x = s.u * w, y = s.v * h;
      if (streak) {
        g.strokeStyle = `rgba(${s.rgb},${(s.a * 0.7).toFixed(3)})`;
        g.lineWidth = s.r * 1.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + streak * (0.35 + s.r * 0.6)); g.stroke();
      } else if (s.halo) {
        const glow = g.createRadialGradient(x, y, 0, x, y, s.r * 6);
        glow.addColorStop(0, `rgba(${s.rgb},${(s.a * 0.32).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${s.rgb},0)`);
        g.fillStyle = glow;
        g.beginPath(); g.arc(x, y, s.r * 6, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = `rgba(${s.rgb},${s.a.toFixed(3)})`;
      g.beginPath(); g.arc(x, y, s.r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  };
  const draw = () => {
    // The layer is 100lvh tall, so a phone's address bar coming and going doesn't resize it.
    const cw = sky.clientWidth, ch = sky.clientHeight;
    if (!cw || !ch || size === `${cw}x${ch}`) return;
    size = `${cw}x${ch}`; w = cw; h = ch;
    // 1.5x is plenty for dots this small, and a full-window canvas at 2x is a 20 MB texture.
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    n = Math.min(pool.length, Math.round((w * h) / STAR_AREA));
    paint();
  };
  draw();
  new ResizeObserver(draw).observe(sky);
  if (reduced) return;

  // Warp: a fast scroll stretches the stars into short streaks, as if the page were flying past
  // them, and they settle back to points when it stops. The canvas is only redrawn while the
  // page is moving; at rest it is the one still picture.
  let lastY = window.scrollY, lastT = 0, lastScroll = 0, vel = 0, warping = false;
  const warp = (t: number) => {
    const y = window.scrollY;
    const v = (y - lastY) / Math.max(8, t - lastT);
    lastY = y; lastT = t;
    vel += (v - vel) * 0.3;
    // Settled: slow enough, and no scroll for a moment (the first frame after a scroll event
    // reads no movement yet, so speed alone would stop it at once).
    if (flying) { warping = false; return; }
    if (Math.abs(vel) < 0.03 && t - lastScroll > 150) { vel = 0; warping = false; paint(); return; }
    paint(Math.max(-24, Math.min(24, vel * 7)));
    requestAnimationFrame(warp);
  };
  window.addEventListener('scroll', () => {
    lastScroll = performance.now();
    if (warping || flying || document.hidden) return;
    warping = true;
    lastY = window.scrollY; lastT = lastScroll;
    requestAnimationFrame(warp);
  }, { passive: true });

  // The flight out of the hero (hero/index.ts). The stars come loose from the still picture,
  // starting exactly where they were drawn: they swirl round the planet as it winds up (inner
  // ones faster, like a galaxy), then rush outward from it at warp speed as the camera dives,
  // and ease back into the still sky as the next section arrives. Each star is moved about the
  // planet's current position every frame, so when the planet glides to the middle of the
  // screen the vortex follows it without the whole sky sliding along.
  type Flyer = { x: number; y: number; px: number; py: number; z: number; r: number; a: number; rgb: string; age: number };
  let flyers: Flyer[] = [];
  let flying = false, lastF = 0;
  const aim = { swirl: 0, warp: 0, x: 0, y: 0 };
  const cur = { swirl: 0, warp: 0 };
  const seed = () => {
    flyers = [];
    for (let i = 0; i < Math.min(pool.length, Math.max(n, 420)); i++) {
      const s = pool[i], x = s.u * w, y = s.v * h;
      flyers.push({ x, y, px: x, py: y, z: Math.min(1, 0.35 + (s.r - 0.35) * 0.75), r: s.r, a: s.a, rgb: s.rgb, age: 9 });
    }
  };
  const fly = (t: number) => {
    if (!g) return;
    const dt = Math.min(0.05, Math.max(0.001, (t - lastF) / 1000));
    lastF = t;
    // Eased toward the scroll's values at the same pace whatever the display's frame rate.
    cur.swirl += (aim.swirl - cur.swirl) * (1 - Math.pow(0.92, dt * 60));
    cur.warp += (aim.warp - cur.warp) * (1 - Math.pow(0.93, dt * 60));
    const live = Math.min(1, Math.max(cur.swirl, cur.warp) * 1.8);
    if (live < 0.01 && !aim.swirl && !aim.warp) { flying = false; flyers = []; tws.style.opacity = ''; paint(); return; }
    const R = Math.hypot(w, h) * 0.62;
    const k = 0.05 + cur.warp * 0.06;
    paint(0, 1 - live);
    tws.style.opacity = String(1 - live);
    g.lineCap = 'round';
    for (const f of flyers) {
      let dx = f.x - aim.x, dy = f.y - aim.y;
      const r = Math.hypot(dx, dy) || 1;
      // Swirl: turn about the planet, quicker near it.
      const turn = cur.swirl * dt * (1.35 / (0.3 + r / R)) * (0.7 + f.z * 0.5);
      const c = Math.cos(turn), sn = Math.sin(turn);
      [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
      // Warp: rush outward, quicker the further out (things nearer the camera pass faster).
      const grow = (cur.warp * dt * (r * 2.2 + 80) * (0.55 + f.z * 0.8)) / r;
      dx *= 1 + grow; dy *= 1 + grow;
      f.px = f.x; f.py = f.y;
      f.x = aim.x + dx; f.y = aim.y + dy;
      if (r > R) {
        // Gone past the edge: a new star comes into view anywhere in the field, faint at first,
        // as a far one would. (Brought back near the centre, they piled up into a bright knot
        // there: a star moves slowest at the centre, so that is where they collect.)
        const a = Math.random() * Math.PI * 2, rr = R * 0.9 * Math.sqrt(Math.random());
        f.x = f.px = aim.x + Math.cos(a) * rr; f.y = f.py = aim.y + Math.sin(a) * rr;
        f.age = 0;
        continue;
      }
      f.age += dt;
      // The streak is the star's last few hundredths of a second of travel.
      const vx = (f.x - f.px) / dt, vy = (f.y - f.py) / dt;
      g.globalAlpha = live * f.a * (0.55 + f.z * 0.45) * Math.min(1, f.age / 0.35);
      g.strokeStyle = `rgb(${f.rgb})`;
      g.lineWidth = f.r * (1.3 + cur.warp * 0.9);
      g.beginPath(); g.moveTo(f.x - vx * k, f.y - vy * k); g.lineTo(f.x, f.y); g.stroke();
    }
    g.globalAlpha = 1;
    requestAnimationFrame(fly);
  };
  flightNow = (swirl, warpv, x, y) => {
    aim.swirl = swirl; aim.warp = warpv; aim.x = x; aim.y = y;
    if ((swirl > 0 || warpv > 0) && !flying && !document.hidden) {
      flying = true; seed(); lastF = performance.now();
      requestAnimationFrame(fly);
    }
  };

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

  // The first waits until the hero's intro is over, so nothing crosses the greeting. A hidden
  // tab gets none.
  const ambient = (wait: number) => window.setTimeout(() => {
    if (!document.hidden) {
      meteor();
      if (Math.random() < 0.2) window.setTimeout(() => meteor(), 300 + Math.random() * 500);
    }
    ambient((EVERY[0] + Math.random() * (EVERY[1] - EVERY[0])) * 1000);
  }, wait);
  ambient(5200);

  // The shower: ten meteors in under three seconds as the contact section arrives, at most once
  // every twenty seconds however often you scroll back and forth past it.
  let lastShower = -Infinity;
  const shower = (force = false) => {
    const now = performance.now();
    if (document.hidden || now - lastShower < (force ? 2600 : 20000)) return;
    lastShower = now;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = 0; i < 10; i++) {
      window.setTimeout(() => meteor({ x: Math.random() * w * 0.85 - w * 0.12, y: Math.random() * h * 0.42 - 30 }, 0.9 + Math.random() * 0.45), i * 230 + Math.random() * 180);
    }
  };
  showerNow = shower;
  const contact = document.querySelector('#contact');
  if (contact) new IntersectionObserver(([e]) => { if (e.isIntersecting) shower(); }, { rootMargin: '0px 0px -40% 0px' }).observe(contact);
}
