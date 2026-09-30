import gsap from 'gsap';

// SuperOver easter egg: a bonus batting game. It is labelled as an easter egg everywhere,
// so nobody mistakes it for the product (SuperOver books real pickup games). In cricket a
// super over is the six-ball
// tie-breaker, so the phone in the card turns into one: six balls, two wickets, a target to
// chase. Tap (or press Space) to swing; timing decides between a six, a four, a single, a
// miss, or losing your stumps.

type Phase = 'intro' | 'runup' | 'ball' | 'result' | 'over';
type Shot = { kind: 'six' | 'four' | 'two' | 'one' | 'dot' | 'out' | 'caught'; runs: number };

const GREEN = '#06BA63';

export function initSuperOverEgg(art: HTMLElement, reduced: boolean) {
  const phone = art.querySelector<HTMLElement>('.phone--b')!;
  const other = art.querySelector<HTMLElement>('.phone--a')!;
  const chips = [...art.querySelectorAll<HTMLElement>('.so-chip')];
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'so-chip so-chip--play mono egg-ui';
  play.innerHTML = '<span class="so-egg">Easter egg</span> Hit a six <span aria-hidden="true">🏏</span>';
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'so-exit egg-ui';
  exit.innerHTML = '<span aria-hidden="true">✕</span> Exit game';
  exit.hidden = true;
  art.append(play, exit);

  const screen = document.createElement('div');
  screen.className = 'so-screen';
  screen.tabIndex = -1;
  screen.dataset.cursor = '';
  screen.setAttribute('role', 'application');
  screen.setAttribute('aria-label', 'Super Over batting game. Tap or press Space to swing.');
  const canvas = document.createElement('canvas');
  screen.append(canvas);
  phone.append(screen);
  const ctx = canvas.getContext('2d')!;

  // ---------- state ----------
  let playing = false, raf = 0, W = 0, H = 0, dpr = 1;
  let phase: Phase = 'intro', t0 = 0;
  let runs = 0, wkts = 0, balls = 0, target = 15;
  let del = { T: 1, bounce: 0.68, line: 0, onStumps: true, speed: 0 };
  let swingAt = -1, shot: Shot | null = null, shotAt = 0;
  type Fly = { x: number; y: number; vx: number; vy: number; s: number };
  let flying: Fly | null = null, launch: Fly | null = null;
  const trail: [number, number][] = [];
  let banner = '', bannerAt = 0, bannerCol = '#fff';
  const log: string[] = [];
  let toast = '', toastAt = -9;
  const stumpsFly = { on: false, at: 0 };

  // ---------- geometry (the pitch seen from behind the batter) ----------
  const G = () => {
    const top = H * 0.24, bot = H * 0.84;
    return { top, bot, farW: W * 0.12, nearW: W * 0.34, cx: W / 2 };
  };
  // Depth t: 0 at the bowler's crease, 1 at the batter's. Things speed up as they come closer.
  const depthY = (t: number) => { const g = G(); return g.top + (g.bot - g.top) * (0.62 * t + 0.38 * t * t); };
  const depthScale = (t: number) => 0.35 + 0.65 * (0.62 * t + 0.38 * t * t);

  function resize() {
    const r = screen.getBoundingClientRect();
    // The phone may be scaled up while playing: size the canvas to its untransformed box.
    W = screen.offsetWidth || r.width; H = screen.offsetHeight || r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2) * (playing ? 1.3 : 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }

  // ---------- flow ----------
  function newDelivery() {
    const T = 0.95 + Math.random() * 0.35;
    const onStumps = Math.random() < 0.55;
    del = { T, bounce: 0.55 + Math.random() * 0.27, line: onStumps ? (Math.random() - 0.5) * 0.25 : (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.4), onStumps, speed: Math.round(118 + (1.3 - T) * 90 + Math.random() * 6) };
    swingAt = -1; shot = null; flying = null; launch = null; trail.length = 0; stumpsFly.on = false;
    phase = 'runup'; t0 = performance.now();
  }
  function start() {
    runs = 0; wkts = 0; balls = 0; log.length = 0;
    target = 12 + Math.floor(Math.random() * 7);
    phase = 'intro'; t0 = performance.now();
    toast = ''; banner = '';
  }
  function swing() {
    const now = performance.now();
    if (phase === 'intro') { newDelivery(); return; }
    if (phase === 'over') { start(); return; }
    if (phase !== 'ball' || swingAt >= 0) return;
    swingAt = now;
    // The bat meets the ball ~90ms after the tap starts the swing.
    const arrive = t0 + del.T * 1000;
    const err = (now + 90 - arrive) / 1000;
    const a = Math.abs(err);
    let s: Shot;
    if (a <= 0.05) s = { kind: 'six', runs: 6 };
    else if (a <= 0.095) s = { kind: 'four', runs: 4 };
    else if (a <= 0.14) s = Math.random() < 0.6 ? { kind: 'two', runs: 2 } : { kind: 'one', runs: 1 };
    else if (a <= 0.2) s = Math.random() < 0.25 ? { kind: 'caught', runs: 0 } : { kind: 'one', runs: 1 };
    else s = { kind: 'dot', runs: 0 }; // a swing and a miss; the stumps decide at the crease
    if (s.kind !== 'dot') {
      // Contact happens when the ball gets to the bat, not when you tap: queue the launch.
      shot = s; shotAt = arrive;
      const bx = W / 2 + del.line * G().nearW * 0.5, by = depthY(0.96);
      const side = err < 0 ? -1 : 1; // early goes leg side, late goes off side
      if (s.kind === 'six') launch = { x: bx, y: by, vx: side * W * (0.1 + Math.random() * 0.25), vy: -H * 1.35, s: 7 };
      else if (s.kind === 'four') launch = { x: bx, y: by, vx: side * W * 1.4, vy: -H * 0.28, s: 5 };
      else if (s.kind === 'caught') launch = { x: bx, y: by, vx: side * W * 0.15, vy: H * 0.2, s: 5 };
      else launch = { x: bx, y: by, vx: side * W * 0.6, vy: -H * 0.35, s: 5 };
    }
  }
  function settle(s: Shot) {
    balls++;
    runs += s.runs;
    if (s.kind === 'out' || s.kind === 'caught') wkts++;
    const label: Record<Shot['kind'], [string, string]> = {
      six: ['SIX!', GREEN], four: ['FOUR!', '#7df0b2'], two: ['2 runs', '#fff'], one: ['1 run', '#fff'],
      dot: ['Dot ball', '#b8c4bd'], out: ['BOWLED!', '#ff5a6a'], caught: ['CAUGHT!', '#ff5a6a'],
    };
    [banner, bannerCol] = label[s.kind];
    bannerAt = performance.now();
    log.push(s.kind === 'six' ? '6' : s.kind === 'four' ? '4' : s.kind === 'out' || s.kind === 'caught' ? 'W' : s.runs ? String(s.runs) : '•');
    if (s.kind === 'six') { gsap.fromTo(phone, { x: '+=0' }, { keyframes: { x: [0, -4, 4, -2, 0].map((v) => `+=${v}`) }, duration: 0.35 }); navigator.vibrate?.(60); }
    phase = 'result'; t0 = performance.now();
  }
  function finished() { return runs >= target || wkts >= 2 || balls >= 6; }
  function endInnings() {
    phase = 'over'; t0 = performance.now();
    const won = runs >= target;
    toast = won ? `You'd make the team. Book a real game on SuperOver.` : `Unlucky. Real games are on SuperOver.`;
    toastAt = performance.now();
  }

  // ---------- update ----------
  function update(now: number) {
    const el = (now - t0) / 1000;
    if (phase === 'runup' && el > 0.9) { phase = 'ball'; t0 = now; }
    if (phase === 'ball') {
      const t = el / del.T;
      if (shot && now >= shotAt) { flying = launch; settle(shot); return; }
      if (!shot && t >= 1.04) {
        // Past the bat: either the stumps go, or it's a dot.
        if (del.onStumps) { stumpsFly.on = true; stumpsFly.at = now; settle({ kind: 'out', runs: 0 }); }
        else settle({ kind: 'dot', runs: 0 });
      }
    }
    if (phase === 'result' && el > (shot?.kind === 'six' ? 1.6 : 1.2)) {
      if (finished()) endInnings(); else newDelivery();
    }
    if (flying) {
      const dt = 1 / 60;
      flying.x += flying.vx * dt; flying.y += flying.vy * dt;
      flying.vy += H * (shot?.kind === 'six' ? 1.1 : 0.6) * dt;
      if (shot?.kind === 'six') flying.s *= 1.012;
      trail.push([flying.x, flying.y]);
      if (trail.length > 18) trail.shift();
    }
  }

  // ---------- drawing ----------
  function figure(x: number, y: number, h: number, col: string, bat?: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, h * 0.28, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(-h * 0.13, -h * 0.72, h * 0.26, h * 0.56, h * 0.1); ctx.fill();
    ctx.fillRect(-h * 0.11, -h * 0.2, h * 0.08, h * 0.2); ctx.fillRect(h * 0.03, -h * 0.2, h * 0.08, h * 0.2);
    ctx.fillStyle = '#f2efe6';
    ctx.beginPath(); ctx.arc(0, -h * 0.84, h * 0.12, 0, Math.PI * 2); ctx.fill();
    if (bat !== undefined) {
      // The bat pivots at the hands: back-lift, through the line, follow-through.
      ctx.save();
      ctx.translate(h * 0.1, -h * 0.5);
      ctx.rotate(bat);
      ctx.fillStyle = '#e8d3a2';
      ctx.fillRect(-h * 0.03, 0, h * 0.06, h * 0.16);
      ctx.beginPath(); ctx.roundRect(-h * 0.055, h * 0.15, h * 0.11, h * 0.42, h * 0.03); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  function stumps(x: number, y: number, h: number, fly = 0) {
    ctx.strokeStyle = '#f1e2c0'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, h * 0.07);
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(x + i * h * 0.16, y);
      if (fly) ctx.rotate(i * fly * 1.1 + fly * 0.3);
      ctx.beginPath(); ctx.moveTo(0, -fly * h * 0.4); ctx.lineTo(0, -h - fly * h * 0.4); ctx.stroke();
      ctx.restore();
    }
    // bails
    ctx.beginPath(); ctx.moveTo(x - h * 0.2, y - h - fly * h * 1.6); ctx.lineTo(x + h * 0.2, y - h - fly * h * 2.1); ctx.stroke();
  }
  function draw(now: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = G();
    // sky to outfield
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#04150d'); bg.addColorStop(0.2, '#0a3a22'); bg.addColorStop(1, '#0c4a2b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // boundary rope and mowing rings
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${i === 0 ? 0.35 : 0.04})`;
      ctx.lineWidth = i === 0 ? 1.5 : 10;
      ctx.beginPath(); ctx.ellipse(W / 2, H * 0.62, W * (0.75 + i * 0.16), H * (0.5 + i * 0.1), 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
    // the strip
    const strip = ctx.createLinearGradient(0, g.top, 0, g.bot);
    strip.addColorStop(0, '#9a7f52'); strip.addColorStop(1, '#cfb27c');
    ctx.fillStyle = strip;
    ctx.beginPath(); ctx.moveTo(g.cx - g.farW, g.top - 6); ctx.lineTo(g.cx + g.farW, g.top - 6); ctx.lineTo(g.cx + g.nearW, g.bot + 16); ctx.lineTo(g.cx - g.nearW, g.bot + 16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
    const crease = (t: number) => { const y = depthY(t), half = g.farW + (g.nearW - g.farW) * (0.62 * t + 0.38 * t * t); ctx.beginPath(); ctx.moveTo(g.cx - half * 1.1, y); ctx.lineTo(g.cx + half * 1.1, y); ctx.stroke(); };
    crease(0.02); crease(0.97);
    // far stumps and the bowler
    stumps(g.cx, depthY(0), H * 0.035);
    const el = (now - t0) / 1000;
    const runT = phase === 'runup' ? Math.min(1, el / 0.9) : phase === 'intro' || phase === 'over' ? 0 : 1;
    const bowlerY = depthY(0) - H * 0.06 * (1 - runT);
    figure(g.cx + W * 0.03, bowlerY + H * 0.005, H * 0.07 * (0.8 + runT * 0.2), '#d9d4c6');
    // the ball
    if (phase === 'ball' || (phase === 'result' && !flying && !shot)) {
      const t = Math.min(1.05, (phase === 'ball' ? el : del.T) / del.T);
      const y = depthY(t), sc = depthScale(t);
      const x = g.cx + del.line * (g.farW + (g.nearW - g.farW) * (0.62 * t + 0.38 * t * t)) * 0.5 * t;
      // height: from the hand down to the bounce, then up toward the bat
      const hgt = t < del.bounce ? (1 - t / del.bounce) * 0.9 * (1 - (t / del.bounce) * 0.35) : Math.min(0.55, (t - del.bounce) * 1.4);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x, y, 5 * sc, 1.8 * sc, 0, 0, Math.PI * 2); ctx.fill();
      ball(x, y - hgt * H * 0.07 * sc, 5.2 * sc);
    }
    // near stumps (they fly on a bowled) and the batter
    const fly = stumpsFly.on ? Math.min(1, (now - stumpsFly.at) / 350) : 0;
    stumps(g.cx - W * 0.02, g.bot + H * 0.005, H * 0.1, fly);
    const sw = swingAt >= 0 ? Math.min(1, (now - swingAt) / 260) : 0;
    const bat = -2.4 + sw * 3.6; // back-lift to follow-through
    figure(g.cx + W * 0.1, g.bot + H * 0.03, H * 0.22, GREEN, phase === 'intro' ? -2.4 : bat);
    // the hit ball
    if (flying) {
      for (let i = 1; i < trail.length; i++) {
        ctx.strokeStyle = `rgba(255,90,90,${(i / trail.length) * 0.5})`;
        ctx.lineWidth = flying.s * (i / trail.length);
        ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
      }
      ball(flying.x, flying.y, flying.s);
    }
    hud(now);
  }
  function ball(x: number, y: number, r: number) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#ff6b6b'); g.addColorStop(1, '#9e1422');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,220,0.8)'; ctx.lineWidth = Math.max(0.6, r * 0.15);
    ctx.beginPath(); ctx.arc(x, y, r * 0.75, -0.9, 0.9); ctx.stroke();
  }
  function text(s: string, x: number, y: number, size: number, col: string, font = 'Anton', align: CanvasTextAlign = 'center', glow = 0) {
    ctx.font = `${font === 'Anton' ? 400 : 600} ${size}px "${font}", sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
    ctx.shadowBlur = 0;
  }
  function hud(now: number) {
    // status bar + island, so it still reads as the phone
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.roundRect(W / 2 - W * 0.14, H * 0.012, W * 0.28, H * 0.034, H * 0.017); ctx.fill();
    // scoreboard
    const top = H * 0.07;
    ctx.fillStyle = 'rgba(4,16,10,0.72)';
    ctx.beginPath(); ctx.roundRect(W * 0.05, top, W * 0.9, H * 0.085, 10); ctx.fill();
    text('BONUS ROUND', W * 0.09, top + H * 0.026, W * 0.045, GREEN, 'JetBrains Mono', 'left');
    text(`${runs}/${wkts}`, W * 0.09, top + H * 0.058, W * 0.085, '#fff', 'Anton', 'left');
    text(`${Math.floor(balls / 6)}.${balls % 6} ov · need ${Math.max(0, target - runs)}`, W * 0.91, top + H * 0.026, W * 0.04, '#b8c4bd', 'JetBrains Mono', 'right');
    // this over, ball by ball
    for (let i = 0; i < 6; i++) {
      const x = W * 0.91 - (5 - i) * W * 0.062, y = top + H * 0.058;
      const b = log[i];
      ctx.fillStyle = b === 'W' ? '#ff5a6a' : b === '6' || b === '4' ? GREEN : b ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.arc(x, y, W * 0.026, 0, Math.PI * 2); ctx.fill();
      if (b) text(b, x, y + 0.5, W * 0.03, b === '6' || b === '4' ? '#04150d' : '#fff', 'JetBrains Mono');
    }
    if (phase === 'runup') text(`Ball ${balls + 1} · ${del.speed} km/h`, W / 2, H * 0.2, W * 0.042, 'rgba(255,255,255,0.75)', 'JetBrains Mono');
    if (phase === 'intro') {
      ctx.fillStyle = 'rgba(2,10,6,0.72)'; ctx.fillRect(0, H * 0.3, W, H * 0.36);
      text('HIT A SIX', W / 2, H * 0.37, W * 0.14, '#fff', 'Anton', 'center', 18);
      text(`Bonus round · 6 balls · chase ${target}`, W / 2, H * 0.45, W * 0.045, '#b8f5d5', 'JetBrains Mono');
      text('Tap to swing when the ball arrives', W / 2, H * 0.505, W * 0.04, '#d6ddd9', 'JetBrains Mono');
      text('(Just for fun. The real app books pickup games.)', W / 2, H * 0.545, W * 0.034, '#9fb3a8', 'JetBrains Mono');
      const k = 0.6 + 0.4 * Math.sin(now / 250);
      text('TAP TO FACE THE FIRST BALL', W / 2, H * 0.6, W * 0.042, `rgba(6,186,99,${k})`, 'JetBrains Mono');
    }
    if (banner && (phase === 'result' || phase === 'over') && now - bannerAt < 1600) {
      const a = Math.min(1, (now - bannerAt) / 120) * Math.min(1, (1600 - (now - bannerAt)) / 300);
      const pop = 1 + Math.max(0, 0.25 - (now - bannerAt) / 800);
      ctx.globalAlpha = a;
      text(banner, W / 2, H * 0.36, W * (banner.length > 6 ? 0.1 : 0.17) * pop, bannerCol, 'Anton', 'center', 24);
      ctx.globalAlpha = 1;
    }
    if (phase === 'over') {
      const won = runs >= target;
      ctx.fillStyle = 'rgba(2,10,6,0.78)'; ctx.fillRect(0, H * 0.42, W, H * 0.26);
      text(won ? 'YOU WON' : 'SO CLOSE', W / 2, H * 0.49, W * 0.12, won ? GREEN : '#fff', 'Anton', 'center', 16);
      text(`${runs}/${wkts} off ${balls} ball${balls === 1 ? '' : 's'} · target ${target}`, W / 2, H * 0.56, W * 0.042, '#d6ddd9', 'JetBrains Mono');
      const k = 0.6 + 0.4 * Math.sin(now / 250);
      text('TAP TO PLAY AGAIN', W / 2, H * 0.625, W * 0.042, `rgba(6,186,99,${k})`, 'JetBrains Mono');
    }
    // A push notification, the way the real app would send it.
    const tt = (now - toastAt) / 1000;
    if (toast && tt < 5) {
      const y = H * 0.012 + Math.min(1, tt * 4) * H * 0.05 - Math.max(0, tt - 4.4) * H * 0.2;
      ctx.fillStyle = 'rgba(28,32,30,0.96)';
      ctx.beginPath(); ctx.roundRect(W * 0.04, y, W * 0.92, H * 0.09, 12); ctx.fill();
      ctx.fillStyle = GREEN; ctx.beginPath(); ctx.roundRect(W * 0.07, y + H * 0.018, H * 0.05, H * 0.05, 8); ctx.fill();
      text('SuperOver · now', W * 0.07 + H * 0.065, y + H * 0.03, W * 0.036, '#9fb3a8', 'JetBrains Mono', 'left');
      text(toast.length > 34 ? toast.slice(0, 33) + '…' : toast, W * 0.07 + H * 0.065, y + H * 0.062, W * 0.036, '#fff', 'Manrope', 'left');
    }
  }

  // ---------- loop ----------
  function frame(now: number) {
    raf = 0;
    if (!playing) return;
    if (raf) return;
    update(now);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  // ---------- enter / leave ----------
  const home = { rotation: 0 };
  function enter() {
    if (playing) return;
    playing = true;
    art.classList.add('is-playing');
    home.rotation = Number(gsap.getProperty(phone, 'rotation')) || 6;
    gsap.killTweensOf(phone);
    const a = art.getBoundingClientRect(), p = phone.getBoundingClientRect();
    // Leave a band above the phone for the exit button: at 90% of the art's height the
    // phone's corner sat under it on a phone, and the way out was easy to miss.
    const scale = Math.min(1.35, (a.height - 72) / phone.offsetHeight);
    const x = Number(gsap.getProperty(phone, 'x')) + (a.left + a.width / 2) - (p.left + p.width / 2);
    const y = Number(gsap.getProperty(phone, 'y')) + (a.top + a.height / 2 + 24) - (p.top + p.height / 2);
    gsap.to(phone, { x, y, rotation: 0, scale, duration: reduced ? 0 : 0.8, ease: 'expo.out', onComplete: () => screen.focus({ preventScroll: true }) });
    gsap.to(other, { opacity: 0.18, x: '-=40', duration: 0.6 });
    gsap.to(chips, { opacity: 0, duration: 0.3 });
    play.hidden = true; exit.hidden = false;
    screen.classList.add('is-on');
    resize();
    start();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function leave() {
    if (!playing) return;
    playing = false;
    art.classList.remove('is-playing');
    screen.classList.remove('is-on');
    gsap.to(phone, { x: 0, y: 0, rotation: home.rotation, scale: 1, duration: reduced ? 0 : 0.7, ease: 'expo.out', onComplete: () => { if (!reduced) gsap.to(phone, { y: 20, duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }); } });
    gsap.to(other, { opacity: 1, x: 0, duration: 0.6 });
    gsap.to(chips, { opacity: 1, duration: 0.5 });
    play.hidden = false; exit.hidden = true;
  }
  play.addEventListener('click', enter);
  exit.addEventListener('click', leave);
  screen.addEventListener('pointerdown', (e) => { if (playing) { e.preventDefault(); swing(); } });
  screen.addEventListener('keydown', (e) => {
    if (!playing) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); swing(); }
  });
  // Three ways out, like any overlay: the button, Escape from anywhere, or a tap beside the phone.
  window.addEventListener('keydown', (e) => { if (playing && e.key === 'Escape') leave(); });
  art.addEventListener('click', (e) => {
    const t = e.target as Node;
    if (!playing || phone.contains(t) || exit.contains(t) || play.contains(t)) return;
    leave();
  });
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, { __so: { phase: () => phase, del: () => del, t0: () => t0, score: () => `${runs}/${wkts} (${balls})`, swing } });
  }
  // Scrolling away pauses nothing dramatic: it just ends the game and puts the phone back.
  new IntersectionObserver(([e]) => { if (!e.isIntersecting && playing) leave(); }, { threshold: 0.2 }).observe(art);
}
