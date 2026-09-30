import gsap from 'gsap';

// Budget easter egg: sync the bank. New transactions arrive the way a bank sends them
// (card-processor noise and all), then tidy themselves up the way the real app does it:
// the merchant name is cleaned, a rule files the category, a subscription is spotted and a
// friend's e-transfer is matched to the bill it settles. Sample data, not anyone's account.

type Tx = { raw: string; name: string; cat: string; tone: string; amt: number; note?: string };
const FEED: Tx[] = [
  { raw: 'SQ *TIM HORTONS #4412 MISSISSAUGA', name: 'Tim Hortons', cat: 'Coffee', tone: '#f2c879', amt: -2.45 },
  { raw: 'AMZN MKTP CA*2K4L91XZ3', name: 'Amazon', cat: 'Shopping', tone: '#b9a6ff', amt: -34.99 },
  { raw: 'SPOTIFY P1A2B3C4D5 STOCKHOLM', name: 'Spotify', cat: 'Subscription', tone: '#7df0b2', amt: -11.99, note: 'monthly, spotted' },
  { raw: 'INTERAC E-TRF RCVD J DOE', name: 'Jane', cat: 'Paid you back', tone: '#8fd3ff', amt: 42.5, note: 'settles Friday’s dinner' },
  { raw: 'UBER CANADA/UBERTRIP TORONTO ON', name: 'Uber', cat: 'Transport', tone: '#ff9c7a', amt: -18.2 },
];
const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`;

export function initBudgetEgg(art: HTMLElement, reduced: boolean) {
  const btn = art.querySelector<HTMLButtonElement>('.bd-sync')!;
  const rows = art.querySelector<HTMLElement>('.bd-rows')!;
  const value = art.querySelector<HTMLElement>('.bd-v')!;
  const base = 4820;
  let running = false;

  const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  // The raw bank text turns into the clean name letter by letter.
  async function unscramble(el: HTMLElement, from: string, to: string) {
    if (reduced) { el.textContent = to; return; }
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ*#0123456789';
    const n = 12;
    for (let i = 1; i <= n; i++) {
      const keep = Math.floor((to.length * i) / n);
      const tail = Math.max(0, Math.round(from.length * (1 - i / n)) - keep);
      el.textContent = to.slice(0, keep) + Array.from({ length: Math.min(tail, 14) }, () => glyphs[(Math.random() * glyphs.length) | 0]).join('');
      await wait(28);
    }
    el.textContent = to;
  }

  async function sync() {
    if (running) return;
    running = true;
    btn.disabled = true;
    btn.classList.add('is-syncing');
    btn.textContent = '↻ Syncing…';
    rows.replaceChildren();
    await wait(600);
    let total = 0;
    for (const tx of FEED) {
      const li = document.createElement('li');
      li.className = 'bd-row';
      li.style.setProperty('--tone', tx.tone);
      li.innerHTML = `<span class="bd-row__name mono"></span><span class="bd-row__cat"></span><span class="bd-row__amt mono">${money(tx.amt)}</span>`;
      const name = li.querySelector<HTMLElement>('.bd-row__name')!;
      const cat = li.querySelector<HTMLElement>('.bd-row__cat')!;
      name.textContent = tx.raw;
      rows.append(li);
      if (!reduced) gsap.from(li, { opacity: 0, y: -10, duration: 0.35, ease: 'power3.out' });
      await wait(380);
      li.classList.add('is-clean');
      void unscramble(name, tx.raw, tx.name);
      await wait(220);
      cat.innerHTML = `<i></i>${tx.cat}${tx.note ? `<em>${tx.note}</em>` : ''}`;
      if (!reduced) gsap.from(cat, { opacity: 0, scale: 0.85, duration: 0.4, ease: 'back.out(2)' });
      // The forecast moves with every transaction that lands.
      const shown = { v: base + total };
      total += tx.amt;
      gsap.to(shown, {
        v: base + total, duration: reduced ? 0 : 0.5, ease: 'power2.out',
        onUpdate: () => { value.textContent = `+$${Math.round(shown.v).toLocaleString('en-CA')}`; },
      });
      await wait(260);
    }
    const foot = document.createElement('li');
    foot.className = 'bd-foot mono';
    foot.textContent = `5 sorted by rules · 1 subscription spotted · 1 split settled`;
    rows.append(foot);
    if (!reduced) gsap.from(foot, { opacity: 0, duration: 0.4 });
    btn.classList.remove('is-syncing');
    btn.textContent = '↻ Sync again';
    btn.disabled = false;
    running = false;
  }
  btn.addEventListener('click', () => void sync());
}
