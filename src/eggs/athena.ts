import gsap from 'gsap';

// Athena's card: one thing she does that a phone's reminders can't. You tell her several
// things in one message and she puts each where it belongs: the calendar, a promise with a
// nudge before it's due, a goal with a first step, an email drafted to wait for your yes.
// Example data (the app is private), and nothing here claims more than the real app does
// (her send_email tool is permission-gated: a draft until he confirms).
//
// The first example is written into the HTML, so the card reads with no script at all. This
// plays it in once the card is in view, and "Hand her another" plays the next.
//
// Until 2026-09-29 this was a five-page phone (morning, nudge, night, Sunday) with a chat
// demo and a rule-based reader. Omer: "I kind of just turned it into a whole app demo rather
// than just a little thing like the other projects." Keep it one small moment.

type Kind = 'cal' | 'promise' | 'goal' | 'draft' | 'todo';
type Row = { kind: Kind; label: string; title: string; detail: string };
type Example = { msg: (string | [string, Kind])[]; says: string; rows: Row[] };

const EXAMPLES: Example[] = [
  {
    msg: [['Dentist Tuesday at 3', 'cal'], ', ', ['send Sam the deck by Friday', 'promise'], ', and ', ['I want to start running', 'goal'], '.'],
    says: 'Got all three. Here’s where each one went:',
    rows: [
      { kind: 'cal', label: 'Calendar', title: 'Dentist', detail: 'Tue 3:00 PM · I’ll tell you when to leave' },
      { kind: 'promise', label: 'Promise to Sam', title: 'The deck', detail: 'Due Friday · a nudge Thursday night if it’s still open' },
      { kind: 'goal', label: 'New goal', title: 'Start running', detail: 'First step: a 20-minute run on Saturday' },
    ],
  },
  {
    msg: [['Email my landlord that the sink is leaking', 'draft'], ', and ', ['book an oil change next week', 'todo'], '.'],
    says: 'Two things. The email only needs your yes:',
    rows: [
      { kind: 'draft', label: 'Email · draft', title: 'To your landlord: the sink', detail: 'Written and waiting. It goes out when you say send.' },
      { kind: 'todo', label: 'To do', title: 'Book an oil change', detail: 'Next week · in Monday’s brief' },
    ],
  },
  {
    msg: [['Soccer Friday at 8', 'cal'], ', ', ['pay Maya back $40 by Sunday', 'promise'], ', ', ['read 20 minutes a day', 'goal'], '.'],
    says: 'All three, sorted:',
    rows: [
      { kind: 'cal', label: 'Calendar', title: 'Soccer', detail: 'Fri 8:00 PM' },
      { kind: 'promise', label: 'Promise to Maya', title: '$40 back', detail: 'Due Sunday · a reminder Saturday morning' },
      { kind: 'goal', label: 'New goal', title: 'Read 20 minutes a day', detail: 'First step: 10 pages tonight' },
    ],
  },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rowEl(r: Row) {
  const li = document.createElement('li');
  li.className = `k-${r.kind}`;
  li.innerHTML = '<i class="at-ico" aria-hidden="true"></i><span><span class="at-kind mono"></span><b></b><small></small></span>';
  li.querySelector('.at-kind')!.textContent = r.label;
  li.querySelector('b')!.textContent = r.title;
  li.querySelector('small')!.textContent = r.detail;
  return li;
}

export function initAthenaEgg(art: HTMLElement, reduced: boolean) {
  const msg = art.querySelector<HTMLElement>('.at-msg')!;
  const says = art.querySelector<HTMLElement>('.at-says')!;
  const list = art.querySelector<HTMLElement>('.at-sorted')!;
  const again = art.querySelector<HTMLButtonElement>('.at-again')!;
  const owl = art.querySelector<HTMLElement>('.at-owl');
  let shown = 0;
  let busy = false;

  async function play(ex: Example) {
    busy = true;
    again.disabled = true;
    if (!reduced) await gsap.to([...list.children, says], { opacity: 0, duration: 0.2 });
    list.replaceChildren();
    says.textContent = '';
    says.style.opacity = '';
    // The message types in, plain; then each phrase lights up as its row lands.
    const plain = ex.msg.map((m) => (typeof m === 'string' ? m : m[0])).join('');
    if (reduced) msg.textContent = plain;
    else for (let i = 0; i <= plain.length; i += 2) { msg.textContent = plain.slice(0, i); await wait(14); }
    msg.replaceChildren(...ex.msg.map((m) => {
      if (typeof m === 'string') return document.createTextNode(m);
      const mark = document.createElement('mark');
      mark.className = `k-${m[1]} is-quiet`;
      mark.textContent = m[0];
      return mark;
    }));
    if (!reduced) {
      if (owl) gsap.fromTo(owl, { y: 0 }, { y: 6, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.inOut' });
      says.innerHTML = '<span class="at-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      await wait(600);
    }
    says.textContent = ex.says;
    const marks = [...msg.querySelectorAll('mark')];
    for (const [i, r] of ex.rows.entries()) {
      marks[i]?.classList.remove('is-quiet');
      const li = rowEl(r);
      list.append(li);
      if (!reduced) { gsap.from(li, { opacity: 0, y: -10, duration: 0.45, ease: 'back.out(1.6)' }); await wait(380); }
    }
    again.disabled = false;
    busy = false;
  }

  // The first example plays in once, the first time the card is on screen.
  if (!reduced) {
    new IntersectionObserver(([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      void play(EXAMPLES[0]);
    }, { threshold: 0.45 }).observe(art);
  }
  again.addEventListener('click', () => {
    if (busy) return;
    shown = (shown + 1) % EXAMPLES.length;
    void play(EXAMPLES[shown]);
  });
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __at: { play: (i: number) => play(EXAMPLES[i]), busy: () => busy } });
}
