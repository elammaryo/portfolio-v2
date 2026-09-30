import { REPO_META, type CommitData } from '../repos';

// Each shape is a target for every particle: a position (xyz + a per-particle random in w)
// and a colour. Positions are normalised so the shape's bounding box has width `w` and
// height `h` in "shape units"; the scene fits them into the hero's stage (the empty grid
// cell beside the headline), so `fit` and `lift` are fractions of the stage, not the view.
// Every sixteenth particle is dust: its target lives in view-relative units and is shared by
// all shapes, so the atmosphere stays put while the sculpture changes.

export type ShapeId = 'iced' | 'mug' | 'apps' | 'systems' | 'commits' | 'me' | 'hello';
export type Shape = {
  id: ShapeId;
  pos: Float32Array;
  col: Uint8Array;
  w: number;
  h: number;
  /** tiltX, base rotY, spin (rad/s), sway amplitude */
  xform: [number, number, number, number];
  /** fraction of the stage the shape may fill: [width, height] */
  fit: [number, number];
  /** vertical offset as a fraction of the shape's own height (positive is up) */
  lift: number;
  /** fraction of the w×h box that is lit; used to keep brightness constant across shapes */
  area: number;
};

const DUST_EVERY = 16;
export const isDust = (i: number) => i % DUST_EVERY === 0;

// Particle kinds, stored in the integer part of a target's w (the fraction is the particle's
// random): below 2 an ordinary point, 2 a glyph of steam, 3 a wisp of vapour, 4 the coffee's
// surface, 5 and up dust. Kinds 2–4 are not fixed points: STEAM_GLSL (scene.ts) moves them.

// The mug, in its own units (outer radius 0.5) before it is scaled to the shape's unit width.
const MUG = { R: 0.5, H: 1.12, T: 0.055, liq: 0.99, steamH: 1.1, ry: 0.35 };
const MUG_W = 1.235;   // left wall to the far side of the handle
const MUG_CY = 1.095;  // halfway up the mug and its steam
const MUG_RIGHT = [Math.cos(MUG.ry), Math.sin(MUG.ry)]; // screen-right, in the mug's xz at rest
const MUG_FACE = [-Math.sin(MUG.ry), Math.cos(MUG.ry)]; // toward the camera, likewise
/** Steam geometry in the mug's normalised local units, shared with the shaders. */
export const STEAM = {
  y0: (MUG.liq - MUG_CY) / MUG_W,
  h: MUG.steamH / MUG_W,
  glyph: 0.145 / MUG_W,    // local size of one em of steam type
  speed: 1 / 7.5,
  right: MUG_RIGHT,
  // Three columns rise from the cup, spread across it as seen from the front.
  lanes: [[-0.2, 0.05], [0.03, -0.04], [0.23, 0.03]].map(([u, v]) => [
    (MUG_RIGHT[0] * u + MUG_FACE[0] * v) / MUG_W, (MUG_RIGHT[1] * u + MUG_FACE[1] * v) / MUG_W,
  ]),
};
const STEAM_TOKENS = ['{', '}', '</>', ';', '()', '=>', '0', '1', '[]'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ShapeFactory {
  readonly count: number;
  readonly rnd: Float32Array;
  private dustPos: Float32Array;
  private dustCol: Uint8Array;

  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.count = size * size;
    const r = mulberry32(2062);
    this.rnd = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.rnd[i] = r() * 0.999;
    // Shared dust: a loose, deep cloud around the sculpture.
    this.dustPos = new Float32Array(this.count * 4);
    this.dustCol = new Uint8Array(this.count * 4);
    const g = gaussian(r);
    const palette = [[106, 95, 208], [157, 140, 255], [120, 150, 255], [255, 179, 107], [200, 190, 255]];
    for (let i = 0; i < this.count; i += DUST_EVERY) {
      const o = i * 4;
      this.dustPos[o] = clamp(g() * 0.34, -0.72, 0.72);
      this.dustPos[o + 1] = clamp(g() * 0.3, -0.62, 0.62);
      this.dustPos[o + 2] = -0.9 + r() * 1.15;
      this.dustPos[o + 3] = 10 + this.rnd[i];
      const c = palette[r() < 0.12 ? 3 : Math.floor(r() * palette.length) % palette.length];
      this.dustCol.set([c[0], c[1], c[2], 255], o);
    }
  }

  private blank() {
    const pos = new Float32Array(this.count * 4);
    const col = new Uint8Array(this.count * 4);
    pos.set(this.dustPos);
    col.set(this.dustCol);
    return { pos, col };
  }

  /** Sample the filled pixels of a canvas uniformly; colour comes from the pixel. */
  private fromCanvas(
    canvas: HTMLCanvasElement,
    opts: { depth?: (x: number, y: number, rgba: number[]) => number; accept?: (x: number, y: number) => number; edge?: number; interior?: number } = {},
  ) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const { width: W, height: H } = canvas;
    const img = ctx.getImageData(0, 0, W, H).data;
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && img[(y * W + x) * 4 + 3] > 110;
    const filled: number[] = [];
    const edgeSet = new Uint8Array(W * H);
    // Pixels near an edge are sampled several times, so outlines come out crisp and bright.
    const E = opts.edge ?? 0;
    const R = Math.max(2, Math.round(W * 0.0028));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!on(x, y)) continue;
        const p = y * W + x;
        filled.push(p);
        if (E > 0 && (!on(x + R, y) || !on(x - R, y) || !on(x, y + R) || !on(x, y - R) || !on(x + R, y + R) || !on(x - R, y - R) || !on(x + R, y - R) || !on(x - R, y + R))) {
          edgeSet[p] = 1;
          for (let k = 0; k < E; k++) filled.push(p);
        }
      }
    }
    const cand = Int32Array.from(filled);
    let unique = 0;
    for (let p = 0, n = W * H; p < n; p++) if (img[p * 4 + 3] > 110) unique++;
    const { pos, col } = this.blank();
    const r = mulberry32(W * 31 + H);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of cand) {
      const x = p % W, y = (p / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const bw = maxX - minX, bh = maxY - minY;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    for (let i = 0; i < this.count; i++) {
      if (isDust(i)) continue;
      let p = 0, x = 0, y = 0;
      for (let tries = 0; tries < 8; tries++) {
        p = cand[(r() * cand.length) | 0];
        x = p % W; y = (p / W) | 0;
        if (!opts.accept || r() < opts.accept(x / W, y / H)) break;
      }
      const o = i * 4, q = p * 4;
      const rgba = [img[q], img[q + 1], img[q + 2], img[q + 3]];
      pos[o] = (x + r() - 0.5 - cx) / bw;
      pos[o + 1] = -(y + r() - 0.5 - cy) / bw;
      pos[o + 2] = opts.depth ? opts.depth(x / W, y / H, rgba) : (r() - 0.5) * 0.02;
      pos[o + 3] = this.rnd[i];
      const dim = E > 0 && !edgeSet[p] ? (opts.interior ?? 1) : 1;
      col.set([rgba[0] * dim, rgba[1] * dim, rgba[2] * dim, 255], o);
    }
    let acc = 1;
    if (opts.accept) {
      let sum = 0;
      for (let k = 0; k < 4000; k++) { const p = cand[(r() * cand.length) | 0]; sum += opts.accept((p % W) / W, ((p / W) | 0) / H); }
      acc = sum / 4000;
    }
    return { pos, col, w: 1, h: bh / bw, area: (unique / Math.max(1, bw * bh)) * acc };
  }

  /** A justified two-line lockup: the short line is set much larger so both lines share a width. */
  text(id: ShapeId, lines: string[], stops: string[], fit: [number, number] = [0.96, 0.5]): Shape {
    const Wc = 2200, margin = 40;
    const probe = document.createElement('canvas').getContext('2d')!;
    const metrics = lines.map((line) => {
      probe.font = `400 1000px "Anton", "Impact", sans-serif`;
      const m = probe.measureText(line);
      const tight = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const f = (1000 * Wc) / tight;
      return { line, f, left: (m.actualBoundingBoxLeft * f) / 1000, asc: (m.actualBoundingBoxAscent * f) / 1000 };
    });
    const gap = Wc * 0.045;
    const H = Math.ceil(metrics.reduce((a, m) => a + m.asc, 0) + gap * (lines.length - 1) + margin * 2);
    const canvas = document.createElement('canvas');
    canvas.width = Wc + margin * 2;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, H);
    stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = grad;
    let y = margin;
    for (const m of metrics) {
      y += m.asc;
      ctx.font = `400 ${m.f}px "Anton", "Impact", sans-serif`;
      ctx.fillText(m.line, margin + m.left, y);
      y += gap;
    }
    const r = mulberry32(7);
    const s = this.fromCanvas(canvas, { depth: () => (r() - 0.5) * 0.035, edge: 7, interior: 0.62 });
    return { id, ...s, xform: [0, 0, 0, 0], fit, lift: 0 };
  }

  /**
   * A mug of coffee in the round, with its steam rising as code. The mug is sampled on real
   * surfaces (wall, rim, handle, the coffee), lit from the upper left, so it has volume and
   * depth when it sways. Nothing occludes in an additive particle cloud, so the far half of
   * the wall is sampled thinner, which is what makes it read as solid rather than glass.
   * The steam is not a fixed picture: each steam particle stores where it sits inside its
   * glyph or wisp, and STEAM_GLSL carries it up the plume.
   */
  mug(): Shape {
    const { R, H, T, liq } = MUG;
    const r = mulberry32(31);
    const g = gaussian(r);
    const { pos, col } = this.blank();
    const N = 1 / MUG_W;
    const [rx, rz] = MUG_RIGHT, [fx, fz] = MUG_FACE;
    const L = norm3([-0.55 * rx + 0.8 * fx, 0.5, -0.55 * rz + 0.8 * fz]);
    const shade = (nx: number, ny: number, nz: number) => 0.4 + 0.6 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    // A warm edge light from behind on the right: the desk lamp at 3 AM.
    const lamp = (nx: number, nz: number) => Math.max(0, nx * rx + nz * rz - Math.max(0, nx * fx + nz * fz) * 0.9) ** 3;
    const set = (i: number, x: number, y: number, z: number, kind: number, c: number[]) => {
      const o = i * 4;
      pos[o] = x * N; pos[o + 1] = (y - MUG_CY) * N; pos[o + 2] = z * N; pos[o + 3] = kind + this.rnd[i];
      col.set([c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, v))).concat(255), o);
    };
    const ceramic = (k: number, warm: number) => [236 * k + 255 * warm * 0.55, 230 * k + 168 * warm * 0.55, 250 * k + 110 * warm * 0.55];

    // The </> printed on the front, sampled from type and wrapped around the wall.
    const logo = inkOf('</>', '800 220px Manrope, sans-serif');
    const theta0 = Math.atan2(fz, fx);
    const LOGO_H = 0.25, LOGO_ARC = (LOGO_H * logo.aspect) / R, LOGO_Y = 0.52;
    // Steam: three columns of glyph slots, each slot a token that rises, sways and comes apart.
    const tokens = STEAM_TOKENS.map((t) => inkOf(t, '400 160px "JetBrains Mono", monospace'));
    const PER_LANE = 4;
    const slots = Array.from({ length: 3 * PER_LANE }, (_, s) => {
      const lane = s % 3, k = Math.floor(s / 3);
      return { lane, phase: (k + 0.35 * r() + lane * 0.33) / PER_LANE % 1, ink: tokens[(s * 7 + lane) % tokens.length] };
    });
    // Handle: a tube bent round an arc whose ends meet the wall.
    const HA = 1.2, HR = 0.29, HT = 0.062, HY = 0.58, HX = R - 0.012 - Math.cos(HA) * HR;

    for (let i = 0; i < this.count; i++) {
      if (isDust(i)) continue;
      const u = r();
      if (u < 0.3) {
        // Wall. The far half is thinned: a point there is mirrored to the front 55% of the time.
        let th = r() * Math.PI * 2;
        if (Math.cos(th) * fx + Math.sin(th) * fz < -0.15 && r() < 0.55) th = 2 * Math.atan2(rz, rx) - th;
        const nx = Math.cos(th), nz = Math.sin(th);
        const y = 0.03 + r() * (H - 0.06);
        const front = nx * fx + nz * fz;
        const k = shade(nx, 0, nz) * (front < 0 ? 0.62 : 1) * (0.82 + 0.18 * (y / H));
        set(i, nx * R, y, nz * R, 0, ceramic(k, lamp(nx, nz)));
      } else if (u < 0.37) {
        // The logo: slightly proud of the wall, in the lamp's colour.
        const [px, py] = logo.pick(r);
        const th = theta0 + (0.5 - px) * LOGO_ARC;
        const nx = Math.cos(th), nz = Math.sin(th);
        const k = 0.72 + 0.28 * shade(nx, 0, nz);
        set(i, nx * (R + 0.004), LOGO_Y + (0.5 - py) * LOGO_H, nz * (R + 0.004), 0, [255 * k, 176 * k, 104 * k]);
      } else if (u < 0.46) {
        // Rim: a rounded lip, the brightest line on the mug.
        const th = r() * Math.PI * 2, ps = r() * Math.PI * 2, m = T / 2;
        const rr = R - m + m * Math.cos(ps);
        const k = 0.78 + 0.22 * shade(Math.cos(th), 0.6, Math.sin(th));
        set(i, Math.cos(th) * rr, H - m + m * Math.sin(ps), Math.sin(th) * rr, 0, [255 * k, 250 * k, 244 * k]);
      } else if (u < 0.49) {
        // Foot: the rounded bottom edge.
        const th = r() * Math.PI * 2, ps = r() * Math.PI * 2, m = 0.035;
        const rr = R - m + m * Math.cos(ps);
        const k = shade(Math.cos(th), -0.3, Math.sin(th)) * 0.8;
        set(i, Math.cos(th) * rr, m + m * Math.sin(ps), Math.sin(th) * rr, 0, ceramic(k, lamp(Math.cos(th), Math.sin(th))));
      } else if (u < 0.53) {
        // Inside wall, between the rim and the coffee. Only the far half can be seen.
        let th = r() * Math.PI * 2;
        if (Math.cos(th) * fx + Math.sin(th) * fz > 0) th = 2 * Math.atan2(rz, rx) - th;
        const k = shade(-Math.cos(th), 0.2, -Math.sin(th)) * 0.55;
        set(i, Math.cos(th) * (R - T), liq + r() * (H - T - liq), Math.sin(th) * (R - T), 0, [200 * k, 186 * k, 240 * k]);
      } else if (u < 0.64) {
        // Coffee: caramel, lighter crema at the edge, a heart poured on top. Kind 4 ripples.
        const heart = r() < 0.24;
        let a = 0, b = 0;
        if (heart) {
          // (x² + y² − 1)³ − x²y³ ≤ 0, the lobes toward the back so it reads upright.
          do { a = (r() - 0.5) * 2.4; b = r() * 2.4 - 1.1; } while ((a * a + b * b - 1) ** 3 - a * a * b * b * b > 0);
          a *= 0.14; b *= 0.14;
        }
        const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * (R - T - 0.006);
        const x = heart ? rx * a - fx * b : Math.cos(ang) * rad;
        const z = heart ? rz * a - fz * b : Math.sin(ang) * rad;
        const edge = smooth(0.72, 0.98, Math.hypot(x, z) / (R - T));
        const c = heart ? [255, 232, 204] : [150 + 80 * edge, 78 + 72 * edge, 36 + 50 * edge];
        set(i, x, liq + (heart ? 0.003 : 0), z, 4, c);
      } else if (u < 0.74) {
        // Handle.
        const ph = (r() * 2 - 1) * HA, ps = r() * Math.PI * 2;
        const nx = Math.cos(ps) * Math.cos(ph), ny = Math.cos(ps) * Math.sin(ph), nz = Math.sin(ps);
        const k = shade(nx, ny, nz) * 1.05;
        set(i, HX + HR * Math.cos(ph) + HT * nx, HY + HR * Math.sin(ph) + HT * ny, HT * nz, 0, ceramic(k, lamp(nx, nz)));
      } else if (u < 0.87) {
        // A glyph of steam: offset inside its token, then lane + phase packed into z.
        const s = slots[(r() * slots.length) | 0];
        const [px, py] = s.ink.pick(r);
        const o = i * 4;
        pos[o] = (px - 0.5) * s.ink.wEm; pos[o + 1] = (0.5 - py) * s.ink.hEm; pos[o + 2] = s.lane + s.phase * 0.999; pos[o + 3] = 2 + this.rnd[i];
        col.set([238, 232, 255, 255], o);
      } else {
        // Vapour around the columns, at a random point in the rise.
        const o = i * 4;
        pos[o] = clamp(g(), -2.5, 2.5); pos[o + 1] = clamp(g(), -2.5, 2.5); pos[o + 2] = (i % 3) + r() * 0.999; pos[o + 3] = 3 + this.rnd[i];
        col.set([176, 164, 246, 255], o);
      }
    }
    const h = (MUG_CY * 2) / MUG_W;
    return { id: 'mug', pos, col, w: 1, h, area: 0.34, xform: [0.42, MUG.ry, 0, 0.22], fit: [0.88, 0.93], lift: 0.1 };
  }

  /**
   * Iced coffee, his usual: a tall clear cup, cream settling under the coffee, a straw, and
   * ice with code frozen in it. The cup is clear, so it is drawn thin (the limb of the wall is
   * what outlines it) and the drink inside does the colour. The ice rides the coffee's
   * surface (kind 4), so it bobs with the bass. No steam: it's cold. The code is in the ice.
   */
  iced(): Shape {
    const H = 1.5, RT = 0.5, RB = 0.37, L = 1.16; // height, top and bottom radius, drink level
    const W_ = 1.0, CY = 0.87;                      // box width, vertical centre (straw included)
    const ry = 0.3, tilt = 0.32;
    const r = mulberry32(47);
    const { pos, col } = this.blank();
    const N = 1 / W_;
    const rad = (y: number) => RB + (RT - RB) * (y / H);
    const [rx, rz] = [Math.cos(ry), Math.sin(ry)], [fx, fz] = [-Math.sin(ry), Math.cos(ry)];
    const theta0 = Math.atan2(fz, fx);
    const L3 = norm3([-0.5 * rx + 0.8 * fx, 0.55, -0.5 * rz + 0.8 * fz]);
    const shade = (nx: number, ny: number, nz: number) => 0.45 + 0.55 * Math.max(0, nx * L3[0] + ny * L3[1] + nz * L3[2]);
    const set = (i: number, x: number, y: number, z: number, kind: number, c: number[]) => {
      const o = i * 4;
      pos[o] = x * N; pos[o + 1] = (y - CY) * N; pos[o + 2] = z * N; pos[o + 3] = kind + this.rnd[i];
      col.set([c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, v))).concat(255), o);
    };
    const front = (th: number) => Math.cos(th) * fx + Math.sin(th) * fz;
    const cream = [250, 236, 214], coffee = [206, 122, 60], dark = [160, 86, 38];
    const mix = (a: number[], b: number[], t: number) => a.map((v, k) => v + (b[k] - v) * t);

    // Ice: five cubes riding the surface, one sunk lower, each with a glyph frozen in the face
    // that looks at the camera.
    const glyphs = ['{', '</>', ';', '}', '1'].map((t) => inkOf(t, '400 160px "JetBrains Mono", monospace'));
    const view = norm3([fx * Math.cos(tilt), Math.sin(tilt), fz * Math.cos(tilt)]);
    const cubes = [
      { c: [-0.2, L + 0.02, 0.12], a: 0.23, e: [0.2, 0.5, 0.15] },
      { c: [0.16, L + 0.04, 0.16], a: 0.21, e: [-0.25, -0.3, 0.1] },
      { c: [0.05, L + 0.05, -0.2], a: 0.22, e: [0.15, 0.9, -0.2] },
      { c: [-0.24, L + 0.03, -0.14], a: 0.19, e: [-0.1, 0.2, 0.3] },
      { c: [0.12, L - 0.26, 0.02], a: 0.2, e: [0.35, 0.4, 0.25] },
    ].map((q, k) => {
      // Half the tumble a real cube would have: square enough to the camera to read the glyph.
      const [a, b, g] = q.e.map((v) => v * 0.5);
      const m = rotXYZ(a, b, g);
      // The face whose normal points most toward the camera carries the glyph.
      const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => mulM(m, v));
      let best = 0, sign = 1, dot = -2;
      axes.forEach((v, i) => { for (const sg of [1, -1]) { const d = sg * (v[0] * view[0] + v[1] * view[1] + v[2] * view[2]); if (d > dot) { dot = d; best = i; sign = sg; } } });
      const nrm = axes[best].map((v) => v * sign);
      // In-face directions: the other two axes, ordered so "up" is the more vertical one.
      const others = axes.filter((_, i) => i !== best);
      const up0 = Math.abs(others[0][1]) > Math.abs(others[1][1]) ? others[0] : others[1];
      const up = up0[1] < 0 ? up0.map((v) => -v) : up0;
      let right = cross(up, nrm);
      if (right[0] * rx + right[2] * rz < 0) right = right.map((v) => -v);
      return { ...q, m, nrm, up, right, ink: glyphs[k % glyphs.length], sunk: q.c[1] < L - 0.1 };
    });
    // Straw: from low in the drink up and out, leaning right and slightly forward.
    const S0 = [0.04, 0.1, -0.06], S1 = [0.21, 1.74, 0.06], SR = 0.036;
    const sd = norm3([S1[0] - S0[0], S1[1] - S0[1], S1[2] - S0[2]]);
    const su = norm3(cross(sd, [0, 0, 1])), sv = cross(sd, su);
    const sLen = Math.hypot(S1[0] - S0[0], S1[1] - S0[1], S1[2] - S0[2]);
    // The </> badge on the front, like a coffee chain's logo.
    const logo = inkOf('</>', '800 220px Manrope, sans-serif');
    const BY = 0.68, BR = 0.15;

    for (let i = 0; i < this.count; i++) {
      if (isDust(i)) continue;
      const u = r();
      if (u < 0.11) {
        // The clear cup: sparse, pale; the far side fainter.
        const th = r() * Math.PI * 2, y = r() * H, rr = rad(y);
        const k = (front(th) < 0 ? 0.5 : 0.85) * shade(Math.cos(th), 0, Math.sin(th));
        set(i, Math.cos(th) * rr, y, Math.sin(th) * rr, 0, [205 * k, 222 * k, 255 * k]);
      } else if (u < 0.16) {
        // Rim, bright.
        const th = r() * Math.PI * 2, ps = r() * Math.PI * 2, m = 0.012;
        const rr = RT + m * Math.cos(ps);
        set(i, Math.cos(th) * rr, H + m * Math.sin(ps), Math.sin(th) * rr, 0, [248, 252, 255]);
      } else if (u < 0.19) {
        // Base ring.
        const th = r() * Math.PI * 2;
        const k = front(th) < 0 ? 0.55 : 0.9;
        set(i, Math.cos(th) * RB, 0.004 + r() * 0.01, Math.sin(th) * RB, 0, [220 * k, 232 * k, 255 * k]);
      } else if (u < 0.42) {
        // The drink, seen through the cup: cream settled at the bottom, coffee on top, marbled
        // where they meet.
        const th = r() * Math.PI * 2, y = 0.02 + r() * (L - 0.02), rr = rad(y) - 0.014;
        const t = smooth(0.3, 0.58, y / L + 0.09 * Math.sin(th * 3 + y * 9) + 0.05 * Math.sin(th * 7 - y * 17));
        const k = (front(th) < 0 ? 0.62 : 1) * (0.78 + 0.22 * shade(Math.cos(th), 0, Math.sin(th)));
        const c = mix(cream, y > L - 0.2 ? mix(coffee, dark, (y - (L - 0.2)) / 0.2 * 0.6) : coffee, t);
        set(i, Math.cos(th) * rr, y, Math.sin(th) * rr, 0, c.map((v) => v * k));
      } else if (u < 0.48) {
        // Surface of the drink (kind 4: it ripples, harder on the bass).
        const th = r() * Math.PI * 2, rr = Math.sqrt(r()) * (rad(L) - 0.016);
        const edge = smooth(0.7, 1, rr / rad(L));
        set(i, Math.cos(th) * rr, L, Math.sin(th) * rr, 4, mix(dark, [200, 140, 90], edge * 0.6 + r() * 0.15));
      } else if (u < 0.55) {
        // Cream still curling down through the coffee.
        const lane = (r() * 3) | 0, sft = r();
        const y = 0.36 + sft * (L - 0.46), th = lane * 2.1 + sft * 5.2 + (r() - 0.5) * 0.25;
        const rr = (rad(y) - 0.03) * (0.35 + 0.45 * Math.abs(Math.sin(sft * 4 + lane)));
        set(i, Math.cos(th) * rr, y + (r() - 0.5) * 0.03, Math.sin(th) * rr, 0, cream.map((v) => v * (0.8 + 0.2 * r())));
      } else if (u < 0.82) {
        // Ice: bright edges, faint faces, and the glyph.
        const q = cubes[(r() * cubes.length) | 0], h = q.a / 2;
        const v = r();
        let lx = 0, ly = 0, lz = 0, c = [176, 206, 232];
        if (v < 0.42) {
          // An edge: two coordinates at ±h, one free.
          const axis = (r() * 3) | 0, s1 = r() < 0.5 ? -h : h, s2 = r() < 0.5 ? -h : h, t = (r() * 2 - 1) * h;
          [lx, ly, lz] = axis === 0 ? [t, s1, s2] : axis === 1 ? [s1, t, s2] : [s1, s2, t];
          const [dx, dy, dz] = [(r() - 0.5) * 0.008, (r() - 0.5) * 0.008, (r() - 0.5) * 0.008];
          lx += dx; ly += dy; lz += dz;
        } else if (v < 0.52) {
          // A face, sparsely.
          const axis = (r() * 3) | 0, sg = r() < 0.5 ? -h : h, a = (r() * 2 - 1) * h, b = (r() * 2 - 1) * h;
          [lx, ly, lz] = axis === 0 ? [sg, a, b] : axis === 1 ? [a, sg, b] : [a, b, sg];
          c = [120, 170, 210];
        } else {
          // The glyph, just inside the camera-facing face.
          const [gx, gy] = q.ink.pick(r);
          const gs = q.a * 0.74, px = (gx - 0.5) * q.ink.wEm / Math.max(q.ink.wEm, q.ink.hEm) * gs, py = (0.5 - gy) * q.ink.hEm / Math.max(q.ink.wEm, q.ink.hEm) * gs;
          const p = [q.c[0] + q.nrm[0] * (h - 0.012) + q.right[0] * px + q.up[0] * py, q.c[1] + q.nrm[1] * (h - 0.012) + q.right[1] * px + q.up[1] * py, q.c[2] + q.nrm[2] * (h - 0.012) + q.right[2] * px + q.up[2] * py];
          set(i, p[0], p[1], p[2], 4, q.sunk ? [200, 180, 160] : [232, 244, 255]);
          continue;
        }
        const w = mulM(q.m, [lx, ly, lz]);
        const under = q.sunk ? 0.62 : 1;
        set(i, q.c[0] + w[0], q.c[1] + w[1], q.c[2] + w[2], 4, c.map((x) => x * under));
      } else if (u < 0.9) {
        // Straw: lamp-coloured, darker where it's under the coffee.
        const t = r(), ph = r() * Math.PI * 2;
        const p = [S0[0] + sd[0] * sLen * t, S0[1] + sd[1] * sLen * t, S0[2] + sd[2] * sLen * t];
        const n = [su[0] * Math.cos(ph) + sv[0] * Math.sin(ph), su[1] * Math.cos(ph) + sv[1] * Math.sin(ph), su[2] * Math.cos(ph) + sv[2] * Math.sin(ph)];
        const y = p[1] + n[1] * SR;
        const k = (y < L ? 0.55 : 1.15) * (0.55 + 0.45 * shade(n[0], n[1], n[2]));
        set(i, p[0] + n[0] * SR, y, p[2] + n[2] * SR, 0, [255 * k, 172 * k, 98 * k]);
      } else if (u < 0.97) {
        // The badge: a ring with </> inside, wrapped on the front of the cup.
        const ring = r() < 0.45;
        let du = 0, dv = 0;
        if (ring) { const a = r() * Math.PI * 2, rr = BR * (1 + (r() - 0.5) * 0.06); du = Math.cos(a) * rr; dv = Math.sin(a) * rr; }
        else { const [gx, gy] = logo.pick(r); du = (gx - 0.5) * BR * 1.3; dv = (0.5 - gy) * BR * 1.3 / logo.aspect; }
        const y = BY + dv, rr = rad(y) + 0.004;
        const th = theta0 - du / rr;
        const k = 0.75 + 0.25 * shade(Math.cos(th), 0, Math.sin(th));
        set(i, Math.cos(th) * rr, y, Math.sin(th) * rr, 0, [255 * k, 176 * k, 104 * k]);
      } else {
        // Condensation: beads on the front of the cold cup.
        let th = theta0 + (r() - 0.5) * 2.6;
        if (r() < 0.3) th += Math.PI * (r() < 0.5 ? 0.6 : -0.6);
        const y = 0.12 + r() * (L - 0.05), rr = rad(y) + 0.006;
        const drip = r() < 0.2 ? r() * 0.04 : 0;
        set(i, Math.cos(th) * rr, y - drip, Math.sin(th) * rr, 0, [230, 244, 255]);
      }
    }
    return { id: 'iced', pos, col, w: 1, h: (CY * 2) / W_, area: 0.34, xform: [tilt, ry, 0, 0.16], fit: [0.9, 0.81], lift: 0.015 };
  }

  /** A floating phone showing a SuperOver-style game list. */
  phone(): Shape {
    const W = 1100, H = 2200;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    const rr = (px: number, py: number, w: number, h: number, r: number) => { x.beginPath(); x.roundRect(px, py, w, h, r); };
    // body + bezel
    x.lineWidth = 30; x.strokeStyle = '#d9d4ff'; rr(50, 50, 1000, 2100, 170); x.stroke();
    x.lineWidth = 6; x.strokeStyle = '#6f66b8'; rr(92, 92, 916, 2016, 132); x.stroke();
    x.fillStyle = '#b9b2ff';
    x.fillRect(24, 420, 26, 110); x.fillRect(24, 570, 26, 110); x.fillRect(1050, 500, 26, 190);
    x.fillStyle = '#d9d4ff'; rr(420, 130, 260, 76, 38); x.fill();
    // status + title
    x.fillStyle = '#efeaff';
    x.font = '700 52px Manrope, sans-serif'; x.fillText('9:41', 175, 190);
    x.fillRect(850, 158, 70, 32);
    x.font = '800 92px Manrope, sans-serif'; x.fillText('Games', 150, 345);
    x.fillStyle = '#ffcf9a'; rr(150, 390, 800, 100, 28); x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.font = '700 40px Manrope, sans-serif'; x.fillText('Refer a friend, get a discount', 185, 455);
    x.globalCompositeOperation = 'source-over';
    // three game cards
    const venues = ['True North Sports', 'Kings Court', 'Cricket Hub'];
    for (let k = 0; k < 3; k++) {
      const y0 = 560 + k * 470;
      x.lineWidth = 10; x.strokeStyle = k === 0 ? '#1fd17a' : '#8d86c9'; rr(150, y0, 800, 420, 44); x.stroke();
      x.fillStyle = k === 0 ? '#2c9a62' : '#3f3a78'; rr(178, y0 + 28, 290, 364, 30); x.fill();
      x.lineWidth = 16; x.strokeStyle = '#1fd17a';
      x.beginPath(); x.arc(250, y0 + 320, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.86 - k * 0.2)); x.stroke();
      x.fillStyle = '#efeaff'; x.font = '800 44px Manrope, sans-serif'; x.fillText(venues[k], 500, y0 + 85);
      x.fillStyle = '#a9a3d9';
      x.fillRect(500, y0 + 125, 200, 20); x.fillRect(500, y0 + 170, 250, 20); x.fillRect(500, y0 + 215, 150, 20);
      if (k === 0) {
        x.lineWidth = 6; x.strokeStyle = '#efeaff'; rr(500, y0 + 290, 420, 100, 28); x.stroke();
        x.fillStyle = '#efeaff'; x.font = '800 44px Manrope, sans-serif'; x.fillText('Confirmed', 600, y0 + 356);
      } else {
        x.fillStyle = '#1fd17a'; rr(500, y0 + 290, 420, 100, 28); x.fill();
        x.globalCompositeOperation = 'destination-out';
        x.font = '800 48px Manrope, sans-serif'; x.fillText('Join', 665, y0 + 358);
        x.globalCompositeOperation = 'source-over';
      }
    }
    // tab bar + home indicator
    x.fillStyle = '#6f66b8'; x.fillRect(100, 1985, 900, 4);
    x.lineWidth = 8;
    for (let t = 0; t < 5; t++) {
      x.strokeStyle = t === 0 ? '#1fd17a' : '#b9b2ff';
      x.beginPath(); x.arc(200 + t * 175, 2040, 26, 0, Math.PI * 2); x.stroke();
    }
    x.fillStyle = '#efeaff'; rr(420, 2095, 260, 14, 7); x.fill();
    const r = mulberry32(11);
    const s = this.fromCanvas(c, {
      edge: 2,
      depth: (u, v) => {
        const edge = Math.min(u, 1 - u, v * 0.5, (1 - v) * 0.5) < 0.05;
        return edge ? (r() - 0.5) * 0.05 : 0.012 + (r() - 0.5) * 0.004;
      },
    });
    return { id: 'apps', ...s, xform: [0.16, -0.42, 0, 0.14], fit: [0.62, 0.84], lift: 0 };
  }

  /** A circuit board of the parts I build: apps and web up front, an API in the middle,
   *  data, payments, AI, push and jobs around it. */
  systems(): Shape {
    const W = 2200, H = 1200;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    const trace = '#7a6fe0';
    x.lineCap = 'round'; x.lineJoin = 'round';
    const wire = (pts: [number, number][]) => {
      x.strokeStyle = trace; x.lineWidth = 10;
      x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) x.lineTo(px, py);
      x.stroke();
      x.fillStyle = trace;
      for (const [px, py] of pts.slice(1, -1)) { x.beginPath(); x.arc(px, py, 15, 0, Math.PI * 2); x.fill(); }
    };
    const packet = (px: number, py: number, col: string) => { x.fillStyle = col; x.beginPath(); x.arc(px, py, 17, 0, Math.PI * 2); x.fill(); };
    // traces first, chips on top
    wire([[560, 600], [850, 600]]);
    wire([[1350, 600], [1640, 600]]);
    wire([[1100, 400], [1100, 260]]);
    wire([[1100, 800], [1100, 940]]);
    wire([[1890, 430], [1890, 260]]);
    wire([[310, 260], [310, 430]]);
    wire([[560, 1050], [700, 1050], [700, 700], [850, 700]]);
    wire([[1640, 150], [1500, 150], [1500, 480], [1350, 480]]);
    wire([[560, 150], [720, 150], [720, 500], [850, 500]]);
    packet(705, 600, '#fff4ea'); packet(1495, 600, '#bfefff'); packet(1100, 330, '#b8ffd9'); packet(1500, 300, '#e4dcff');
    const chip = (x0: number, y0: number, w: number, h: number, col: string, label: string, size: number) => {
      x.lineWidth = 18; x.strokeStyle = col;
      x.beginPath(); x.roundRect(x0, y0, w, h, 46); x.stroke();
      // pins
      x.fillStyle = col;
      for (let k = 0; k < 4; k++) {
        const px = x0 + w * (0.2 + k * 0.2) - 9;
        x.fillRect(px, y0 - 34, 18, 22); x.fillRect(px, y0 + h + 12, 18, 22);
      }
      x.fillStyle = '#f4f1ff';
      x.font = `400 ${size}px "Anton", "Impact", sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(label, x0 + w / 2, y0 + h / 2 + size * 0.04);
    };
    chip(60, 430, 500, 340, '#9d8cff', 'APP', 180);
    chip(850, 400, 500, 400, '#ffb36b', 'API', 210);
    chip(1640, 430, 500, 340, '#6fd6ff', 'DATA', 150);
    chip(850, 40, 500, 220, '#1fd17a', 'PAY', 134);
    chip(1640, 40, 500, 220, '#b9a6ff', 'AI', 134);
    chip(60, 40, 500, 220, '#c4b8ff', 'WEB', 134);
    chip(850, 940, 500, 220, '#ff8fb1', 'PUSH', 134);
    chip(60, 940, 500, 220, '#f2c879', 'JOBS', 134);
    const r = mulberry32(21);
    const sh = this.fromCanvas(c, { edge: 2, interior: 0.85, depth: () => (r() - 0.5) * 0.02 });
    return { id: 'systems', ...sh, xform: [0.14, -0.2, 0, 0.1], fit: [0.98, 0.84], lift: 0 };
  }

  /** The commit spiral: every real commit becomes a small glowing cluster, coloured by repo. */
  commits(data: CommitData): Shape {
    const { pos, col } = this.blank();
    const r = mulberry32(99);
    const g = gaussian(r);
    const cs = data.commits;
    const t0 = cs[0][1], t1 = cs[cs.length - 1][1];
    const TURNS = 3.2;
    const colors = data.repos.map((repo) => hexToRgb(REPO_META[repo.id]?.color ?? '#ffffff'));
    const at = (t: number) => { const a = t * TURNS * Math.PI * 2; const rad = 0.1 + t * 0.9; return [Math.cos(a) * rad, Math.sin(a) * rad]; };
    for (let i = 0; i < this.count; i++) {
      if (isDust(i)) continue;
      const o = i * 4;
      const u = r();
      if (u < 0.1) {
        // the time axis
        const t = r();
        const [px, pz] = at(t);
        pos.set([px + g() * 0.004, g() * 0.004, pz + g() * 0.004, this.rnd[i]], o);
        col.set([95, 84, 170, 255], o);
      } else if (u < 0.13) {
        // the core: where it started
        const rr = Math.cbrt(r()) * 0.045;
        const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1);
        pos.set([rr * Math.sin(ph) * Math.cos(th), rr * Math.cos(ph), rr * Math.sin(ph) * Math.sin(th), this.rnd[i]], o);
        col.set([255, 179, 107, 255], o);
      } else {
        const [repo, ts] = cs[(r() * cs.length) | 0];
        const t = (ts - t0) / (t1 - t0);
        const [px, pz] = at(t);
        const sp = 0.007 + t * 0.004;
        pos.set([px + g() * sp, g() * sp * 0.5, pz + g() * sp, this.rnd[i]], o);
        const cc = colors[repo];
        col.set([cc[0], cc[1], cc[2], 255], o);
      }
    }
    // bbox after the tilt the shader applies
    const tilt = 1.02;
    return { id: 'commits', pos, col, w: 2, h: 2 * Math.sin(tilt) + 0.1, xform: [tilt, 0.6, 0.12, 0], fit: [0.95, 0.9], lift: 0, area: 0.34 };
  }

  /** A pointillist version of the Florence photo. */
  async portrait(src: string): Promise<Shape> {
    const img = await loadImage(src);
    const W = 640, H = Math.round((640 * img.naturalHeight) / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.filter = 'contrast(1.18) saturate(1.25) brightness(1.05)';
    x.drawImage(img, 0, 0, W, H);
    const r = mulberry32(5);
    const s = this.fromCanvas(c, {
      accept: (u, v) => {
        const dx = (u - 0.5) / 0.5, dy = (v - 0.5) / 0.5;
        const d = Math.sqrt(dx * dx * 0.9 + dy * dy * 0.8);
        return 1 - smooth(0.72, 1.02, d);
      },
      depth: (_u, _v, rgba) => ((rgba[0] * 0.3 + rgba[1] * 0.59 + rgba[2] * 0.11) / 255) * 0.07 + (r() - 0.5) * 0.01,
    });
    return { id: 'me', ...s, xform: [0, -0.12, 0, 0.1], fit: [0.8, 0.94], lift: 0 };
  }
}

/**
 * The inked pixels of some text, for sampling. pick() returns a random inked point as
 * fractions of the ink's bounding box; wEm and hEm are that box's size in ems, so glyphs of
 * different shapes keep their true relative size.
 */
function inkOf(text: string, font: string) {
  const px = parseFloat(font.match(/(\d+)px/)![1]);
  const c = document.createElement('canvas');
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.font = font;
  c.width = Math.ceil(x.measureText(text).width + px);
  c.height = Math.ceil(px * 1.6);
  x.font = font;
  x.fillStyle = '#fff';
  x.textBaseline = 'middle';
  x.fillText(text, px / 2, c.height / 2);
  const img = x.getImageData(0, 0, c.width, c.height).data;
  const lit: number[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) {
    if (img[(y * c.width + X) * 4 + 3] < 110) continue;
    lit.push(X, y);
    if (X < minX) minX = X; if (X > maxX) maxX = X; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  return {
    aspect: bw / bh, wEm: bw / px, hEm: bh / px,
    pick(r: () => number): [number, number] {
      const k = ((r() * lit.length) / 2) | 0;
      return [(lit[k * 2] + r() - 0.5 - minX) / bw, (lit[k * 2 + 1] + r() - 0.5 - minY) / bh];
    },
  };
}
const norm3 = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((c) => c / l); };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Rotation about x, then y, then z, as a row-major 3×3. */
function rotXYZ(a: number, b: number, g: number) {
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(g), Math.sin(g)];
  const X = [[1, 0, 0], [0, ca, -sa], [0, sa, ca]], Y = [[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]], Z = [[cg, -sg, 0], [sg, cg, 0], [0, 0, 1]];
  const mm = (p: number[][], q: number[][]) => p.map((row) => [0, 1, 2].map((j) => row[0] * q[0][j] + row[1] * q[1][j] + row[2] * q[2][j]));
  return mm(Z, mm(Y, X));
}
const mulM = (m: number[][], v: number[]) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function gaussian(r: () => number) {
  return () => {
    const u = Math.max(r(), 1e-9), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
