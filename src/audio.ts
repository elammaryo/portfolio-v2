// One audio player for the whole page. The GameOver card plays it, the hero's letters react
// to it, and a small now-playing pill keeps it controllable while you scroll, the way
// GameOver's own player keeps playing between pages.
//
// With no tracks, nothing here runs and the GameOver card stays a picture.

export type Track = { title: string; subtitle?: string; genre: string; bpm: number; start: number; length: number };
export type Levels = { bass: number; mid: number; high: number; kick: number };

// Omer's own beats, each cut to about forty seconds on its bar lines (a short lead-in, the
// drop, a fade that lands on a bar), joined into one file with a breath between them. A
// visitor hears the best part at once, and the full beats never sit on a public page.
//
// One file, not one per beat: with a file each, only the first beat ever played on the
// published page. Moving on meant swapping the element's source and calling play() outside a tap,
// and the browser refused (it sat at 0:00, Next included). A single file never stops, so the
// next beat just arrives and Next is a seek. Start and length come from
// scripts/cut-beats.py, which builds the file; see "Audio" in the README.
// Named by content (the script does it), so a browser holding an older set can't pair it
// with these start times.
const SET = 'audio/set-bcea1a3f.mp3';
export const TRACKS: Track[] = [
  { title: 'Starlight', genre: 'Trap', bpm: 130, start: 0, length: 40.615 },
  { title: 'Senses', genre: 'Drill', bpm: 134, start: 41.215, length: 39.403 },
];

const QUIET: Levels = { bass: 0, mid: 0, high: 0, kick: 0 };

class BeatPlayer {
  readonly audio = new Audio();
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  // A second, unsmoothed analyser for the low end only. The visual one smooths and tops out at
  // -30 dB, so a beat's 808 held its bass reading at ~0.85 the whole time: nothing moved, and
  // a kick detector comparing against that never fired (4 kicks in 43 s on the first beat tried).
  private low: AnalyserNode | null = null;
  private freq = new Uint8Array(0);
  private lowDb = new Float32Array(0);
  private listeners = new Set<() => void>();
  private recent: [number, number][] = [];
  private kick = 0;
  private lastKick = 0;
  private smooth: Levels = { ...QUIET };
  private lastCall = 0;
  /** Set when the file won't load, so the card can say so instead of sitting at 0:00. */
  failed = false;

  constructor() {
    this.audio.preload = 'none';
    // The set loops: after the last beat's breath, the first comes round again.
    this.audio.loop = true;
    this.audio.src = SET;
    this.audio.addEventListener('error', () => { this.failed = true; this.emit(); });
    for (const ev of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'waiting', 'playing', 'seeked']) this.audio.addEventListener(ev, () => this.emit());
  }
  /** The beat under the playhead. The breath before a beat already belongs to it. */
  get index() {
    const t = this.audio.currentTime;
    let i = 0;
    TRACKS.forEach((tr, k) => { if (t >= tr.start - 0.3) i = k; });
    return i;
  }
  get track() { return TRACKS[this.index]; }
  get playing() { return !this.audio.paused; }
  get count() { return TRACKS.length; }
  /** Seconds into the current beat, and its length: what the card shows. */
  get time() { return Math.min(this.track.length, Math.max(0, this.audio.currentTime - this.track.start)); }
  get duration() { return this.track.length; }

  private graph() {
    if (this.ctx) return;
    // Created on the first play, which is always a click: browsers only allow audio then.
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaElementSource(this.audio);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    src.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.low = this.ctx.createAnalyser();
    this.low.fftSize = 1024;
    this.low.smoothingTimeConstant = 0;
    src.connect(this.low);
    this.lowDb = new Float32Array(this.low.frequencyBinCount);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
  }
  play(i?: number) {
    this.graph();
    // After a failed load, a tap tries the file again from scratch.
    if (this.failed) { this.failed = false; this.audio.src = SET; this.audio.load(); this.emit(); }
    // A beat starts from the breath just before it, so its first kick is never clipped.
    if (i !== undefined && i !== this.index) this.audio.currentTime = Math.max(0, TRACKS[i].start - 0.1);
    // Resume and play in the same breath, with no await between: Safari only honours a tap
    // for calls made before the first await, and an awaited resume() on a suspended context
    // can wait forever. The media element can't be heard until the context runs.
    void this.ctx?.resume();
    return this.audio.play().catch(() => undefined);
  }
  pause() { this.audio.pause(); }
  toggle() { return this.playing ? this.pause() : this.play(); }
  next() { return this.play((this.index + 1) % TRACKS.length); }
  /** Seek within the current beat, 0–1. */
  seek(frac: number) { const tr = this.track; this.audio.currentTime = tr.start + Math.min(1, Math.max(0, frac)) * tr.length; }
  on(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { this.listeners.forEach((f) => f()); }

  /** Frequency bins for a visualizer (0–255), or null when silent. */
  spectrum() {
    if (!this.analyser || !this.playing) return null;
    this.analyser.getByteFrequencyData(this.freq);
    return this.freq;
  }
  /** Bass, mids, highs (0–1) and a kick pulse that jumps on each hit and decays. Call once a frame. */
  levels(): Levels {
    // The hero and the GameOver card both ask every frame: answer once per frame.
    const t = performance.now();
    if (t - this.lastCall < 8) return this.smooth;
    this.lastCall = t;
    const f = this.spectrum();
    if (!f) { this.smooth = { bass: this.smooth.bass * 0.9, mid: this.smooth.mid * 0.9, high: this.smooth.high * 0.9, kick: this.kick *= 0.85 }; return this.smooth; }
    const hz = (this.ctx?.sampleRate ?? 44100) / 2 / f.length;
    const band = (a: number, b: number) => { let s = 0, n = 0; for (let k = Math.max(1, Math.floor(a / hz)); k <= Math.ceil(b / hz); k++) { s += f[k]; n++; } return n ? s / n / 255 : 0; };
    const mid = band(300, 2000), high = band(5000, 12000);
    // The low end, 40–120 Hz, in dB from the unsmoothed analyser. On Starlight and Senses it
    // sits around -34 to -42 dB and peaks near -20, so -50…-22 maps onto 0…1 with room to move.
    let db = -100;
    if (this.low) {
      this.low.getFloatFrequencyData(this.lowDb);
      const lz = this.ctx!.sampleRate / 2 / this.lowDb.length;
      let p = 0, n = 0;
      for (let k = Math.max(1, Math.floor(40 / lz)); k <= Math.ceil(120 / lz); k++) { p += 10 ** (this.lowDb[k] / 10); n++; }
      db = n && p > 0 ? 10 * Math.log10(p / n) : -100;
    }
    const bass = Math.min(1, Math.max(0, (db + 50) / 28));
    // A kick is the low end rising 10 dB within ~50 ms. Checked offline against each beat's
    // grid: about one hit a second on Starlight and Senses (up to 2.5 on busier beats), nearly
    // all on a sixteenth. The gap stops one hit counting twice. The decay comes first, so the frame that hears the hit reports a full 1.
    this.kick *= 0.86;
    // The window keeps the previous reading however old it is, so a slow frame rate compares
    // frame to frame instead of against nothing.
    const prev = this.recent[this.recent.length - 1];
    this.recent = this.recent.filter(([at]) => t - at < 55);
    if (!this.recent.length && prev) this.recent.push(prev);
    const floor = this.recent.reduce((m, [, d]) => Math.min(m, d), Infinity);
    if (db - floor > 10 && db > -40 && t - this.lastKick > 160) { this.kick = 1; this.lastKick = t; }
    this.recent.push([t, db]);
    const s = this.smooth;
    // Fast attack, slower release: the bass swells with each 808 and eases off between them.
    s.bass += (bass - s.bass) * (bass > s.bass ? 0.55 : 0.15);
    s.mid += (mid - s.mid) * 0.25; s.high += (high - s.high) * 0.4; s.kick = this.kick;
    return s;
  }
}

export const player = TRACKS.length ? new BeatPlayer() : null;
export type Player = BeatPlayer;

export const fmtTime = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
