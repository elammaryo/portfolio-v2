"""Cut Omer's beats into the ~40-second previews, joined into one set file.

    python3 scripts/cut-beats.py grid <beat.mp3|wav> <bpm>    # print the bar grid and sections
    python3 scripts/cut-beats.py cut <folder with the sources>  # write public/audio/set-<hash>.mp3

Needs ffmpeg, numpy, soundfile and librosa (pip install librosa soundfile). `cut` prints the
set's file name and the start and length of each beat in it; copy them into SET and TRACKS
in src/audio.ts.

Why one file: with a file per beat, only the first ever played on the published page. Moving
to the next meant swapping the audio element's source and calling play() again outside a
tap, which the browser refused, and it showed 0:00. One continuous file never stops, so the
next beat simply arrives, and Next is a seek. It is constant-bitrate on purpose: browsers
seek a VBR MP3 by its rough table of contents, which can land a second off.

Each preview is a short lead-in, the drop, and a fade that lands on a bar line, so it starts
on the good part and ends like music rather than mid-bar. The BPM comes from Omer's file
names, not a beat tracker (librosa heard Shooting Stars' half-time trap as 96 BPM). `grid`
finds the beat phase with a comb over kick-weighted onsets, then which beat is beat one from
where the sections change, and prints a bar table to pick the lead-in, drop and fade from.
Check the drop lands on a bar line in the output before trusting a new beat's numbers.

Loudness is matched with a static gain to -16 LUFS rather than ffmpeg's loudnorm, which
switched to dynamic compression on these masters (their peaks sit near 0 dBTP) and would
have squashed the drums. -16 keeps the loudest peak under -0.8 dBTP after MP3 encoding.
"""
import glob
import hashlib
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

# slug, source file (in the sources folder), title, bpm, first downbeat (s), start bar,
# end bar (exclusive), fade bars. Bars counted from the first downbeat, found with `grid`.
SPEC = [
    # Omer picked these two on 2026-09-29 (in place of Shooting Stars, Taka Tak and #92). Each
    # is the newest version in his Drive.
    ('starlight', '#17 Starlight [Trap Re-mixed] (Cmaj_130bpm).mp3', 'Starlight', 130, 0.048, 6, 28, 2),
    ('senses', '#41 Senses [Drill Re-mixed 2] (C#min_134bpm).mp3', 'Senses', 134, 0.036, 14, 36, 2),
]
TARGET_LUFS = -16.0
PRE = 0.008  # start just before the downbeat, so the first kick keeps its attack


def decode(path):
    wav = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ar', '44100', '-ac', '2', '-f', 'wav', '-c:a', 'pcm_f32le', '-'],
                         capture_output=True, check=True).stdout
    import io
    return sf.read(io.BytesIO(wav), dtype='float32')


def grid(path, bpm):
    import librosa
    y2, sr = decode(path)
    y = y2.mean(1)
    hop, P = 256, 60 / bpm
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    fr = librosa.fft_frequencies(sr=sr, n_fft=2048)

    def flux(mask):
        m = np.log1p(S[mask] * 10)
        return np.concatenate([[0], np.maximum(0, np.diff(m, axis=1)).sum(0)])

    low, full = flux(fr < 150), flux(fr > 0)
    env = low / (low.max() + 1e-9) + 0.5 * full / (full.max() + 1e-9)
    end = len(y) / sr

    def comb(ph):
        idx = np.round(np.arange(ph, end, P) * sr / hop).astype(int)
        return env[idx[idx < len(env)]].mean()

    phs = np.arange(0, P, 0.002)
    ph = phs[np.argmax([comb(p) for p in phs])]
    bands = [(20, 150), (150, 2000), (2000, 8000), (8000, 16000)]

    def feat(t0, t1):
        i0 = int(t0 * sr / hop)
        i1 = max(i0 + 1, int(t1 * sr / hop))
        return np.array([np.log10((S[(fr >= a) & (fr < b), i0:i1] ** 2).sum() + 1e-6) for a, b in bands])

    beats = np.arange(ph, end, P)
    # Sections change on beat one, so the biggest sustained steps in loudness (two bars after
    # against two bars before) vote for which beat of the bar is the downbeat. Single-beat
    # jumps don't work (a half-time snare jumps 9 dB every bar), and comparing whole bars was
    # fooled on #92, whose riser fills the beat before each drop. The fade at the end is left
    # out of the vote.
    rms = np.array([20 * np.log10(np.sqrt((y[int(b * sr): int((b + P) * sr)] ** 2).mean()) + 1e-9) for b in beats])
    W, n = 8, len(rms) - 16
    step = np.array([rms[k:k + W].mean() - rms[k - W:k].mean() if W <= k <= n - W else 0 for k in range(n)])
    peaks = [k for k in range(1, n - 1) if abs(step[k]) >= max(abs(step[k - 1]), abs(step[k + 1]))]
    top = sorted(peaks, key=lambda k: -abs(step[k]))[:6]
    best = int(np.bincount([k % 4 for k in top], minlength=4).argmax())
    bar0 = beats[best] % (4 * P)
    print(f'first downbeat {bar0:.3f}s (bar = {4 * P:.3f}s)')
    prev = None
    for k in range(int((end - bar0) // (4 * P))):
        t0 = bar0 + k * 4 * P
        seg = y[int(t0 * sr): int((t0 + 4 * P) * sr)]
        f = feat(t0, t0 + 4 * P)
        nov = 0 if prev is None else np.abs(f - prev).sum()
        prev = f
        print(f'bar {k:3d} {t0:7.2f}s {20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9):6.1f} dB  '
              f'sub {f[0]:5.2f} mid {f[1]:5.2f} hats {f[3]:5.2f}{"  << change" if nov > 1.5 else ""}')


GAP = 0.6  # silence after each beat, so one ends before the next begins (and before the loop)


def cut(src_dir):
    parts, rows, t = [], [], 0.0
    for slug, name, title, bpm, ph, b0, b1, fade in SPEC:
        y, sr = decode(f'{src_dir}/{name}')
        bar = 240 / bpm
        a = int(round((ph + b0 * bar - PRE) * sr))
        b = int(round((ph + b1 * bar - PRE) * sr))
        seg = y[a:b].copy()
        n = int(PRE * sr)
        seg[:n] *= (np.sin(np.linspace(0, np.pi / 2, n)) ** 2)[:, None]
        n = int(fade * bar * sr)
        seg[-n:] *= (np.cos(np.linspace(0, 1, n) * np.pi / 2) ** 1.6)[:, None]
        tmp = f'/tmp/{slug}.wav'
        sf.write(tmp, seg, sr, subtype='FLOAT')
        log = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
                             capture_output=True, text=True).stderr
        lufs = float(json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', log, re.S).group(0))['input_i'])
        seg *= 10 ** ((TARGET_LUFS - lufs) / 20)
        parts += [seg, np.zeros((int(GAP * sr), 2), dtype=np.float32)]
        rows.append((title, t, len(seg) / sr))
        t += len(seg) / sr + GAP
        print(f'{slug}: bars {b0}-{b1 - 1}, {len(seg) / sr:.1f}s, {lufs:.1f} LUFS -> {TARGET_LUFS}')
    sf.write('/tmp/gameover-set.wav', np.concatenate(parts), sr, subtype='FLOAT')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', '/tmp/gameover-set.wav', '-ar', '44100', '-c:a', 'libmp3lame',
                    '-b:a', '192k', '-id3v2_version', '3', '-metadata', 'title=GameOver set', '-metadata', 'artist=GameOver',
                    '/tmp/gameover-set.mp3'], check=True)
    # Named by its content: TRACKS' start times belong to one exact file, and a browser still
    # holding an older set under the same name would play the wrong beat at each start.
    data = open('/tmp/gameover-set.mp3', 'rb').read()
    name = f'set-{hashlib.sha1(data).hexdigest()[:8]}.mp3'
    for old in glob.glob('public/audio/set-*.mp3') + glob.glob('public/audio/gameover-set.mp3'):
        os.remove(old)
    open(f'public/audio/{name}', 'wb').write(data)
    print(f"\n  const SET = 'audio/{name}';")
    for title, start, length in rows:
        print(f"  {title}: start {start:.3f}, length {length:.3f}")


if __name__ == '__main__':
    if sys.argv[1] == 'grid':
        grid(sys.argv[2], float(sys.argv[3]))
    else:
        cut(sys.argv[2])
