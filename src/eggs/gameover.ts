import gsap from 'gsap';
import { fmtTime, player } from '../audio';

// GameOver easter egg: the player bar plays. The waveform turns into a live spectrum, the
// aurora breathes with the bass and the logo kicks with the drums. Once something is
// playing, a small pill keeps it controllable anywhere on the page, like GameOver's own
// player, which keeps going between pages.

export function initGameOverEgg(art: HTMLElement, bars: HTMLElement[], reduced: boolean) {
  if (!player) return;
  const p = player;
  const bar = art.querySelector<HTMLElement>('.go-player')!;
  bar.innerHTML = `
    <button type="button" class="go-play" aria-label="Play">▶</button>
    <span class="go-title"></span>
    <span class="go-time">0:00</span>
    ${p.count > 1 ? '<button type="button" class="go-next" aria-label="Next beat">⏭</button>' : ''}
    <span class="go-seek" role="slider" aria-label="Seek" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span>`;
  bar.classList.add('is-live');
  art.dataset.cursor = '';
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
  const pill = document.createElement('div');
  pill.className = 'np';
  pill.hidden = true;
  pill.innerHTML = `<button type="button" class="np-toggle" aria-label="Pause">❚❚</button><button type="button" class="np-title"></button><span class="np-eq" aria-hidden="true"><i></i><i></i><i></i></span>`;
  document.body.append(pill);
  const pillToggle = pill.querySelector<HTMLButtonElement>('.np-toggle')!;
  const pillTitle = pill.querySelector<HTMLButtonElement>('.np-title')!;
  pillToggle.addEventListener('click', () => void p.toggle());
  pillTitle.addEventListener('click', () => art.closest('.project')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));

  let artVisible = false;
  new IntersectionObserver(([e]) => { artVisible = e.isIntersecting; sync(); if (artVisible) wake(); }, { threshold: 0.15 }).observe(art);

  const idle = () => bars.flatMap((b) => gsap.getTweensOf(b));
  function sync() {
    const t = p.track;
    const on = p.playing;
    btn.textContent = on ? '❚❚' : '▶';
    btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    title.innerHTML = p.failed
      ? '<b>The beats didn’t load</b><span> · try again in a moment</span>'
      : `<b>${t.title}</b><span> · ${t.subtitle ?? `${t.genre} · ${t.bpm} BPM`}</span>`;
    pillTitle.textContent = `♪ ${t.title} · GameOver`;
    pillToggle.textContent = on ? '❚❚' : '▶';
    pillToggle.setAttribute('aria-label', on ? 'Pause' : 'Play');
    // Times are within the current beat, not the whole set file.
    const d = p.duration, c = p.time;
    time.textContent = on || c > 0 ? `${fmtTime(c)} / ${fmtTime(d)}` : fmtTime(d);
    fill.style.width = d ? `${(c / d) * 100}%` : '0%';
    seek.setAttribute('aria-valuenow', String(d ? Math.round((c / d) * 100) : 0));
    // Once something has played, the pill stays for the visit (paused or not) unless the card is on screen.
    if (on || c > 0) pill.hidden = artVisible;
    art.classList.toggle('is-playing', on);
    if (on) { idle().forEach((tw) => tw.pause()); wake(); }
    else { idle().forEach((tw) => tw.resume()); art.style.removeProperty('--pulse'); art.style.removeProperty('--kick'); }
  }
  p.on(sync);
  sync();

  // Spectrum drives the bars while playing: log-spaced bins so the bass doesn't hog them.
  let raf = 0;
  function frame() {
    raf = 0;
    if (!p.playing || !artVisible || document.hidden) return;
    const f = p.spectrum();
    const lv = p.levels();
    if (f) {
      const n = bars.length;
      for (let i = 0; i < n; i++) {
        const a = Math.floor(2 * Math.pow(f.length / 4 / 2, i / n)), b = Math.max(a + 1, Math.floor(2 * Math.pow(f.length / 4 / 2, (i + 1) / n)));
        let s = 0;
        for (let k = a; k < b; k++) s += f[k];
        // Tilt the gain toward the top end: beats are bass-heavy and the low bars pinned at max.
        const v = (s / (b - a) / 255) * (0.62 + (1.05 * i) / n);
        bars[i].style.transform = `scaleY(${Math.max(0.06, Math.min(1.15, v * v * 1.6))})`;
      }
    }
    art.style.setProperty('--pulse', lv.bass.toFixed(3));
    art.style.setProperty('--kick', lv.kick.toFixed(3));
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && p.playing) raf = requestAnimationFrame(frame); }
}
