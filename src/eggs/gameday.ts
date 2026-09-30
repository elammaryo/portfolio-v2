// GameDay easter egg: the pitch is playable. Click (or tap) anywhere to pass or shoot, and
// the ball goes there; long shots get some air. A keeper guards the right-hand goal.
// Every goal fills a spot on the session ticket, the way a real booking would.
//
// The pitch used to be an SVG tilted with a CSS 3D transform. Mapping a click back through a
// CSS 3D transform isn't reliable across browsers, so it's drawn on a canvas with the same
// projection done by hand (perspective 900px, rotateX 48°, rotateZ -8°): the look is
// unchanged, and inverting the maths for the pointer is exact.

type V = { x: number; y: number };
const PITCH = { w: 400, h: 260 };
const GOAL = { x: 390, y0: 104, y1: 156, bar: 18, back: 403 };
const BALL_R = 4.2;
const KEEPER_X = 385;
const G = 260; // gravity, pitch units / s²
const ROLL = 300; // rolling resistance: constant deceleration on the ground, units / s²

export function initGameDayEgg(art: HTMLElement, reduced: boolean) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gd-field';
  canvas.dataset.cursor = ''; // suppress the card's "View" bubble: it would hide the goal
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'A playable five-a-side pitch. Click to pass or shoot at the goal on the right.');
  art.prepend(canvas);
  const ctx = canvas.getContext('2d')!;

  const touch = window.matchMedia('(pointer: coarse)').matches;
  const hint = el('p', 'gd-hint mono egg-ui', touch ? '⚽ Tap to shoot' : '⚽ Click the pitch to pass or shoot');
  const score = el('p', 'gd-score mono egg-ui', '');
  score.hidden = true;
  const burst = el('p', 'gd-burst egg-ui', 'GOAL!');
  art.append(hint, score, burst);
  const ticketK = art.querySelectorAll<HTMLElement>('.gd-ticket__k')[1];
  const ticketBar = art.querySelector<HTMLElement>('.gd-ticket__bar i');
  const ticketTitle = art.querySelector<HTMLElement>('.gd-ticket strong');

  // ---------- projection ----------
  const RX = (48 * Math.PI) / 180, RZ = (-8 * Math.PI) / 180, D = 900;
  const cRX = Math.cos(RX), sRX = Math.sin(RX), cRZ = Math.cos(RZ), sRZ = Math.sin(RZ);
  let W = 0, H = 0, dpr = 1, s = 1, cx = 0, cy = 0;
  function project(px: number, py: number, h = 0): [number, number, number] {
    const x = (px - PITCH.w / 2) * s, y = (py - PITCH.h / 2) * s, z = h * s;
    const x1 = x * cRZ - y * sRZ, y1 = x * sRZ + y * cRZ;
    const y2 = y1 * cRX - z * sRX, z2 = y1 * sRX + z * cRX;
    const k = D / (D - z2);
    return [cx + x1 * k, cy + y2 * k, k];
  }
  function unproject(sx: number, sy: number): V {
    const X = sx - cx, Y = sy - cy;
    const y1 = (Y * D) / (D * cRX + Y * sRX);
    const k = D / (D - y1 * sRX);
    const x1 = X / k;
    const x = x1 * cRZ + y1 * sRZ, y = -x1 * sRZ + y1 * cRZ;
    return { x: x / s + PITCH.w / 2, y: y / s + PITCH.h / 2 };
  }
  // Where the goal and keeper land on screen, with room for a lofted ball over the bar.
  function goalBox() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py, h] of [[KEEPER_X - 8, GOAL.y0 - 8, 0], [KEEPER_X - 8, GOAL.y1 + 8, 0], [KEEPER_X - 8, GOAL.y0 - 8, GOAL.bar + 12], [GOAL.back, GOAL.y0 - 8, GOAL.bar + 12], [GOAL.back, GOAL.y1 + 8, 0]] as const) {
      const [a, b] = project(px, py, h);
      x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
    }
    return { x0, x1, y0, y1 };
  }
  const covering = [art.querySelector<HTMLElement>('.gd-ticket'), hint].filter((e): e is HTMLElement => !!e);
  function resize() {
    const r = art.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // The pitch fills 82% of the width, centred. When the art is wide and short (a tablet,
    // or a phone, where the card stacks), that puts the right-hand goal under the session
    // ticket, so the pitch shrinks and drops a step at a time until the goal and keeper are
    // clear of everything laid over it. Layout boxes (offset*), not rects: the ticket tilts
    // toward the cursor, and the fit shouldn't chase that.
    const boxes = covering.map((e) => ({ x0: e.offsetLeft - 8, x1: e.offsetLeft + e.offsetWidth + 8, y0: e.offsetTop - 8, y1: e.offsetTop + e.offsetHeight + 8 }));
    for (let k = 0; k <= 14; k++) {
      s = ((0.82 - k * 0.016) * W) / PITCH.w;
      cx = W / 2; cy = H / 2 + k * H * 0.02;
      const g = goalBox();
      if (!boxes.some((b) => g.x0 < b.x1 && g.x1 > b.x0 && g.y0 < b.y1 && g.y1 > b.y0)) break;
    }
    draw();
  }

  // ---------- state ----------
  const ball = { x: 110, y: 130, h: 0, vx: 0, vy: 0, vh: 0 };
  let keeperY = 130, keeperDive = 0, keeperVel = 0, shotAt = 0;
  let mode: 'idle' | 'ready' | 'rolling' | 'goal' | 'reset' = 'idle';
  let aim: V | null = null;
  let lastInput = 0, goals = 0, shots = 0, spots = 11;
  let drawIn = reduced ? 1 : 0;
  const trail: [number, number][] = [];
  const confetti: { x: number; y: number; vx: number; vy: number; r: number; c: string; life: number }[] = [];
  let resetAt = 0, idleNext = 0, idleStep = 0;
  const IDLE_SPOTS: V[] = [{ x: 120, y: 88 }, { x: 205, y: 176 }, { x: 290, y: 104 }, { x: 175, y: 118 }, { x: 250, y: 190 }];

  function kickTo(t: V, loft = true) {
    const dx = t.x - ball.x, dy = t.y - ball.y;
    const d = Math.hypot(dx, dy) || 1;
    // With constant deceleration a ball kicked at v stops after v²/2a. Kick hard enough to
    // stop well past the target (x1.6), so a shot arrives with pace instead of dying on the line.
    const speed = Math.min(560, Math.max(90, Math.sqrt(2 * ROLL * d * (loft ? 1.6 : 1.05))));
    ball.vx = (dx / d) * speed; ball.vy = (dy / d) * speed;
    ball.vh = loft && d > 150 ? Math.min(95, 30 + (d - 150) * 0.4) : 0;
  }

  // ---------- input ----------
  const toPitch = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return unproject(e.clientX - r.left, e.clientY - r.top); };
  const clampAim = (p: V): V => ({ x: Math.min(GOAL.back + 6, Math.max(4, p.x)), y: Math.min(PITCH.h - 4, Math.max(4, p.y)) });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (mode === 'goal' || mode === 'reset') return;
    lastInput = performance.now();
    if (mode === 'idle' || mode === 'rolling') { mode = 'ready'; ball.vx = ball.vy = 0; ball.vh = 0; ball.h = 0; }
    aim = clampAim(toPitch(e));
    canvas.setPointerCapture(e.pointerId);
    hint.classList.add('is-gone');
    wake();
  });
  canvas.addEventListener('pointermove', (e) => { if (aim) aim = clampAim(toPitch(e)); });
  const shoot = (e: PointerEvent) => {
    if (!aim) return;
    const t = clampAim(toPitch(e));
    aim = null;
    kickTo(t);
    shots++;
    shotAt = performance.now();
    mode = 'rolling';
    lastInput = performance.now();
    updateScore();
  };
  canvas.addEventListener('pointerup', shoot);
  canvas.addEventListener('pointercancel', () => { aim = null; });

  function updateScore() {
    score.hidden = false;
    score.textContent = `Goals ${goals} · Shots ${shots}`;
  }

  // ---------- simulation ----------
  function step(dt: number, now: number) {
    // Idle: the ball is passed around on its own until someone plays.
    if (mode === 'idle' && !reduced && now > idleNext && speed() < 8) {
      kickTo(IDLE_SPOTS[idleStep++ % IDLE_SPOTS.length], false);
      idleNext = now + 2600;
    }
    if (mode !== 'idle' && mode !== 'goal' && now - lastInput > 9000 && speed() < 2 && !aim) mode = 'idle';

    const prevX = ball.x;
    if (ball.h > 0 || ball.vh !== 0) {
      ball.vh -= G * dt;
      ball.h += ball.vh * dt;
      if (ball.h <= 0) { ball.h = 0; ball.vh = ball.vh < -40 ? -ball.vh * 0.42 : 0; }
    }
    const v = speed();
    if (v > 0) {
      const nv = ball.h > 0 ? v * Math.exp(-0.15 * dt) : Math.max(0, v - ROLL * dt);
      ball.vx *= nv / v; ball.vy *= nv / v;
    }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;

    // Keeper: reacts after a beat and shuffles slowly, so he gets to shots near him and
    // not to the corners. A perfect reader of the line saved everything; this one is human.
    const coming = ball.vx > 30 && ball.x < KEEPER_X && mode === 'rolling';
    const reacting = coming && now - shotAt > 180;
    const want = reacting ? ball.y + (ball.vy * (KEEPER_X - ball.x)) / ball.vx : coming ? keeperY : 130 + Math.sin(now / 900) * 5;
    const target = Math.min(GOAL.y1 - 4, Math.max(GOAL.y0 + 4, want));
    keeperVel += (Math.sign(target - keeperY) * Math.min(1, Math.abs(target - keeperY) / 6) * 26 - keeperVel) * Math.min(1, dt * 10);
    keeperY += keeperVel * dt;
    const near = coming && KEEPER_X - ball.x < 80;
    keeperDive += ((near ? Math.sign(ball.y - keeperY) * Math.min(1, Math.abs(ball.y - keeperY) / 12) : 0) - keeperDive) * Math.min(1, dt * 9);

    // Crossing his line: the closer to him, the likelier the save; nothing beyond 12 units.
    if (mode === 'rolling' && prevX < KEEPER_X && ball.x >= KEEPER_X && ball.h < 22) {
      const dy = Math.abs(ball.y - keeperY);
      const p = Math.min(1, Math.max(0, 1 - (dy - 2) / 10)) * 0.85;
      if (Math.random() < p) {
        ball.vx = -Math.abs(ball.vx) * 0.45 - 30;
        ball.vy += (ball.y - keeperY) * 4;
        ball.vh = Math.max(ball.vh, 30);
        flash('Saved!');
      } else if (dy < 14) flash('Fingertips…');
    }
    // Goal line.
    if (mode === 'rolling' && prevX < GOAL.x && ball.x >= GOAL.x) {
      const inside = ball.y > GOAL.y0 + BALL_R && ball.y < GOAL.y1 - BALL_R;
      const post = Math.abs(ball.y - GOAL.y0) <= BALL_R || Math.abs(ball.y - GOAL.y1) <= BALL_R;
      if (inside && ball.h < GOAL.bar) scored(now);
      else if (post && ball.h < GOAL.bar) { ball.vx = -ball.vx * 0.55; flash('Post!'); }
    }
    if (mode === 'goal') {
      // The net stops it.
      if (ball.x > GOAL.back - BALL_R) { ball.x = GOAL.back - BALL_R; ball.vx = -ball.vx * 0.15; }
      ball.y = Math.min(GOAL.y1 - BALL_R, Math.max(GOAL.y0 + BALL_R, ball.y));
    }
    const out = ball.x < -6 || ball.y < -6 || ball.y > PITCH.h + 6 || (ball.x > GOAL.x + 2 && mode !== 'goal');
    if ((mode === 'rolling' || mode === 'ready') && (out || (speed() < 3 && ball.h === 0 && mode === 'rolling'))) {
      if (out) { mode = 'reset'; resetAt = now + 700; }
      else mode = 'ready';
    }
    if (mode === 'idle' && out) { ball.x = 150; ball.y = 130; ball.vx = ball.vy = 0; }
    if ((mode === 'reset' || mode === 'goal') && now > resetAt) {
      ball.x = 230 + Math.random() * 80; ball.y = 70 + Math.random() * 120;
      ball.vx = ball.vy = ball.vh = 0; ball.h = 0;
      mode = 'ready';
      trail.length = 0;
    }
    for (const c of confetti) { c.vy += 420 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; }
    while (confetti.length && confetti[0].life <= 0) confetti.shift();
  }
  const speed = () => Math.hypot(ball.vx, ball.vy);

  function scored(now: number) {
    mode = 'goal';
    resetAt = now + 1800;
    goals++;
    updateScore();
    burst.textContent = 'GOAL!';
    burst.classList.remove('is-on'); void burst.offsetWidth; burst.classList.add('is-on');
    const [bx, by] = project(ball.x, ball.y, ball.h);
    const cols = ['#E0334F', '#F4EFE9', '#ffb3c0', '#8fe3b9'];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
      confetti.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 220, r: 2 + Math.random() * 3, c: cols[i % cols.length], life: 1.2 + Math.random() * 0.8 });
    }
    // A goal books a spot.
    if (spots < 14) {
      spots++;
      if (ticketK) ticketK.textContent = spots < 14 ? `${spots} of 14 spots · $12` : '14 of 14 · game on';
      if (ticketBar) ticketBar.style.width = `${(spots / 14) * 100}%`;
      if (spots === 14 && ticketTitle) ticketTitle.textContent = 'Full. See you there';
    }
    navigator.vibrate?.(40);
  }
  function flash(text: string) {
    burst.textContent = text;
    burst.classList.remove('is-on'); void burst.offsetWidth; burst.classList.add('is-on', 'is-small');
    window.setTimeout(() => burst.classList.remove('is-small'), 900);
  }

  // ---------- drawing ----------
  const LINE = 'rgba(244,239,233,0.55)';
  function poly(pts: [number, number, number?][], close = false) {
    ctx.beginPath();
    pts.forEach(([x, y, h], i) => { const [a, b] = project(x, y, h ?? 0); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
    if (close) ctx.closePath();
  }
  function rect(x: number, y: number, w: number, h: number) { poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true); }
  // Lines are drawn in by length on first view, like the SVG used to.
  function lines(progress: number) {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    const segs: [number, number][][] = [];
    const R = (x: number, y: number, w: number, h: number) => segs.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]);
    R(10, 10, 380, 240);
    segs.push([[200, 10], [200, 250]]);
    const circle: [number, number][] = [];
    for (let a = 0; a <= 48; a++) circle.push([200 + Math.cos((a / 48) * Math.PI * 2) * 38, 130 + Math.sin((a / 48) * Math.PI * 2) * 38]);
    segs.push(circle);
    R(10, 70, 56, 120); R(334, 70, 56, 120); R(10, 100, 20, 60); R(370, 100, 20, 60);
    for (const seg of segs) {
      const n = Math.max(1, Math.round((seg.length - 1) * Math.min(1, progress)));
      ctx.beginPath();
      for (let i = 0; i <= n && i < seg.length; i++) { const [a, b] = project(seg[i][0], seg[i][1]); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); }
      ctx.stroke();
    }
  }
  function goalFrame(x: number, dir: 1 | -1) {
    const back = x + dir * (GOAL.back - GOAL.x);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (let y = GOAL.y0; y <= GOAL.y1; y += 5.5) poly([[x, y, GOAL.bar], [back, y + (130 - y) * 0.1, GOAL.bar * 0.7], [back, y + (130 - y) * 0.1, 0]]), ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    poly([[x, GOAL.y0, 0], [x, GOAL.y0, GOAL.bar], [x, GOAL.y1, GOAL.bar], [x, GOAL.y1, 0]]);
    ctx.stroke();
  }
  function keeper() {
    const [bx, by, k] = project(KEEPER_X, keeperY + keeperDive * 8, 0);
    const [, ty] = project(KEEPER_X, keeperY + keeperDive * 8, 24);
    const h = by - ty, w = Math.max(7, 9 * s * k);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-keeperDive * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.9, w * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E0334F';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h * 0.78, w, h * 0.78, w * 0.4); ctx.fill();
    ctx.fillStyle = '#F4EFE9';
    ctx.beginPath(); ctx.arc(0, -h * 0.9, w * 0.42, 0, Math.PI * 2); ctx.fill();
    // Gloves out wide when he dives.
    const arm = w * (0.9 + Math.abs(keeperDive) * 0.8);
    ctx.beginPath(); ctx.arc(-arm, -h * 0.62, w * 0.24, 0, Math.PI * 2); ctx.arc(arm, -h * 0.62, w * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function ballDraw() {
    const [sx, sy] = project(ball.x, ball.y, 0);
    const [bx, by, k] = project(ball.x, ball.y, ball.h);
    const r = Math.max(5.5, BALL_R * s * k);
    ctx.fillStyle = `rgba(0,0,0,${0.45 - Math.min(0.3, ball.h / 120)})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, r * (1 + ball.h / 90), r * 0.45, -0.14, 0, Math.PI * 2); ctx.fill();
    // trail
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = `rgba(244,239,233,${(i / trail.length) * 0.28})`;
      ctx.lineWidth = r * (i / trail.length) * 1.2;
      ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
    }
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r * 3.2);
    g.addColorStop(0, 'rgba(244,239,233,0.55)'); g.addColorStop(1, 'rgba(244,239,233,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F4EFE9';
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    if (mode === 'ready' && !aim) {
      // A soft ring says "this is live".
      const t = (performance.now() % 1400) / 1400;
      ctx.strokeStyle = `rgba(224,51,79,${0.8 * (1 - t)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, by, r + 4 + t * 12, 0, Math.PI * 2); ctx.stroke();
    }
  }
  function aimDraw() {
    if (!aim) return;
    const [ax, ay] = project(ball.x, ball.y);
    const [tx, ty] = project(aim.x, aim.y);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay);
    const d = Math.hypot(aim.x - ball.x, aim.y - ball.y);
    // Long shots arc: show it.
    const lift = d > 150 ? Math.min(40, (d - 150) * 0.2) : 0;
    const [mx, my] = project((ball.x + aim.x) / 2, (ball.y + aim.y) / 2, lift);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#E0334F';
    ctx.beginPath(); poly(Array.from({ length: 25 }, (_, i) => [aim!.x + Math.cos((i / 24) * Math.PI * 2) * 7, aim!.y + Math.sin((i / 24) * Math.PI * 2) * 7] as [number, number])); ctx.stroke();
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // turf, mowed in stripes
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(224,51,79,0.05)' : 'rgba(224,51,79,0.09)';
      rect(10 + i * 38, 10, 38, 240); ctx.fill();
    }
    lines(drawIn);
    goalFrame(10, -1);
    // Draw back to front: whatever is further up the pitch (smaller y after the tilt) first.
    const ballBehind = ball.x > KEEPER_X;
    if (ballBehind) ballDraw();
    goalFrame(GOAL.x, 1);
    keeper();
    if (!ballBehind) ballDraw();
    aimDraw();
    for (const c of confetti) { ctx.fillStyle = c.c; ctx.globalAlpha = Math.min(1, c.life); ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2); }
    ctx.globalAlpha = 1;
  }

  // ---------- loop (only while on screen) ----------
  let raf = 0, last = 0, visible = false, acc = 0;
  function frame(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    acc += dt;
    while (acc > 1 / 120) { step(1 / 120, now); acc -= 1 / 120; }
    if (drawIn < 1) drawIn = Math.min(1, drawIn + dt / 1.8);
    const [bx, by] = project(ball.x, ball.y, ball.h);
    trail.push([bx, by]);
    if (trail.length > 14 || speed() < 20) trail.shift();
    draw();
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }, { threshold: 0.05 }).observe(art);
  new ResizeObserver(resize).observe(art);
  document.addEventListener('visibilitychange', wake);
  resize();
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, { __gd: { project, ball, keeper: () => keeperY, mode: () => mode, goals: () => goals, step: (n: number) => { for (let i = 0; i < n; i++) step(1 / 120, performance.now()); draw(); } } });
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text: string) {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}
