// GlazeBot: Omer's hype man, back from the old site. The model, its instructions and the
// fact sheet all live on the server (github.com/elammaryo/ai-chatbot, deployed on Render);
// the browser only ever sends the conversation. The server's CORS list decides which sites
// may talk to it, so anywhere else (a preview, localhost) the bot says it's on mute instead
// of failing mysteriously.

const API = 'https://ai-chatbot-kcyl.onrender.com';
const LIVE = /(^|\.)omerelammary\.(com|netlify\.app)$/.test(location.hostname);
const WELCOME = 'Hey, I’m GlazeBot, Omer’s hype man. I’m biased on purpose, but I only use real facts. Ask me anything about his work.';
const SUGGEST = ['Glaze Omer 🔥', 'What’s GameDay?', 'Is he any good?', 'What does he do at CMiC?', 'Why cricket and soccer?'];

type Msg = { role: 'user' | 'assistant'; content: string };

// The old site's icon: Lucide's bot-message-square (lucide.dev, ISC licence).
const BOT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6V2H8"/><path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z"/><path d="M2 12h2"/><path d="M9 11v2"/><path d="M15 11v2"/><path d="M20 12h2"/></svg>`;
const CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

export function initGlazeBot(reduced: boolean) {
  const root = document.createElement('div');
  root.className = 'gb';
  root.innerHTML = `
    <button type="button" class="gb-launch" aria-haspopup="dialog" aria-expanded="false" aria-label="Chat with GlazeBot about Omer's work">
      <span class="gb-launch__icon">${BOT}</span><span class="gb-launch__label">GlazeBot AI</span><span class="gb-launch__pulse" aria-hidden="true"></span>
    </button>
    <section class="gb-panel" role="dialog" aria-label="GlazeBot" hidden>
      <header class="gb-head">
        <span class="gb-avatar">${BOT}</span>
        <span class="gb-title"><strong>GlazeBot</strong><span class="gb-status mono"><i></i><span>Omer’s hype man · biased on purpose</span></span></span>
        <button type="button" class="gb-close" aria-label="Close chat">✕</button>
      </header>
      <div class="gb-feed" aria-live="polite"></div>
      <div class="gb-suggest"></div>
      <form class="gb-form"><input type="text" maxlength="500" placeholder="Ask about Omer…" aria-label="Message GlazeBot" autocomplete="off" /><button type="submit" aria-label="Send">↑</button></form>
      <p class="gb-foot mono">Facts come from Omer. The enthusiasm is all mine.</p>
    </section>`;
  document.body.append(root);
  const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
  const launch = $<HTMLButtonElement>('.gb-launch'), panel = $<HTMLElement>('.gb-panel');
  const feed = $<HTMLElement>('.gb-feed'), form = $<HTMLFormElement>('.gb-form'), input = $<HTMLInputElement>('.gb-form input');
  const suggest = $<HTMLElement>('.gb-suggest'), status = $<HTMLElement>('.gb-status span');
  const icon = $<HTMLElement>('.gb-launch__icon'), label = $<HTMLElement>('.gb-launch__label');

  const history: Msg[] = [{ role: 'assistant', content: WELCOME }];
  let busy = false, woke = false;
  bubble('assistant', WELCOME);
  suggest.innerHTML = SUGGEST.map((s) => `<button type="button">${s}</button>`).join('');

  // Render's free tier sleeps. Nudge it awake the moment someone shows interest, so the first
  // real answer doesn't pay the whole cold start. An opaque request is enough to wake it.
  const wake = () => { if (woke || !LIVE) return; woke = true; fetch(`${API}/`, { mode: 'no-cors' }).catch(() => undefined); };
  launch.addEventListener('pointerenter', wake);
  launch.addEventListener('focus', wake);

  function open(on: boolean) {
    panel.hidden = !on;
    launch.setAttribute('aria-expanded', String(on));
    root.classList.toggle('is-open', on);
    root.classList.remove('is-tease');
    icon.innerHTML = on ? CLOSE : BOT;
    label.textContent = on ? 'Close' : 'GlazeBot AI';
    place();
    if (on) { wake(); setTimeout(() => input.focus({ preventScroll: true }), reduced ? 0 : 250); feed.scrollTop = feed.scrollHeight; }
    else launch.focus({ preventScroll: true });
  }
  launch.addEventListener('click', () => open(panel.hidden !== false));
  $<HTMLButtonElement>('.gb-close').addEventListener('click', () => open(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });

  // Out of the way on the first screen: the headline should land before anything asks to
  // chat. The launcher slides in
  // once the page scrolls, and the first time it does, its label opens for a few seconds
  // (the old site's tease), once per visit.
  let teased = false;
  try { teased = sessionStorage.getItem('gb-teased') === '1'; } catch { /* private mode */ }
  let away = true, raf = 0;
  const place = () => {
    raf = 0;
    // Away until the hero's flight has landed: the section after the hero is well up the screen.
    const next = document.getElementById('stats');
    const early = next ? next.getBoundingClientRect().top > window.innerHeight * 0.55 : window.scrollY < window.innerHeight * 0.45;
    const nowAway = early && panel.hidden !== false;
    if (nowAway === away) return;
    away = nowAway;
    root.classList.toggle('is-away', away);
    if (!away && !teased) {
      teased = true;
      try { sessionStorage.setItem('gb-teased', '1'); } catch { /* private mode */ }
      window.setTimeout(() => { if (panel.hidden !== false) root.classList.add('is-tease'); }, reduced ? 0 : 900);
      window.setTimeout(() => root.classList.remove('is-tease'), reduced ? 6000 : 7400);
    }
  };
  root.classList.add('is-away');
  place();
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(place); }, { passive: true });

  function bubble(role: Msg['role'], text: string) {
    const p = document.createElement('p');
    p.className = `gb-msg gb-msg--${role === 'user' ? 'me' : 'bot'}`;
    p.textContent = text;
    feed.append(p);
    feed.scrollTop = feed.scrollHeight;
    return p;
  }

  async function ask(text: string) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    input.value = '';
    suggest.hidden = true;
    bubble('user', text);
    history.push({ role: 'user', content: text });
    const typing = document.createElement('p');
    typing.className = 'gb-msg gb-msg--bot gb-typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    feed.append(typing);
    feed.scrollTop = feed.scrollHeight;
    if (!LIVE) {
      await new Promise((r) => setTimeout(r, 700));
      typing.remove();
      const t = 'I only talk from omerelammary.com, and this is a preview, so I’m on mute here. Find me on the live site.';
      bubble('assistant', t);
      busy = false;
      return;
    }
    // A cold start can take the better part of a minute; say so instead of looking broken.
    const slow = window.setTimeout(() => { status.textContent = 'waking up (free tier, it naps)…'; }, 4000);
    const slower = window.setTimeout(() => { status.textContent = 'still stretching… almost there'; }, 18000);
    let reply = '';
    try {
      const ctrl = new AbortController();
      const kill = window.setTimeout(() => ctrl.abort(), 70000);
      const res = await fetch(`${API}/chatbot/openaiChatResponse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ messages: history.slice(-24) }),
      });
      window.clearTimeout(kill);
      const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
      reply = res.ok && data.content ? data.content.trim() : '';
    } catch { /* network, CORS or timeout: handled below */ }
    window.clearTimeout(slow); window.clearTimeout(slower);
    status.textContent = 'Omer’s hype man · biased on purpose';
    typing.remove();
    if (reply) {
      history.push({ role: 'assistant', content: reply });
      bubble('assistant', reply);
    } else {
      history.pop();
      bubble('assistant', 'I lost my train of thought (the server didn’t answer). Try that again in a moment?');
    }
    busy = false;
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); void ask(input.value); });
  suggest.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (b) void ask((b.textContent ?? '').replace(/\s*🔥$/, ''));
  });
}
