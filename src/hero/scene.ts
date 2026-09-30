import * as THREE from 'three';
import gsap from 'gsap';
import { GPUComputationRenderer, type Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { CommitData } from '../repos';
import type { Levels } from '../audio';
import { ShapeFactory, STEAM, type Shape, type ShapeId } from './shapes';

// The hero light sculpture. Particle state lives in two float textures (position, velocity)
// advanced on the GPU every frame. Each particle is pulled toward its place in the current
// shape by a spring, stirred by a cheap divergence-free flow field, pushed around by the
// cursor, and lit by how fast it is moving. Morphing swaps the spring target; the springs do
// the animation, so a morph can be interrupted at any moment without a jump.

const FLOW = /* glsl */ `
  // Each component ignores its own axis, so the base field is divergence-free: it swirls
  // without clumping. A light domain warp breaks the regularity.
  vec3 flow(vec3 p, float t) {
    vec3 q = p * 0.55;
    vec3 a = vec3(sin(q.y * 1.7 + t * 0.9) + cos(q.z * 2.3 - t * 0.6),
                  sin(q.z * 1.9 + t * 0.7) + cos(q.x * 2.1 + t * 0.8),
                  sin(q.x * 1.5 - t * 0.5) + cos(q.y * 2.7 + t * 0.4));
    q = q * 2.3 + a * 0.35;
    vec3 b = vec3(sin(q.y * 1.3 - t * 1.1) + cos(q.z * 1.1 + t * 0.7),
                  sin(q.z * 1.7 + t * 0.9) + cos(q.x * 1.3 - t * 0.6),
                  sin(q.x * 1.1 + t * 1.2) + cos(q.y * 1.9 - t * 0.8));
    return a * 0.6 + b * 0.4;
  }
`;

const PLACE = /* glsl */ `
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  vec3 place(vec3 local, vec4 X, float S, vec3 O, float t) {
    float ry = X.y + X.z * t + X.w * sin(t * 0.5);
    return rotX(X.x) * (rotY(ry) * local) * S + O;
  }
  float morphK(float m, float rnd) {
    float k = clamp((m - rnd * 0.4) / 0.6, 0.0, 1.0);
    return k * k * (3.0 - 2.0 * k);
  }
`;

// Moves the particles that are not fixed points (shapes.ts, "Particle kinds"). A glyph of
// steam rises up its column, sways, turns and comes apart; vapour widens as it climbs; the
// coffee's surface ripples, harder on the bass. Everything else passes straight through.
// \`fade\` is the particle's opacity on the way up: in at the cup, gone before the top, so the
// jump from the top of the plume back down to the cup happens while it is invisible.
const f5 = (n: number) => n.toFixed(5);
const lane = (k: number) => `vec2(${f5(STEAM.lanes[k][0])}, ${f5(STEAM.lanes[k][1])})`;
const STEAM_GLSL = /* glsl */ `
  uniform float uBass;
  vec3 local(vec4 t, float time, out float fade) {
    fade = 1.0;
    float kind = floor(t.w);
    if (kind < 1.5 || kind > 4.5) return t.xyz;
    if (kind > 3.5) {
      float d = length(t.xz);
      return vec3(t.x, t.y + sin(d * 90.0 - time * 3.2) * (0.0025 + uBass * 0.012), t.z);
    }
    float ln = floor(t.z);
    float ph = fract(time * ${f5(STEAM.speed)} + fract(t.z));
    vec2 l = ln < 0.5 ? ${lane(0)} : (ln < 1.5 ? ${lane(1)} : ${lane(2)});
    vec3 right = vec3(${f5(STEAM.right[0])}, 0.0, ${f5(STEAM.right[1])});
    float sway = sin(ph * 5.2 + ln * 2.1 + time * 0.7) * (0.014 + 0.05 * ph) + sin(ph * 11.0 + ln * 4.0 + time * 1.3) * 0.008 * ph;
    vec3 a = vec3(l.x, ${f5(STEAM.y0)} + ph * ${f5(STEAM.h)}, l.y) + right * sway;
    fade = smoothstep(0.0, 0.14, ph) * (1.0 - smoothstep(0.46, 0.95, ph));
    if (kind < 2.5) {
      float s = ${f5(STEAM.glyph)} * (1.0 + ph * 0.6);
      float ang = sin(time * 0.6 + ln * 1.9 + ph * 5.0) * 0.45 * ph;
      vec2 d = vec2(cos(ang) * t.x - sin(ang) * t.y, sin(ang) * t.x + cos(ang) * t.y) * s;
      d += (vec2(fract(t.w * 37.17), fract(t.w * 91.31)) - 0.5) * ph * ph * 0.12;
      return a + right * d.x + vec3(0.0, d.y, 0.0);
    }
    fade *= 0.55;
    float w = 0.01 + 0.04 * ph;
    return a + right * (t.x * w) + vec3(0.0, t.y * w * 0.6, t.y * w * 0.5);
  }
`;

const VELOCITY = /* glsl */ `
  uniform float uTime, uSpring, uDamp, uNoise, uFlow, uReveal, uMorph, uScatter;
  uniform sampler2D uTA, uTB;
  uniform vec4 uXA, uXB;
  uniform float uSA, uSB;
  uniform vec3 uOA, uOB, uView;
  uniform vec3 uMouse, uMouseVel;
  uniform float uMouseR, uMouseOn;
  uniform vec4 uShock;
  uniform vec2 uRevealBox, uRevealDir;
  uniform float uPump;
  ${FLOW}
  ${PLACE}
  ${STEAM_GLSL}
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 p = texture2D(texPos, uv).xyz;
    vec3 v = texture2D(texVel, uv).xyz;
    vec4 ta = texture2D(uTA, uv);
    vec4 tb = texture2D(uTB, uv);
    float dust = step(5.0, ta.w);
    float rnd = fract(ta.w);

    vec3 A = ta.xyz * uView;
    vec3 B = A;
    float fa = 1.0, fb = 1.0;
    if (dust < 0.5) {
      A = place(local(ta, uTime, fa), uXA, uSA, uOA, uTime);
      B = place(local(tb, uTime, fb), uXB, uSB, uOB, uTime);
    }
    float k = morphK(uMorph, rnd);
    vec3 target = mix(A, B, k);
    // Music: the whole shape swells with the bass (dust stays put).
    vec3 centre = mix(uOA, uOB, k);
    target = mix(target, centre + (target - centre) * (1.0 + uPump), 1.0 - dust);
    // Travelling particles arc toward the camera, so a morph reads as a wave, not a slide.
    target.z += sin(k * 3.14159) * (0.4 + rnd) * 0.9 * (1.0 - dust);

    // Intro: the sculpture assembles along uRevealDir (the mug fills from the bottom up).
    float rx = clamp((dot(target.xy, uRevealDir) - uRevealBox.x) / uRevealBox.y, 0.0, 1.0);
    float d0 = rx * 0.7 + rnd * 0.3;
    float gate = dust > 0.5 ? smoothstep(0.1, 1.0, uReveal) : smoothstep(d0, d0 + 0.22, uReveal);

    // The sculpture is never still: its targets drift on the flow field.
    target += flow(target * 1.3, uTime * 0.55) * uFlow * (1.0 + dust * 10.0);

    float spring = uSpring * gate * (1.0 - dust * 0.8) * (1.0 - uScatter);
    vec3 acc = (target - p) * spring;
    acc += flow(p * 0.8, uTime * 0.8) * uNoise * (1.0 + (1.0 - gate) * 4.0);

    // Cursor: a soft push, a swirl, and a drag in the direction of travel.
    vec2 dm = p.xy - uMouse.xy;
    float dist = length(dm);
    float fall = 1.0 - smoothstep(0.0, uMouseR, dist);
    fall *= fall * uMouseOn;
    vec2 dir = dm / (dist + 1e-4);
    acc.xy += dir * fall * 0.03;
    acc.xy += vec2(-dir.y, dir.x) * fall * 0.018;
    acc += uMouseVel * fall * 0.55;
    acc.z += fall * (rnd - 0.3) * 0.045;

    // Click shockwave.
    vec3 ds = p - uShock.xyz;
    float sd = length(ds);
    acc += (ds / (sd + 1e-4)) * uShock.w * exp(-sd * 0.8) * (0.6 + rnd * 0.8);

    // Scroll: let go of the shape and drift toward the camera.
    if (uScatter > 0.001) {
      acc += flow(p * 0.45, uTime * 0.4) * uScatter * 0.014;
      acc.z += uScatter * (0.003 + rnd * 0.012);
    }

    v = v * uDamp + acc;
    gl_FragColor = vec4(v, 1.0);
  }
`;

const POSITION = /* glsl */ `
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 p = texture2D(texPos, uv);
    p.xyz += texture2D(texVel, uv).xyz;
    gl_FragColor = p;
  }
`;

const POINT_VERT = /* glsl */ `
  uniform sampler2D texPos, texVel, uTA, uTB, uCA, uCB;
  uniform float uMorph, uSize, uPixel, uAlphaA, uAlphaB, uDustAlpha, uFade, uTime, uBoost, uSpark, uGlint;
  attribute vec2 ref;
  varying vec3 vCol;
  varying float vA;
  ${PLACE}
  ${STEAM_GLSL}
  void main() {
    vec3 p = texture2D(texPos, ref).xyz;
    vec3 v = texture2D(texVel, ref).xyz;
    float w = texture2D(uTA, ref).w;
    float dust = step(5.0, w);
    float rnd = fract(w);
    float k = morphK(uMorph, rnd);
    vec3 col = mix(texture2D(uCA, ref).rgb, texture2D(uCB, ref).rgb, k);
    // Heat: disturbed particles burn ember-pink, then cool back to their own colour.
    float speed = length(v);
    float heat = clamp(speed * 10.0, 0.0, 1.0);
    col = mix(col, vec3(1.0, 0.42, 0.38), heat * 0.8);
    col += vec3(1.0, 0.75, 0.55) * heat * 0.3;
    col *= 0.78 + 0.22 * sin(uTime * 1.7 + rnd * 70.0);
    // Music: bass and kicks brighten a little; hi-hats flash a scatter of particles.
    col *= 1.0 + uBoost;
    // A slow glint crosses the sculpture every few seconds, like light over something solid.
    float band = p.x + p.y * 0.35 - uGlint;
    col *= 1.0 + exp(-band * band * 1.4) * 0.6 * (1.0 - dust);
    float flash = step(0.985, fract(sin(rnd * 913.1 + floor(uTime * 14.0) * 71.7) * 43758.5));
    col += vec3(1.0, 0.92, 0.85) * flash * uSpark * 1.4 * (1.0 - dust);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = uSize * (0.5 + rnd * 1.0);
    if (dust > 0.5) s = uSize * (0.4 + rnd * 0.8) * clamp(1.0 + (p.z + 2.0) * 0.35, 0.6, 3.0);
    gl_PointSize = max(1.0, s * uPixel * (12.0 / -mv.z) * (1.0 + uBoost * 0.45));
    vCol = col;
    float fa, fb;
    local(texture2D(uTA, ref), uTime, fa);
    local(texture2D(uTB, ref), uTime, fb);
    vA = uFade * (dust > 0.5 ? uDustAlpha : mix(uAlphaA * fa, uAlphaB * fb, k));
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = 1.0 - d * 4.0;
    gl_FragColor = vec4(vCol, a * a * vA);
  }
`;

// Lens: slight chromatic dispersion toward the edges, plus a vignette.
const LENS = {
  uniforms: { tDiffuse: { value: null }, uCA: { value: 0.005 }, uFade: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uCA; uniform float uFade; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uCA * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = 1.0 - exp(-col * 1.25);
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.22);
      col *= 1.0 - smoothstep(0.18, 0.62, r2) * 0.55;
      col = mix(vec3(0.027, 0.027, 0.047), col, uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export type Hero = Awaited<ReturnType<typeof createHero>>;

export async function createHero(opts: { canvas: HTMLCanvasElement; data: CommitData; reduced: boolean; first?: ShapeId; onShapeReady?: (id: ShapeId) => void; levels?: () => Levels | null }) {
  const { canvas, data, reduced } = opts;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700 || coarse;
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  const fixedDt = Number(params.get('fixeddt')) || 0;
  // ?still=<shape> starts formed and skips the intro (screenshots). The old name is an alias.
  const stillParam = params.get('still');
  const still = (stillParam === 'name' ? 'mug' : stillParam) as ShapeId | null;
  // The coffee: the hot mug by default, iced one tap away (hero/index.ts).
  const first: ShapeId = opts.first ?? 'mug';
  const start: ShapeId = still ?? first;
  const coffeeOf = (id: ShapeId) => (id === 'iced' ? factory.iced() : factory.mug());
  const cores = navigator.hardwareConcurrency || 4;
  const SIZE = Number(params.get('size')) || (small ? 256 : cores >= 8 ? 512 : 384);
  const POINT_SIZE = small ? 2.6 : 2.4;

  if (params.has('nogl')) throw new Error('WebGL disabled by ?nogl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
  let pixelRatio = Math.min(window.devicePixelRatio, small ? 1.5 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x07070c, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const CAM_Z = 14;
  camera.position.set(0, 0, CAM_Z);

  // ---------- shapes ----------
  // Shapes are drawn with these faces; the headline's faces decide where the stage sits on a
  // phone, so they are waited for too before anything is measured.
  await Promise.all(['400 200px "Anton"', '800 60px "Manrope"', '400 34px "JetBrains Mono"', '800 60px "Syne"', 'italic 400 60px "Instrument Serif"']
    .map((f) => document.fonts.load(f).catch(() => undefined)));
  const factory = new ShapeFactory(SIZE);
  const shapes = new Map<ShapeId, Shape>();
  shapes.set(first, coffeeOf(first));
  const tex = new Map<ShapeId, { pos: THREE.DataTexture; col: THREE.DataTexture }>();
  const toTex = (s: Shape) => {
    const pos = new THREE.DataTexture(s.pos, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
    pos.needsUpdate = true;
    const col = new THREE.DataTexture(s.col, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    col.needsUpdate = true;
    tex.set(s.id, { pos, col });
  };
  toTex(shapes.get(first)!);
  if (still && still !== first) {
    const s = still === 'iced' || still === 'mug' ? coffeeOf(still) : still === 'apps' ? factory.phone() : still === 'systems' ? factory.systems() : still === 'commits' ? factory.commits(data) : still === 'me' ? await factory.portrait('img/profile.webp') : factory.text('hello', ['HELLO'], ['#ffd2a8', '#ff9d6b', '#ff6f91']);
    shapes.set(s.id, s); toTex(s);
  }
  // The rest are built after the first frame so the intro is not delayed.
  const later = async () => {
    const add = (s: Shape) => { if (!shapes.has(s.id) || !tex.has(s.id)) { shapes.set(s.id, s); toTex(s); } opts.onShapeReady?.(s.id); };
    add(coffeeOf(first === 'iced' ? 'mug' : 'iced'));
    await idle();
    add(factory.phone());
    await idle();
    add(factory.systems());
    await idle();
    add(factory.text('hello', ['HELLO'], ['#ffd2a8', '#ff9d6b', '#ff6f91']));
    await idle();
    try { add(await factory.portrait('img/profile.webp')); } catch { /* portrait stays unavailable */ }
  };

  // ---------- layout ----------
  const view = { w: 1, h: 1, px: 1 };
  // The sculpture lives in the hero's stage: an empty grid cell beside the headline (below it
  // on a phone) that CSS places at every width. Its rectangle, in world units on the z = 0
  // plane, is what every shape is fitted into, so the layout never has to be restated here.
  const stageEl = document.querySelector<HTMLElement>('.hero__stage');
  const stage = { x: 0, y: 0, w: 1, h: 1 };
  const measureStage = () => {
    const c = canvas.getBoundingClientRect();
    const r = stageEl?.getBoundingClientRect();
    if (!r || !r.width || !r.height || !c.width || !c.height) { stage.x = 0; stage.y = 0; stage.w = view.w; stage.h = view.h; return; }
    stage.w = (r.width / c.width) * view.w;
    stage.h = (r.height / c.height) * view.h;
    stage.x = ((r.left + r.width / 2 - c.left) / c.width - 0.5) * view.w;
    stage.y = (0.5 - (r.top + r.height / 2 - c.top) / c.height) * view.h;
  };
  let current: ShapeId = start;
  let next: ShapeId = current;
  const fitOf = (s: Shape) => {
    const scale = Math.min((stage.w * s.fit[0]) / s.w, (stage.h * s.fit[1]) / s.h);
    // Keep perceived brightness constant: fewer screen pixels per particle means dimmer particles.
    const pxPerUnit = view.px / view.h;
    const litPx = s.area * s.w * s.h * scale * scale * pxPerUnit * pxPerUnit;
    const pointArea = 0.207 * POINT_SIZE * POINT_SIZE;
    const coverage = (factory.count * (15 / 16) * pointArea) / Math.max(litPx, 1);
    // (15/16: every sixteenth particle is dust)
    const alpha = Math.min(0.85, Math.max(0.05, 0.95 / coverage));
    // lift is a fraction of the shape's own height, so a shape whose light sits low in its box
    // (the mug: the top of its steam has faded out) is centred by what you actually see.
    return { scale, alpha, offset: new THREE.Vector3(stage.x, stage.y + s.h * scale * s.lift, 0) };
  };
  const applySlot = (slot: 'A' | 'B', id: ShapeId) => {
    const s = shapes.get(id)!;
    const t = tex.get(id)!;
    const f = fitOf(s);
    if (slot === 'A') {
      U.uTA.value = t.pos; PU.uCA.value = t.col;
      U.uSA.value = f.scale; U.uOA.value.copy(f.offset); U.uXA.value.set(...s.xform); PU.uAlphaA.value = f.alpha;
    } else {
      U.uTB.value = t.pos; PU.uCB.value = t.col;
      U.uSB.value = f.scale; U.uOB.value.copy(f.offset); U.uXB.value.set(...s.xform); PU.uAlphaB.value = f.alpha;
    }
  };
  const measureView = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    view.h = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view.w = view.h * camera.aspect;
    view.px = h;
    measureStage();
    return { w, h };
  };
  measureView();
  // CPU copy of the shader's place(), used to start particles already formed.
  const placeCPU = (sh: Shape) => {
    const f = fitOf(sh);
    const [tx, ry] = sh.xform;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(tx), sx = Math.sin(tx);
    return (o: number, out: Float32Array) => {
      const x = sh.pos[o], y = sh.pos[o + 1], z = sh.pos[o + 2];
      if (sh.pos[o + 3] >= 5) { out[o] = x * view.w; out[o + 1] = y * view.h; out[o + 2] = z * view.h; return; }
      const X = cy * x + sy * z, Z = -sy * x + cy * z;
      const Y2 = cx * y - sx * Z, Z2 = sx * y + cx * Z;
      out[o] = X * f.scale + f.offset.x; out[o + 1] = Y2 * f.scale + f.offset.y; out[o + 2] = Z2 * f.scale + f.offset.z;
    };
  };

  // ---------- GPGPU ----------
  const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);
  if (!renderer.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType);
  const pos0 = gpu.createTexture();
  const vel0 = gpu.createTexture();
  {
    const p = pos0.image.data as Float32Array;
    const put = placeCPU(shapes.get(start)!);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const o = i * 4;
      if (reduced || still) {
        // Start fully formed.
        put(o, p);
      } else {
        // Start as a single star in the middle of the stage: the first commit.
        const r = Math.cbrt(Math.random()) * 0.03;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        p[o] = stage.x + r * Math.sin(ph) * Math.cos(th); p[o + 1] = stage.y + r * Math.cos(ph); p[o + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      p[o + 3] = 1;
    }
  }
  const velVar: Variable = gpu.addVariable('texVel', VELOCITY, vel0);
  const posVar: Variable = gpu.addVariable('texPos', POSITION, pos0);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  const nameT = tex.get(start)!;
  const U = {
    uTime: { value: 0 },
    uSpring: { value: 0.016 },
    uDamp: { value: 0.885 },
    uNoise: { value: 0.0004 },
    uFlow: { value: 0.022 },
    uReveal: { value: reduced || still ? 2 : 0 },
    uMorph: { value: 0 },
    uScatter: { value: 0 },
    uTA: { value: nameT.pos as THREE.Texture },
    uTB: { value: nameT.pos as THREE.Texture },
    uXA: { value: new THREE.Vector4() },
    uXB: { value: new THREE.Vector4() },
    uSA: { value: 1 },
    uSB: { value: 1 },
    uOA: { value: new THREE.Vector3() },
    uOB: { value: new THREE.Vector3() },
    uView: { value: new THREE.Vector3(1, 1, 1) },
    uMouse: { value: new THREE.Vector3(99, 99, 0) },
    uMouseVel: { value: new THREE.Vector3() },
    uMouseR: { value: 1 },
    uMouseOn: { value: 0 },
    uShock: { value: new THREE.Vector4(0, 0, 0, 0) },
    uRevealBox: { value: new THREE.Vector2(-5, 10) },
    uRevealDir: { value: new THREE.Vector2(0, 1) },
    uPump: { value: 0 },
    uBass: { value: 0 },
  };
  Object.assign(velVar.material.uniforms, U);
  const err = gpu.init();
  if (err) throw new Error(err);

  // ---------- points ----------
  const geo = new THREE.BufferGeometry();
  const ref = new Float32Array(SIZE * SIZE * 2);
  for (let i = 0; i < SIZE * SIZE; i++) {
    ref[i * 2] = ((i % SIZE) + 0.5) / SIZE;
    ref[i * 2 + 1] = (Math.floor(i / SIZE) + 0.5) / SIZE;
  }
  geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SIZE * SIZE * 3), 3));
  const PU = {
    texPos: { value: null as THREE.Texture | null },
    texVel: { value: null as THREE.Texture | null },
    uTA: U.uTA,
    uTB: U.uTB,
    uBass: U.uBass,
    uCA: { value: nameT.col as THREE.Texture },
    uCB: { value: nameT.col as THREE.Texture },
    uMorph: U.uMorph,
    uTime: U.uTime,
    uSize: { value: POINT_SIZE },
    uPixel: { value: pixelRatio },
    uAlphaA: { value: 0.5 },
    uAlphaB: { value: 0.5 },
    uDustAlpha: { value: small ? 0.2 : 0.16 },
    uFade: { value: 1 },
    uBoost: { value: 0 },
    uSpark: { value: 0 },
    uGlint: { value: -99 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: PU,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  scene.add(points);

  // ---------- post ----------
  let quality = 2;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), small ? 0.5 : 0.6, 0.4, 0.62);
  composer.addPass(bloom);
  if (params.has('nobloom')) bloom.enabled = false;
  const lens = new ShaderPass(LENS);
  composer.addPass(lens);

  function resize() {
    const { w, h } = measureView();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    U.uView.value.set(view.w, view.h, view.h);
    U.uMouseR.value = Math.max(view.w, view.h) * (small ? 0.14 : 0.085);
    applySlot('A', current);
    applySlot('B', next);
    // The intro builds the first shape from its foot up to the top of its steam.
    const first = shapes.get(start)!;
    const ff = fitOf(first);
    U.uRevealBox.value.set(ff.offset.y - (first.h / 2) * ff.scale, first.h * ff.scale);
  }
  resize();
  window.addEventListener('resize', resize);
  // A phone's stage is whatever the headline leaves, so it moves when the type settles.
  if (stageEl && 'ResizeObserver' in window) new ResizeObserver(() => resize()).observe(stageEl);
  // Starting formed (reduced motion, ?still): run the springs until the steam, which placeCPU
  // leaves where it was packed, has found its place.
  if (reduced || still) for (let n = 0; n < 150; n++) gpu.compute();

  // ---------- interaction ----------
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const lastHit = new THREE.Vector3();
  const mouseVel = new THREE.Vector3();
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let hasHit = false;
  function toWorld(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    parallax.tx = ndc.x; parallax.ty = ndc.y;
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit);
  }
  const onMove = (e: PointerEvent) => {
    if (!toWorld(e)) return;
    if (hasHit) mouseVel.lerp(hit.clone().sub(lastHit).clampLength(0, 0.5), 0.5);
    lastHit.copy(hit);
    hasHit = true;
    U.uMouse.value.copy(hit);
    gsap.to(U.uMouseOn, { value: 1, duration: 0.3, overwrite: true });
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  const release = () => { hasHit = false; gsap.to(U.uMouseOn, { value: 0, duration: 0.6, overwrite: true }); };
  document.documentElement.addEventListener('pointerleave', release);
  // A lifted finger must let go, or the letters keep a dent where it last touched.
  const onUp = (e: PointerEvent) => { if (e.pointerType !== 'mouse') release(); };
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerdown', (e) => {
    if (!toWorld(e)) return;
    shock(hit.x, hit.y, 0.07);
  });
  function shock(x: number, y: number, strength: number) {
    U.uShock.value.set(x, y, 0, strength);
  }

  // ---------- morphing ----------
  let morphTween: gsap.core.Tween | null = null;
  function setShape(id: ShapeId) {
    if (!shapes.has(id) || id === next) return false;
    // Whatever was on its way becomes the new origin; springs keep positions continuous.
    if (U.uMorph.value > 0) { current = next; applySlot('A', current); }
    next = id;
    applySlot('B', next);
    U.uMorph.value = 0;
    morphTween?.kill();
    // A small burst loosens the old shape before the new one pulls.
    shock(stage.x, stage.y, 0.018);
    morphTween = gsap.to(U.uMorph, {
      value: 1, duration: reduced ? 0.01 : 1.9, ease: 'power2.inOut',
      onComplete: () => { current = next; applySlot('A', current); U.uMorph.value = 0; },
    });
    return true;
  }

  // ---------- intro ----------
  function intro() {
    const tl = gsap.timeline();
    if (reduced) return tl;
    // The burst scales with the view, so a phone does not fling the storm off-screen.
    const k = Math.min(1, Math.max(0.35, view.w / 12));
    tl.set(U.uNoise, { value: 0 })
      .set(U.uDamp, { value: 0.9 })
      .add(() => shock(stage.x, stage.y, 0.16 * k), 0.55)
      .to(U.uNoise, { value: 0.006 * k, duration: 0.4, ease: 'power2.out' }, 0.55)
      .to(U.uReveal, { value: 1.25, duration: 2.6, ease: 'power2.inOut' }, 1.0)
      .to(U.uNoise, { value: 0.0004, duration: 1.6, ease: 'power2.out' }, 2.1)
      .to(U.uDamp, { value: 0.885, duration: 1.0 }, 2.4);
    return tl;
  }

  // ---------- loop ----------
  let scroll = 0;
  // Checked every frame: the scroll pin re-parents the section, which confuses observers.
  const onScreen = () => { const r = canvas.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.width > 0; };
  const frameTimes: number[] = [];
  let last = performance.now();
  let frames = 0;
  (window as unknown as { __heroFrames: () => number }).__heroFrames = () => frames;

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden || !onScreen()) { last = performance.now(); return; }
    const now = performance.now();
    // ?fixeddt=0.0167 steps time by a fixed amount per frame, so a slow headless browser
    // shows the motion a real 60 fps screen would (screenshots of the steam).
    const dt = fixedDt || Math.min((now - last) / 1000, 0.05);
    last = now;
    frames++;
    if (!reduced) U.uTime.value += dt;
    // Adaptive quality: drop bloom, then resolution, if the device struggles.
    if (frames > 90 && frames < 400) {
      frameTimes.push(dt);
      if (frameTimes.length === 90) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        if (avg > 0.03 && quality > 0) {
          quality--;
          if (quality === 1) { bloom.enabled = false; }
          if (quality === 0) { pixelRatio = 1; renderer.setPixelRatio(1); PU.uPixel.value = 1; resize(); }
        }
        frameTimes.length = 0;
      }
    }
    U.uShock.value.w *= 0.82;
    if (U.uShock.value.w < 1e-4) U.uShock.value.w = 0;
    U.uMouseVel.value.copy(mouseVel);
    mouseVel.multiplyScalar(0.86);

    // Music (the GameOver player). Each kick lands like a softer click: a swell that settles
    // within the beat, and a push out from the middle of the sculpture. A click is 0.07 right
    // under the pointer; the kick's 0.05 starts at the centre, so by the time it reaches the
    // surface it is a nudge.
    // The bass ripples the coffee, the mids stir the flow, the hats sparkle. Brightness only
    // moves a little: a strobe on every kick read as flicker, not as a pulse.
    // Kept deliberately faint: the coffee should feel the music, not bounce to it. Once real
    // beats arrived (bass that moves, kicks that fire: audio.ts) Omer asked twice to turn it
    // down, on 2026-09-29 ("tone it down a bit", then "reduce the pulse more"); every amount
    // here is about a quarter of the first tuning.
    const fake = debug ? (window as unknown as { __levels?: Levels | null }).__levels : undefined;
    const lv = reduced ? null : fake ?? opts.levels?.() ?? null;
    const ease = (u: { value: number }, v: number, k: number) => { u.value += (v - u.value) * k; };
    ease(PU.uBoost, lv ? lv.bass * 0.07 + lv.kick * 0.05 : 0, lv ? 0.6 : 0.08);
    ease(PU.uSpark, lv ? lv.high * 0.22 : 0, lv ? 0.6 : 0.1);
    ease(U.uPump, lv ? lv.bass * 0.006 + lv.kick * 0.017 : 0, lv ? 0.5 : 0.08);
    ease(U.uBass, lv ? lv.bass * 0.3 : 0, 0.3);
    ease(U.uFlow, 0.022 * (1 + (lv ? lv.mid * 0.6 : 0)), 0.2);
    if (lv && lv.kick > 0.95 && scroll < 0.2) shock(U.uOB.value.x, U.uOB.value.y, 0.012);

    parallax.x += (parallax.tx - parallax.x) * 0.04;
    parallax.y += (parallax.ty - parallax.y) * 0.04;
    const s = scroll;
    camera.position.set(parallax.x * 0.9 * (1 - s), parallax.y * 0.55 * (1 - s), CAM_Z - s * 10.5);
    camera.lookAt(0, 0, -s * 4);

    gpu.compute();
    PU.texPos.value = gpu.getCurrentRenderTarget(posVar).texture;
    PU.texVel.value = gpu.getCurrentRenderTarget(velVar).texture;
    if (quality === 0) renderer.render(scene, camera);
    else composer.render();
  }
  requestAnimationFrame(frame);
  window.setTimeout(later, reduced || still ? 50 : 3900);
  if (!reduced) {
    // Every seven seconds, left to right, starting once the intro has settled.
    gsap.fromTo(PU.uGlint, { value: () => -view.w * 0.6 - 2 }, { value: () => view.w * 0.6 + 2, duration: 1.8, ease: 'power1.inOut', repeat: -1, repeatDelay: 5.2, delay: still ? 1 : 4.6 });
  }

  return {
    intro,
    setShape,
    get shape() { return next; },
    has: (id: ShapeId) => shapes.has(id),
    setScroll(v: number) {
      scroll = v;
      U.uScatter.value = smoothstep(0.03, 0.75, v);
      const fade = 1 - smoothstep(0.72, 1, v);
      PU.uFade.value = fade;
      lens.uniforms.uFade.value = fade;
    },
  };
}

const idle = () => new Promise<void>((r) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 60)));
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
