import { fmtTime, player } from '../audio';

// GameOver's card: its title screen in miniature, and an easter egg (the player plays).
//
// The art follows gameover.studio since its refresh (2026-09-30), which Omer asked the card to
// match on 2026-10-02: ink, the chrome G, the GAMEOVER title in its cyan-violet-magenta, an
// arcade HUD in Silkscreen, and behind it the LED wall, which is the site's old aurora shader
// sampled once per cell and lit as LEDs (gameover's app/components/Backdrop.tsx). Here the wall
// is a 2D canvas following the same recipe at the same 30 frames a second, drawn only while the
// card is on screen and not covered by the next card in the deck.
//
// Press play and the card's player runs the page's one audio player (audio.ts): the wall pumps
// with each kick and its lower edge follows the spectrum, bass on the left; the G bounces on the
// kick and flips like a coin every four bars, as the real one does. A small pill keeps the beat
// controllable anywhere on the page, like GameOver's own player, which keeps going between pages.

/** gameover's home theme (lib/theme.ts): the wall runs cyan, pink, violet from left to right. */
const STOPS = ['#00D4FF', '#EC4899', '#A855F7'];
const RIPPLE_LIFE = 1.1;

const ICON = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 3h2.6v10H4.2zM9.2 3h2.6v10H9.2z"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.4v9.2L9.6 8zM10.6 3.4h2.2v9.2h-2.2z"/></svg>',
};

const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const fract = (x: number) => x - Math.floor(x);

// Gradient noise for the aurora's edge (the shader uses simplex; any smooth noise reads the same
// once it is cut into LEDs).
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 7;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  return Uint8Array.from([...p, ...p]);
})();
const grad = (h: number, x: number, y: number) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
const ease5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function noise(x: number, y: number) {
  const fx = Math.floor(x), fy = Math.floor(y);
  const xi = fx & 255, yi = fy & 255, xf = x - fx, yf = y - fy;
  const u = ease5(xf), v = ease5(yf);
  const aa = PERM[PERM[xi] + yi], ab = PERM[PERM[xi] + yi + 1], ba = PERM[PERM[xi + 1] + yi], bb = PERM[PERM[xi + 1] + yi + 1];
  const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
  const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
  return x1 + v * (x2 - x1);
}
/** A fixed random number per LED, for the ones that blink on their own. */
const hash = (c: number, r: number) => fract(Math.sin(c * 12.9898 + r * 78.233) * 43758.5453);

type Frame = { dt: number; spectrum: Uint8Array | null; kick: number; high: number; playing: boolean };

/**
 * The LED wall. Each column's aurora is a height field (Backdrop.tsx's, per column instead of
 * per pixel): brightest at the top, fading down to a wavy edge, cut into five brightness steps.
 * LEDs are drawn white in one path per step, then coloured in one pass with the wall's gradient
 * ('source-in'), so a frame is six fills however many LEDs are lit.
 */
function ledWall(canvas: HTMLCanvasElement, art: HTMLElement) {
  const g = canvas.getContext('2d');
  if (!g) return null;
  let W = 0, H = 0, dpr = 1, cell = 8, cols = 0, rows = 0, size = '';
  let panel: HTMLCanvasElement | null = null;
  let ramp: CanvasGradient | null = null;
  /** The spectrum per column, smoothed: how far it pulls that column's edge down. */
  let edge = new Float32Array(0);
  /** A fixed random number per LED (for the ones that blink on their own), made once per size. */
  let seeds = new Float32Array(0);
  const steps: number[][] = [[], [], [], [], [], []];
  const ripples: { x: number; y: number; born: number }[] = [];
  let clock = 12, energy = 0;

  const resize = () => {
    const w = art.clientWidth, h = art.clientHeight;
    if (!w || !h) return false;
    if (size === `${w}x${h}`) return true;
    size = `${w}x${h}`; W = w; H = h;
    // 1.5x is plenty for LEDs this size, as on the site.
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    cell = w < 480 ? 7 : 8;
    cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
    edge = new Float32Array(cols);
    seeds = Float32Array.from({ length: cols * rows }, (_, i) => hash(Math.floor(i / rows), i % rows));
    ramp = g.createLinearGradient(0, 0, W, 0);
    STOPS.forEach((c, i) => ramp!.addColorStop(i / (STOPS.length - 1), c));
    // The unlit panel, drawn once: faint LEDs everywhere, so the grid reads where the aurora isn't.
    panel = document.createElement('canvas');
    panel.width = canvas.width; panel.height = canvas.height;
    const p = panel.getContext('2d')!;
    p.scale(dpr, dpr);
    const s = cell * 0.48, o = (cell - s) / 2;
    for (let r = 0; r < rows; r++) {
      const a = 0.055 * smooth(0.1, 1, 1 - (r + 0.5) / rows);
      if (a < 0.004) continue;
      p.fillStyle = `rgba(243,240,234,${a.toFixed(3)})`;
      for (let c = 0; c < cols; c++) p.fillRect(c * cell + o, r * cell + o, s, s);
    }
    return true;
  };

  const draw = ({ dt, spectrum, kick, high, playing }: Frame) => {
    if (!resize() || !ramp) return;
    energy += ((playing ? 1 : 0) - energy) * 0.06;
    clock += dt * (0.32 + energy * 0.38);
    // The spectrum in bands two LEDs wide, log-spaced so the bass doesn't take every column, and
    // tilted toward the top end (beats are bass-heavy and the low bands sat at full).
    if (spectrum) {
      const bands = Math.ceil(cols / 2), top = spectrum.length / 8;
      for (let i = 0; i < bands; i++) {
        const a = Math.floor(2 * Math.pow(top, i / bands)), b = Math.max(a + 1, Math.floor(2 * Math.pow(top, (i + 1) / bands)));
        let sum = 0;
        for (let k = a; k < b; k++) sum += spectrum[k];
        const v = (sum / (b - a) / 255) * (0.6 + (1.0 * i) / bands);
        const goal = Math.min(1, v * v * 1.5);
        for (const c of [i * 2, i * 2 + 1]) if (c < cols) edge[c] += (goal - edge[c]) * (goal > edge[c] ? 0.6 : 0.18);
      }
    } else for (let c = 0; c < cols; c++) edge[c] *= 0.82;

    const now = performance.now();
    for (let i = ripples.length - 1; i >= 0; i--) if ((now - ripples[i].born) / 1000 > RIPPLE_LIFE) ripples.splice(i, 1);
    const rings = ripples.map((q) => {
      const k = (now - q.born) / 1000 / RIPPLE_LIFE;
      return { x: q.x, y: q.y, rad: (1 - (1 - Math.min(k * 1.6, 1)) ** 2) * 520, str: (1 - k) ** 2 };
    });
    for (const st of steps) st.length = 0;
    const amp = 1 + energy * 0.45, blinkAt = 0.992 - energy * 0.012 - high * 0.006;
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols;
      // The aurora's height field (Backdrop.tsx), and the music pulling the edge down.
      const e = Math.exp(noise(u * 2 + clock * 0.1, clock * 0.25) * 0.5 * amp) - edge[c] * 0.95;
      const x = c * cell;
      for (let r = 0; r < rows; r++) {
        const v = 1 - (r + 0.5) / rows;
        const intensity = 0.6 * (v * 2 - e + 0.2);
        let level = Math.min(1, Math.max(0, intensity * smooth(-0.1, 0.5, intensity)));
        // A few LEDs blink on their own, more while music plays.
        if (v > 0.3) { const h = seeds[c * rows + r]; if (fract(h * 7 + clock * (0.03 + h * 0.05)) > blinkAt) level = Math.max(level, 0.5 * smooth(0.3, 0.95, v)); }
        // Rings of light spreading from a click.
        for (const q of rings) {
          const ring = Math.abs(Math.hypot(x + cell / 2 - q.x, r * cell + cell / 2 - q.y) - q.rad);
          if (ring < cell * 2.4) level = Math.max(level, Math.round(q.str * (1 - smooth(0, cell * 2.4, ring)) * 4) / 4);
        }
        const k = Math.round(level * 5);
        if (k > 0) steps[k].push(x, r * cell);
      }
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    // The kick pumps the whole wall, brighter and a touch bigger.
    const gain = (0.8 + energy * 0.2) * (1 + 0.55 * kick);
    g.fillStyle = '#fff';
    for (let k = 1; k <= 5; k++) {
      const pts = steps[k];
      if (!pts.length) continue;
      const lv = Math.min(1, (k / 5) * gain);
      const s = cell * (0.48 + 0.2 * lv + 0.08 * kick), o = (cell - s) / 2;
      g.globalAlpha = lv;
      g.beginPath();
      for (let i = 0; i < pts.length; i += 2) g.rect(pts[i] + o, pts[i + 1] + o, s, s);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = ramp;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (panel) g.drawImage(panel, 0, 0);
    g.globalCompositeOperation = 'source-over';
  };

  return {
    draw,
    /** A ring of light from a point on the card (client pixels). */
    ripple(clientX: number, clientY: number) {
      const r = art.getBoundingClientRect();
      ripples.push({ x: clientX - r.left, y: clientY - r.top, born: performance.now() });
      if (ripples.length > 4) ripples.shift();
    },
  };
}

export function initGameOver(art: HTMLElement, reduced: boolean) {
  const wall = ledWall(art.querySelector<HTMLCanvasElement>('.go-leds')!, art);
  const gIcon = art.querySelector<HTMLElement>('.go-g')!;
  const card = art.closest<HTMLElement>('.project');
  const next = card?.nextElementSibling as HTMLElement | null;

  // Reduced motion: one still frame of the wall, redrawn on resize, and nothing moves.
  const still = () => wall?.draw({ dt: 0, spectrum: null, kick: 0, high: 0, playing: false });
  if (reduced) {
    still();
    new ResizeObserver(still).observe(art);
  }

  // The G flips like a coin when you point at it, as the real one does.
  let flipping = false;
  const flip = () => {
    if (reduced || flipping) return;
    flipping = true;
    gIcon.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }], { duration: 950, easing: 'cubic-bezier(.2, 1.45, .42, 1)' })
      .onfinish = () => { flipping = false; };
  };
  gIcon.addEventListener('pointerenter', flip);
  // And leans toward the pointer a little.
  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    // (The rotate property turns a fixed angle about a normalised axis, so the angle is set too.)
    art.addEventListener('pointermove', (e) => {
      const r = gIcon.getBoundingClientRect();
      const span = Math.max(240, art.clientWidth * 0.6);
      const lx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / span));
      const ly = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / span));
      gIcon.style.setProperty('--lx', lx.toFixed(3));
      gIcon.style.setProperty('--ly', ly.toFixed(3));
      gIcon.style.setProperty('--la', (Math.min(1, Math.hypot(lx, ly)) * 14).toFixed(2));
    });
    art.addEventListener('pointerleave', () => { ['--lx', '--ly', '--la'].forEach((k) => gIcon.style.removeProperty(k)); });
  }
  // Clicks send rings through the wall (clicks, not presses: a touch that scrolls shouldn't).
  if (!reduced) art.addEventListener('click', (e) => {
    if (e.detail === 0 && e.target instanceof Element) { const r = e.target.getBoundingClientRect(); wall?.ripple(r.left + r.width / 2, r.top + r.height / 2); }
    else wall?.ripple(e.clientX, e.clientY);
    wake();
  });

  // ---------- the egg: the player plays ----------
  const p = player;
  const bar = art.querySelector<HTMLElement>('.go-player')!;
  const start = art.querySelector<HTMLElement>('.go-start')!;
  const hudN = art.querySelector<HTMLElement>('.go-hud-n')!;
  const hudBpm = art.querySelector<HTMLElement>('.go-hud-bpm')!;
  let sync = () => {};
  let pill: HTMLElement | null = null;
  if (p) {
    bar.innerHTML = `
      <button type="button" class="go-play" aria-label="Play">${ICON.play}</button>
      <span class="go-title"></span>
      <span class="go-time">0:00</span>
      ${p.count > 1 ? `<button type="button" class="go-next" aria-label="Next beat">${ICON.next}</button>` : ''}
      <span class="go-seek" role="slider" aria-label="Seek" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span>`;
    bar.classList.add('is-live');
    art.dataset.cursor = '';
    hudN.parentElement!.lastChild!.textContent = `/${String(p.count).padStart(2, '0')}`;
    const btn = bar.querySelector<HTMLButtonElement>('.go-play')!;
    const title = bar.querySelector<HTMLElement>('.go-title')!;
    const time = bar.querySelector<HTMLElement>('.go-time')!;
    const seek = bar.querySelector<HTMLElement>('.go-seek')!;
    const fill = seek.querySelector('i')!;
    btn.addEventListener('click', () => void p.toggle());
    bar.querySelector('.go-next')?.addEventListener('click', () => void p.next());
    seek.addEventListener('pointerdown', (e) => { const r = seek.getBoundingClientRect(); p.seek((e.clientX - r.left) / r.width); });
    seek.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
      if (d) { e.preventDefault(); p.audio.currentTime = Math.max(0, p.audio.currentTime + d); }
    });

    // The pill that follows you down the page.
    pill = document.createElement('div');
    pill.className = 'np';
    pill.hidden = true;
    pill.innerHTML = `<button type="button" class="np-toggle" aria-label="Pause">${ICON.pause}</button><button type="button" class="np-title"><img src="img/gameover-g.webp" alt="" width="18" height="18" /><span></span></button><span class="np-eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
    document.body.append(pill);
    const pillToggle = pill.querySelector<HTMLButtonElement>('.np-toggle')!;
    const pillTitle = pill.querySelector<HTMLElement>('.np-title span')!;
    pillToggle.addEventListener('click', () => void p.toggle());
    pill.querySelector('.np-title')!.addEventListener('click', () => card?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));

    let shown = '';
    sync = () => {
      const t = p.track;
      const on = p.playing;
      const icon = on ? 'pause' : 'play';
      if (shown !== icon) { btn.innerHTML = ICON[icon]; pillToggle.innerHTML = ICON[icon]; shown = icon; }
      btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
      pillToggle.setAttribute('aria-label', on ? 'Pause' : 'Play');
      title.innerHTML = p.failed
        ? '<b>The beats didn’t load</b><span> · try again in a moment</span>'
        : `<b>${t.title}</b><span> · ${t.subtitle ?? `${t.genre} · ${t.bpm} BPM`}</span>`;
      pillTitle.textContent = `${t.title} · GameOver`;
      hudN.textContent = String(p.index + 1).padStart(2, '0');
      hudBpm.textContent = String(t.bpm);
      // Times are within the current beat, not the whole set file.
      const d = p.duration, c = p.time;
      time.textContent = on || c > 0 ? `${fmtTime(c)} / ${fmtTime(d)}` : fmtTime(d);
      fill.style.width = d ? `${(c / d) * 100}%` : '0%';
      seek.setAttribute('aria-valuenow', String(d ? Math.round((c / d) * 100) : 0));
      // The title screen's prompt: PRESS START until something plays, PAUSED once it has.
      start.textContent = !on && c > 0 ? 'Paused' : 'Press start';
      // Once something has played, the pill stays for the visit (paused or not) unless the
      // card's own controls are in sight. In the deck the card stays "on screen" under the cards
      // after it, so the next card covering the bar counts as out of sight (going by the card
      // alone hid the pill all the way down the deck).
      if (on || c > 0) pill!.hidden = barSeen;
      art.classList.toggle('is-playing', on);
      if (!on) art.style.removeProperty('--kick');
      wake();
    };
    p.on(sync);
  }

  // ---------- the loop ----------
  // One frame loop for the wall and the music: levels every frame (the kick is a one-frame
  // peak, and the G's bounce reads it), the wall at 30 frames a second, as on the site.
  let artVisible = false, raf = 0, lastDraw = 0, kickPeak = 0, lastBar = -1, lastIdx = -1, checking = 0;
  /** Some of the wall can be seen, and the player bar can be seen whole. */
  let wallSeen = false, barSeen = false;
  // In the deck (wide screens) the next card slides up over this one, so "on screen" to an
  // observer isn't the same as in sight: what shows is what's above the next card's top.
  const look = () => {
    checking = 0;
    const a = art.getBoundingClientRect(), b = bar.getBoundingClientRect();
    const cover = next ? next.getBoundingClientRect().top : Infinity;
    const vh = window.innerHeight;
    const wall = artVisible && Math.min(a.bottom, cover, vh) - Math.max(a.top, 0) > 0;
    const seen = artVisible && b.top >= 0 && b.bottom <= vh && b.bottom <= cover;
    if (seen !== barSeen) { barSeen = seen; sync(); }
    if (wall !== wallSeen) { wallSeen = wall; if (wall) wake(); }
  };
  window.addEventListener('scroll', () => { if (!checking) checking = requestAnimationFrame(look); }, { passive: true });
  function frame(t: number) {
    raf = 0;
    if (!artVisible || document.hidden || reduced) return;
    const on = !!p?.playing;
    let kick = 0, high = 0;
    if (p && on) {
      const lv = p.levels();
      kick = lv.kick; high = lv.high;
      art.style.setProperty('--kick', kick.toFixed(3));
      // A coin flip on the downbeat of every fourth bar (the beats are cut on bar lines).
      const tr = p.track, beats = (p.time * tr.bpm) / 60, bar4 = Math.floor(beats / 16);
      if (p.index !== lastIdx) { lastIdx = p.index; lastBar = bar4; }
      else if (bar4 !== lastBar) { lastBar = bar4; if (beats % 16 < 0.5) flip(); }
    }
    kickPeak = Math.max(kickPeak, kick);
    if (wall && wallSeen && t - lastDraw >= 1000 / 30 - 2) {
      wall.draw({ dt: Math.min(0.1, (t - (lastDraw || t)) / 1000), spectrum: on ? p!.spectrum() : null, kick: kickPeak, high, playing: on });
      lastDraw = t;
      kickPeak = 0;
    }
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && artVisible && !reduced) { lastDraw = 0; raf = requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => {
    artVisible = e.isIntersecting;
    look();
    sync();
    if (artVisible) wake();
  }, { threshold: 0.05 }).observe(art);
  document.addEventListener('visibilitychange', () => wake());
  sync();
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __go: () => ({ artVisible, wallSeen, barSeen, drawing: !!raf }) });
}
