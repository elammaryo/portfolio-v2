import * as THREE from 'three';
import gsap from 'gsap';
import type { Levels } from '../audio';

// The hero: a planet with FULL-STACK and CLOUD ENGINEERING orbiting it.
//
// Omer's first portfolio had a CSS planet with the two words curved around it under
// "Currently orbiting between…": full-stack work on one side, his pull toward cloud on the
// other. On 2026-10-02 he asked for that idea back in place of the particle coffee mug, with
// room for the hero to breathe. Here it is in three dimensions: each word rides its own ring,
// the rings turn, and the far side of each passes behind the planet. The planet keeps the old
// one's latitude and longitude lines, and its night side keeps its lamps on (the site's
// "after hours" ember).
//
// Light on purpose: one sphere, two text bands, two comets and a glow, no post-processing.
// The canvas is transparent, so the page's sky (sky.ts) shows behind the planet.

export type Planet = Awaited<ReturnType<typeof createPlanet>>;

type Opts = {
  canvas: HTMLCanvasElement;
  reduced: boolean;
  /** Start fully lit, rings written and comets out (screenshots, and reduced motion). */
  formed: boolean;
  levels?: () => Levels | null;
  /** A tap or click on the planet that was not a drag. */
  onTap?: () => void;
};

const PLANET_VERT = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vObj = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const NOISE = /* glsl */ `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

// Colours are written as they should appear (sRGB); nothing here converts them.
const PLANET_FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform float uSun, uPulse, uNear;
  uniform vec3 uAim;
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vV;
  ${NOISE}
  // One octave of lamps: a point of light in some of the cells of a grid laid over the sphere.
  // \`px\` is how far q moves per screen pixel. The point is sized in pixels, so a lamp stays a
  // point however close the flight's dive comes (sized by the cell, the lamps swelled into
  // blurry discs, and squares where the disc ran into its cell's edge); far off, the cap keeps
  // the half-cell lamps the planet always had.
  float lamps(vec3 q, float px, float thresh) {
    vec3 cell = floor(q);
    vec3 at = cell + 0.25 + 0.5 * vec3(hash(cell + 7.1), hash(cell + 3.7), hash(cell + 1.3));
    float rad = min(0.5, px * (2.6 + uNear * 1.2));
    return step(thresh, hash(cell)) * (1.0 - smoothstep(0.0, rad, length(q - at)));
  }
  void main() {
    vec3 n = normalize(vN), v = normalize(vV), l = normalize(uLight), o = normalize(vObj);
    float ndl = dot(n, l);
    float facing = max(dot(n, v), 0.0);
    // A wide, soft terminator: light wraps a little past the edge, as an atmosphere scatters it.
    float day = smoothstep(-0.28, 0.7, ndl) * uSun;

    // Derivatives first, outside any branch: they are only defined where every pixel of a block
    // runs the same code.
    float po = length(fwidth(o));

    // A quiet surface: soft bands of latitude, warped by noise, in the site's violets. The old
    // planet was a smooth gradient; this keeps that calm and only lets the bands show on the
    // lit side. The noise is only worked out where there is daylight to see it by: unlit, the
    // surface is 3.5% of its colour and the bands vanish, and in the flight's dive the night side
    // fills the screen, so skipping it there takes the costliest frames down by half.
    float tone = 0.5;
    if (day > 0.002) {
      float w = fbm(o * 2.2);
      float fine = fbm(o * 7.5 + 3.0);
      float bands = sin((o.y * 4.6 + (w - 0.5) * 2.0) * 3.14159);
      tone = 0.5 + bands * 0.16 + (fine - 0.5) * 0.3;
    }
    vec3 base = mix(vec3(0.16, 0.13, 0.38), vec3(0.5, 0.43, 0.92), tone);
    float key = max(ndl, 0.0);
    vec3 col = base * (0.035 + 1.0 * day);
    // The lit side warms toward lavender where the light lands square on.
    col = mix(col, vec3(0.88, 0.85, 1.0), pow(key, 3.0) * 0.32 * uSun);
    // The old site's planet was drawn with latitude and longitude lines: they stay, faintly,
    // every 30 degrees. Widths come from the screen-space change of the surface point, so a
    // line stays about a pixel wide at any size (and the date line of atan() never shows).
    float px = po * 1.1;
    float lat = asin(clamp(o.y, -1.0, 1.0));
    float lon = atan(o.z, o.x);
    float st = 0.5235988;
    float dLat = abs(fract(lat / st + 0.5) - 0.5) * st;
    float dLon = abs(fract(lon / st + 0.5) - 0.5) * st * cos(lat);
    float grid = max(1.0 - smoothstep(0.0, px, dLat), (1.0 - smoothstep(0.0, px, dLon)) * smoothstep(0.98, 0.9, abs(o.y)));
    col += vec3(0.86, 0.84, 1.0) * grid * smoothstep(0.0, 0.45, facing) * (0.02 + 0.055 * day);

    // After hours: the night side keeps its lamps on, in the site's ember, in clusters.
    float night = (1.0 - smoothstep(-0.22, 0.12, ndl)) * smoothstep(0.05, 0.4, facing);
    if (night > 0.001) {
      float towns = fbm(o * 3.1 + 5.0);
      // The dive (uNear) heads for a city: the towns spread round the point it is aimed at, so
      // wherever the planet has turned to by then, lights rush up from the middle of the screen.
      towns += uNear * 0.14 * smoothstep(0.93, 0.995, dot(n, uAim));
      vec3 lit = vec3(1.0, 0.7, 0.42) * lamps(o * 46.0, po * 46.0, 0.84) * smoothstep(0.47 - 0.1 * uNear, 0.6 - 0.1 * uNear, towns) * 1.25;
      // Closer in, finer lamps resolve between them: each finer octave fades in once its cells
      // are a few pixels across, so the lights multiply as they rush up rather than swelling.
      if (uNear > 0.001) {
        float suburbs = smoothstep(0.4, 0.56, towns) * smoothstep(0.36, 0.6, noise(o * 7.5 + 3.0));
        float pB = po * 150.0, pC = po * 470.0;
        lit += vec3(1.0, 0.78, 0.56) * lamps(o * 150.0, pB, 0.8) * suburbs * (1.0 - smoothstep(0.17, 0.4, pB));
        lit += vec3(1.0, 0.66, 0.4) * lamps(o * 470.0, pC, 0.78) * suburbs * smoothstep(0.3, 0.7, noise(o * 38.0)) * (1.0 - smoothstep(0.17, 0.4, pC)) * 0.85;
      }
      col += lit * night;
    }

    // The atmosphere: a violet rim, strongest on the lit side, swelling a little with the bass.
    float rim = pow(1.0 - facing, 2.6);
    col += vec3(0.62, 0.55, 1.0) * rim * (0.12 + 0.88 * smoothstep(-0.35, 0.5, ndl)) * (0.15 + 0.85 * uSun) * (1.0 + uPulse);
    // And a thin warm edge away from the light, as if the lamp were behind it.
    col += vec3(1.0, 0.63, 0.36) * pow(1.0 - facing, 5.0) * smoothstep(0.1, -0.6, ndl) * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The glow behind the planet: a soft disc that leans toward the light. Premultiplied, so it
// lies over the sky like light rather than covering it.
const GLOW_FRAG = /* glsl */ `
  uniform vec2 uLean;
  uniform float uSun, uPulse;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p - uLean * 0.08);
    float a = smoothstep(0.92, 0.44, d);
    a = a * a * 0.3 * uSun * (1.0 + uPulse * 1.5);
    gl_FragColor = vec4(vec3(0.56, 0.49, 1.0) * a, a);
  }
`;

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RING_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uReveal, uReps, uAlpha, uFlash;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float facing = dot(normalize(vN), normalize(vV));
    // Edge-on, a letter is squeezed to a sliver: fade the band where it turns away.
    float a = smoothstep(0.1, 0.5, abs(facing));
    // The far side is read through the ring, from behind: mirrored, so kept faint.
    a *= gl_FrontFacing ? 1.0 : 0.06;
    // The intro writes every repeat of the word in at once, letter by letter.
    float k = fract(vUv.x * uReps);
    a *= 1.0 - smoothstep(uReveal - 0.03, uReveal, k);
    a *= uAlpha;
    vec3 c = t.rgb * (1.0 + uFlash);
    gl_FragColor = vec4(c * t.a * a, t.a * a);
  }
`;

const DOTS_VERT = /* glsl */ `
  attribute float aK;
  uniform float uPx, uSize, uTail;
  varying float vK;
  void main() {
    vK = aK;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // A comet's head is big and its tail thins out; an orbit's dots are all one size.
    float s = uTail > 0.5 ? mix(uSize, 1.1, pow(aK, 0.55)) : uSize;
    gl_PointSize = s * uPx * (9.0 / -mv.z);
  }
`;

const DOTS_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha, uTail;
  varying float vK;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d);
    a *= uTail > 0.5 ? (1.0 - vK) * (1.0 - vK) : 1.0;
    a *= uAlpha;
    // A comet's head burns brighter than its alpha: premultiplied, that reads as light.
    gl_FragColor = vec4(uColor * a * (uTail > 0.5 ? 1.5 : 1.0), a);
  }
`;

/**
 * A colour as written, for these shaders. THREE.Color would convert the hex to linear light,
 * and nothing here converts it back, so the comets came out darker than their hex.
 */
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * One orbit's text, drawn round a canvas strip that wraps the band once: the word, then a thin
 * line out to a four-point star and on to the next word, so the orbit reads as a closed loop.
 */
const TEX_W = 4096, TEX_H = 112;
function ringTexture(word: string, reps: number, colour: string, renderer: THREE.WebGLRenderer): { tex: THREE.CanvasTexture; centre: number } {
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d')!;
  const size = 60;
  g.font = `400 ${size}px "JetBrains Mono", ui-monospace, monospace`;
  g.textBaseline = 'middle';
  const track = size * 0.36;
  const span = TEX_W / reps;
  const widths = [...word].map((ch) => g.measureText(ch).width);
  const wordW = widths.reduce((a, b) => a + b, 0) + track * (word.length - 1);
  const mid = TEX_H / 2;
  for (let r = 0; r < reps; r++) {
    const x0 = r * span + (span - wordW) / 2 - span * 0.14;
    // A dark halo under the letters keeps them legible where they cross the planet.
    g.shadowColor = 'rgba(7, 7, 12, 0.92)';
    g.shadowBlur = 18;
    g.fillStyle = colour;
    let x = x0;
    [...word].forEach((ch, i) => { g.fillText(ch, x, mid + 3); x += widths[i] + track; });
    g.shadowBlur = 0;
    // The track out to the next word, broken by a star in the lamp's colour.
    const sx = r * span + span * 0.86, s = 12;
    const next = x0 + span;
    g.strokeStyle = colour;
    g.globalAlpha = 0.32;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 30, mid); g.lineTo(sx - s - 22, mid);
    g.moveTo(sx + s + 22, mid); g.lineTo(next - 30, mid);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = '#ffb36b';
    g.beginPath();
    g.moveTo(sx, mid - s); g.quadraticCurveTo(sx, mid, sx + s, mid); g.quadraticCurveTo(sx, mid, sx, mid + s);
    g.quadraticCurveTo(sx, mid, sx - s, mid); g.quadraticCurveTo(sx, mid, sx, mid - s); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  // Where the first word's middle falls round the band (0–1), so it can start out in front.
  return { tex, centre: ((span - wordW) / 2 - span * 0.14 + wordW / 2) / TEX_W };
}

export async function createPlanet(opts: Opts) {
  const { canvas, reduced } = opts;
  const params = new URLSearchParams(location.search);
  if (params.has('nogl')) throw new Error('WebGL disabled by ?nogl');
  const debug = params.has('debug');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // On a sharp screen the extra pixels smooth the planet's edge; multisampling there as well
  // would cost tens of megabytes of buffers for nothing anyone could see.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, alpha: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  // Everything sits inside this radius (the outer comet's orbit), and the camera backs off far
  // enough to fit it in whichever side of the canvas is shorter.
  const FIT = 2.36;

  // Ring text is drawn with the site's mono face, so wait for it.
  await document.fonts.load('400 60px "JetBrains Mono"').catch(() => undefined);

  const U = {
    uLight: { value: new THREE.Vector3(-0.8, 0.5, 0.36).normalize() },
    uSun: { value: 1 },
    uPulse: { value: 0 },
    /** 0–1 through the flight's dive: finer lamps, a few more towns. */
    uNear: { value: 0 },
    /** Where the dive is headed, in world space (NIGHT, below). */
    uAim: { value: new THREE.Vector3(0.78, -0.3, 0.55).normalize() },
  };
  const system = new THREE.Group();
  scene.add(system);

  // ---------- the planet ----------
  // Its axis leans like the old planet's grid did; it turns about that axis.
  const tilt = new THREE.Group();
  tilt.rotation.z = -0.38;
  tilt.rotation.x = 0.18;
  system.add(tilt);
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 96),
    new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG }),
  );
  tilt.add(planet);

  const glowU = { uLean: { value: new THREE.Vector2(-0.6, 0.5) }, uSun: U.uSun, uPulse: U.uPulse };
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6),
    new THREE.ShaderMaterial({
      uniforms: glowU, transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: GLOW_FRAG,
    }),
  );
  glow.renderOrder = -1;
  // In the scene rather than the system, so it can face the camera when the flight swings it
  // round the planet (seen side-on, the disc became an ellipse).
  scene.add(glow);

  // ---------- the two orbits of words ----------
  // Where the old site set them: FULL-STACK arcs over the planet and CLOUD ENGINEERING under it.
  // Each ring is tilted just enough that its near side clears the planet's edge, so the words
  // are read against the sky; they turn away and thin out at the sides, and the far side, seen
  // through the ring from behind, is only a ghost.
  const premul = { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;
  const rings: { outer: THREE.Group; spin: THREE.Group; r: number; speed: number; phase: number; U: Record<string, THREE.IUniform> }[] = [];
  const addRing = (word: string, reps: number, colour: string, r: number, lean: number, roll: number, speed: number) => {
    const outer = new THREE.Group();
    outer.rotation.z = roll;
    const inner = new THREE.Group();
    inner.rotation.x = lean;
    const spin = new THREE.Group();
    const { tex, centre } = ringTexture(word, reps, colour, renderer);
    const RU = { uMap: { value: tex }, uReveal: { value: 1.2 }, uReps: { value: reps }, uAlpha: { value: 1 }, uFlash: { value: 0 } };
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, (2 * Math.PI * r) / (TEX_W / TEX_H), 360, 1, true),
      new THREE.ShaderMaterial({ uniforms: RU, vertexShader: RING_VERT, fragmentShader: RING_FRAG, ...premul }),
    );
    spin.add(band);
    inner.add(spin);
    outer.add(inner);
    system.add(outer);
    // Turned so a whole word faces the camera at the start: the band's front is u = 0 at no
    // rotation, and turning it by a brings u = -a / 2π round to the front.
    rings.push({ outer, spin, r, speed, phase: -centre * Math.PI * 2, U: RU });
  };
  addRing('FULL-STACK', 4, '#edebf5', 1.7, -0.68, -0.16, 0.075);
  addRing('CLOUD ENGINEERING', 3, '#c4b8ff', 1.92, 0.6, -0.08, -0.06);

  // ---------- comets on dotted orbits ----------
  const TAIL = 44;
  const comets: { orbit: THREE.Group; head: THREE.BufferAttribute; r: number; speed: number; phase: number; tail: number; U: Record<string, THREE.IUniform>; dotsU: Record<string, THREE.IUniform> }[] = [];
  const addComet = (r: number, lean: number, roll: number, speed: number, phase: number, colour: string, tail: number) => {
    const orbit = new THREE.Group();
    orbit.rotation.set(lean, 0, roll);
    const N = 220;
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3); }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    dg.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(N), 1));
    const dotsU = { uPx: { value: dpr }, uSize: { value: 1.7 }, uTail: { value: 0 }, uColor: { value: rgb('#b9adff') }, uAlpha: { value: 0.3 } };
    orbit.add(new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: dotsU, vertexShader: DOTS_VERT, fragmentShader: DOTS_FRAG, ...premul })));
    const cg = new THREE.BufferGeometry();
    const head = new THREE.BufferAttribute(new Float32Array(TAIL * 3), 3);
    head.setUsage(THREE.DynamicDrawUsage);
    cg.setAttribute('position', head);
    cg.setAttribute('aK', new THREE.BufferAttribute(Float32Array.from({ length: TAIL }, (_, i) => i / (TAIL - 1)), 1));
    const CU = { uPx: { value: dpr }, uSize: { value: 8 }, uTail: { value: 1 }, uColor: { value: rgb(colour) }, uAlpha: { value: 1 } };
    const pts2 = new THREE.Points(cg, new THREE.ShaderMaterial({ uniforms: CU, vertexShader: DOTS_VERT, fragmentShader: DOTS_FRAG, ...premul }));
    pts2.frustumCulled = false;
    orbit.add(pts2);
    system.add(orbit);
    comets.push({ orbit, head, r, speed, phase, tail, U: CU, dotsU });
  };
  addComet(2.02, 1.18, 0.52, 0.32, 0.6, '#d6ceff', 0.9);
  addComet(2.3, -0.16, -0.3, -0.2, 3.4, '#ffbf80', 1.1);

  // ---------- size ----------
  // The canvas covers the whole hero, so the flight (setFlight) can take the planet anywhere on
  // screen. At rest the system is framed in the stage cell beside the headline: the camera backs
  // off until FIT fills the cell (with the same spill past its edges the old in-cell canvas had),
  // and a view offset moves the picture's centre onto the cell's centre.
  const stageEl = document.querySelector<HTMLElement>('.hero__stage');
  let W = 1, H = 1, baseZ = 9, fitPx = 400;
  const off = { x: 0, y: 0 };
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const resize = () => {
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const c = canvas.getBoundingClientRect();
    const st = stageEl?.getBoundingClientRect();
    if (st && st.width && st.height) {
      fitPx = Math.min(st.width * 1.24, st.height * 1.16);
      off.x = st.left + st.width / 2 - (c.left + c.width / 2);
      off.y = st.top + st.height / 2 - (c.top + c.height / 2);
    } else { fitPx = Math.min(W, H); off.x = 0; off.y = 0; }
    baseZ = (FIT * H) / (fitPx * tanHalf);
    camera.updateProjectionMatrix();
    if (reduced) render();
  };

  // ---------- motion state ----------
  let spin = 0, orbitT = 0, spinVel = 0, boost = 0, flight = 0;
  const tiltTo = { x: 0, y: 0 }, tiltNow = { x: 0, y: 0 };
  const sunrise = { t: opts.formed || reduced ? 1 : 0 };
  const light = () => {
    // Dawn: the light comes round the planet's left limb from behind, so a thin crescent grows
    // into the resting half-moon (it never passes through full, which would dim at the end).
    const e = sunrise.t;
    const phi = -2.75 + (-1.14 + 2.75) * e;
    U.uLight.value.set(Math.sin(phi), 0.5 - 0.2 * (1 - e), Math.cos(phi)).normalize();
    U.uSun.value = 0.25 + 0.75 * e;
  };
  light();
  // The comets' brightness: the intro lights them, the flight's dive puts them out.
  let cometAlpha = opts.formed || reduced ? 1 : 0;
  if (!opts.formed && !reduced) rings.forEach((r) => { r.U.uReveal.value = 0; });

  // ---------- the flight out of the hero ----------
  // setFlight(t) runs while the hero is pinned (hero/index.ts). Its phases overlap:
  //   glide   0–0.32:    the planet leaves its cell for the middle of the screen
  //   wind    0.12–0.6:  it spins up, the rings whirl and widen, the comets spiral out
  //   swing   0.46–0.7:  the camera swings round to the night side, and the planet wanes to a
  //                      crescent with its lamps on
  //   descend 0.58–0.92: then dives at it: the rings rush out past the edges and fade, and finer
  //                      and finer lamps resolve as they come up at you
  //   fade    0.8–0.93:  the canvas fades, and the stars (sky.ts) carry on at warp speed
  // The first cut flew a straight line from the front to the surface: it filled the screen with
  // the lit limb, and the lamps (sized by their cells) swelled into blurry orange squares.
  const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const phase = () => ({ glide: ss(0, 0.32, flight), wind: ss(0.12, 0.6, flight), swing: ss(0.46, 0.7, flight), descend: ss(0.58, 0.92, flight), fade: ss(0.8, 0.93, flight) });
  // Where the dive is aimed: deep in the night, about 125 degrees from the light, below and right
  // of the face the camera starts on, so the swing is a little over a quarter turn.
  const FRONT = new THREE.Vector3(0, 0, 1);
  const NIGHT = U.uAim.value;
  /** How high over the surface the dive ends, in planet radii (the canvas has faded by then). */
  const LOW = 0.32;
  const dir = new THREE.Vector3(), camX = new THREE.Vector3(), camY = new THREE.Vector3(), camZ = new THREE.Vector3();
  let dist = 9;

  const place = () => {
    const { glide, wind, swing, descend, fade } = phase();
    // The camera: framed on the stage cell at rest; then (glide) onto the middle of the screen
    // and a little closer; then (swing) round to the night side; then (descend) straight down.
    // Height falls exponentially, so the approach is a steady rush rather than a slow start and
    // a lurch at the end; and it rolls a little, the way the stars are swirling.
    const back = baseZ * (1 - 0.14 * glide);
    dir.copy(FRONT).lerp(NIGHT, swing).normalize();
    dist = 1 + (back - 1) * Math.pow(LOW / (back - 1), descend);
    camera.position.copy(dir).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(descend * 0.45);
    camera.updateMatrixWorld();
    const k = 1 - glide;
    camera.setViewOffset(W, H, -off.x * k, -off.y * k, W, H);
    // The glow faces the camera wherever it is, leaning toward the light as it falls on screen.
    glow.quaternion.copy(camera.quaternion);
    camera.matrixWorld.extractBasis(camX, camY, camZ);
    glowU.uLean.value.set(U.uLight.value.dot(camX) * 1.12, U.uLight.value.dot(camY));
    U.uNear.value = descend;

    // Comets: the head at its angle, the tail laid back along the orbit, longer while the system
    // is whirling, and the orbits spiral out as it winds up. They go out as the dive closes on
    // their orbits (up close, a head is a point sprite the size of a coin).
    const stretch = 1 + Math.min(3, boost * 14 + Math.abs(spinVel) * 20 + wind * 1.6);
    comets.forEach((c) => {
      const a0 = c.phase + orbitT * c.speed;
      const r = c.r * (1 + wind * 0.7);
      const arr = c.head.array as Float32Array;
      for (let i = 0; i < TAIL; i++) {
        const a = a0 - Math.sign(c.speed) * (i / (TAIL - 1)) * c.tail * stretch;
        arr[i * 3] = Math.cos(a) * c.r; arr[i * 3 + 1] = 0; arr[i * 3 + 2] = Math.sin(a) * c.r;
      }
      c.head.needsUpdate = true;
      c.orbit.scale.setScalar(1 + wind * 0.7);
      const out = ss(r * 1.25, r * 2.1, dist);
      c.U.uAlpha.value = cometAlpha * out;
      c.dotsU.uAlpha.value = 0.3 * cometAlpha * out;
    });
    rings.forEach((r) => {
      r.spin.rotation.y = r.phase + orbitT * r.speed;
      const sc = 1 + wind * 0.45;
      r.outer.scale.setScalar(sc);
      // The dive passes through the rings: the words rush out past the edges of the screen and
      // fade before the camera reaches them (close up, a band is one magnified, blurry letter).
      r.U.uAlpha.value = ss(r.r * sc * 1.05, r.r * sc * 1.75, dist);
    });
    planet.rotation.y = spin;
    system.rotation.x = tiltNow.x * (1 - glide);
    system.rotation.y = tiltNow.y * (1 - glide);
    canvas.style.opacity = fade > 0 ? String(1 - fade) : '';
  };
  function render() { place(); renderer.render(scene, camera); }

  // ---------- input ----------
  // Pointing tilts the system a few degrees toward the cursor.
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    tiltTo.y = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2))) * 0.16;
    tiltTo.x = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2))) * 0.1;
  };
  if (!reduced) window.addEventListener('pointermove', onMove, { passive: true });
  // Dragging spins the planet, and the rings wind up with it; letting go, they coast. A tap on
  // the planet that is not a drag is the planet's to answer (hero/index.ts: a meteor shower).
  let drag: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  // The planet's middle on screen (viewport px) and its radius there, at rest.
  const where = () => {
    const r = canvas.getBoundingClientRect();
    const k = 1 - phase().glide;
    return { x: r.left + r.width / 2 + off.x * k, y: r.top + r.height / 2 + off.y * k, r: (fitPx / 2) / FIT };
  };
  const onPlanet = (e: PointerEvent) => {
    const c = where();
    return flight < 0.02 && Math.hypot(e.clientX - c.x, e.clientY - c.y) < c.r * 1.25 * 1.15;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || flight > 0.02) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    canvas.style.cursor = drag?.moved ? 'grabbing' : onPlanet(e) ? 'grab' : '';
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; canvas.setPointerCapture(e.pointerId); }
    if (!drag.moved) return;
    const dt = Math.max(1, e.timeStamp - drag.t);
    const k = 3.2 / canvas.clientWidth;
    spin += dx * k; orbitT += dx * k * 4;
    spinVel = (dx * k) / dt * 16;
    drag.x = e.clientX; drag.t = e.timeStamp;
    if (reduced) render();
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const tapped = !drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6 && onPlanet(e);
    drag = null;
    canvas.style.cursor = '';
    if (tapped) { flash(); opts.onTap?.(); }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  const flash = () => {
    if (reduced) return;
    rings.forEach((r) => gsap.fromTo(r.U.uFlash, { value: 0.9 }, { value: 0, duration: 1.2, ease: 'power2.out' }));
    gsap.fromTo(U.uPulse, { value: 0.8 }, { value: 0, duration: 1.4, ease: 'power2.out' });
    spinVel += 0.02;
  };

  // ---------- loop ----------
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  let last = performance.now();
  let frames = 0;
  (window as unknown as { __heroFrames: () => number }).__heroFrames = () => frames;
  const frame = () => {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (document.hidden || !visible) return;
    frames++;
    // The planet turns once every two minutes or so; the words go round faster.
    // Scrolling fast winds the rings and comets up (boost, from setFlight), and they coast down.
    const { wind, swing, descend, fade } = phase();
    // The flight spins it up, and it settles as the camera swings round and dives: still turning
    // under a camera that close, the lamps slid sideways instead of rushing up.
    spin += (dt * (0.05 + wind * 0.9 * (1 - swing)) + spinVel + boost * 0.2) * (1 - descend) ** 2;
    orbitT += dt * (1 + wind * 11) + spinVel * 4 + boost * 3;
    spinVel *= 0.95;
    boost *= 0.93;
    if (Math.abs(spinVel) < 1e-5) spinVel = 0;
    if (boost < 1e-4) boost = 0;
    tiltNow.x += (tiltTo.x - tiltNow.x) * 0.05;
    tiltNow.y += (tiltTo.y - tiltNow.y) * 0.05;
    // Music (the GameOver player): the atmosphere breathes with the bass and the words
    // brighten a touch on each kick. Faint on purpose, as Omer asked of the old hero.
    const fake = debug ? (window as unknown as { __levels?: Levels | null }).__levels : undefined;
    const lv = fake ?? opts.levels?.() ?? null;
    const pulse = (lv ? lv.bass * 0.22 + lv.kick * 0.12 : 0) + wind * 0.5;
    if (pulse > U.uPulse.value) U.uPulse.value += (pulse - U.uPulse.value) * 0.5;
    else U.uPulse.value += (pulse - U.uPulse.value) * 0.08;
    // Past the flight the canvas has faded out but is still on screen as the hero scrolls away:
    // there is nothing to see, so nothing to draw (a full-screen planet is the costliest frame).
    if (fade >= 1) { canvas.style.opacity = '0'; return; }
    render();
  };
  resize();
  new ResizeObserver(resize).observe(canvas);
  if (reduced) render();
  else requestAnimationFrame(frame);

  return {
    /** Dawn on the planet, then the words write themselves in and the comets light. */
    intro() {
      const tl = gsap.timeline();
      if (opts.formed || reduced) return tl;
      tl.to(sunrise, { t: 1, duration: 2.6, ease: 'power2.inOut', onUpdate: light }, 0.1)
        .to(rings.map((r) => r.U.uReveal), { value: 1.2, duration: 1.6, ease: 'power1.inOut', stagger: 0.35 }, 1.0)
        .to({ a: 0 }, { a: 1, duration: 1.2, ease: 'power2.out', onUpdate() { cometAlpha = this.targets()[0].a; } }, 1.6);
      return tl;
    },
    /**
     * The flight out of the hero, 0–1 (see "the flight out of the hero" above). `v` is the
     * scroll's speed in px/s: a fast flick winds the rings up on top of the flight.
     */
    setFlight(t: number, v = 0) {
      // Reduced motion: no flight; the canvas simply scrolls away with the page.
      if (reduced) return;
      flight = t;
      boost = Math.max(boost, Math.min(0.08, Math.abs(v) * 2.4e-5));
    },
    /** The planet's middle on screen, in viewport pixels: the stars swirl round it. */
    centre() { return where(); },
  };
}
