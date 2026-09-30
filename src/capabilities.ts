import gsap from 'gsap';

// Capabilities × projects. A lit cell means the capability was used to ship something
// real in that project; the text says what. Sources: the repos, the resume, and the
// current site (for CMiC and Skinopathy, whose code isn't public).

type Project = { id: string; name: string; color: string; note: string };
type Row = { id: string; name: string; cells: Record<string, string> };

const PROJECTS: Project[] = [
  { id: 'superover', name: 'SuperOver', color: '#1fd17a', note: 'Founding engineer' },
  { id: 'gameday', name: 'GameDay', color: '#ff4d6a', note: 'Independent venture' },
  { id: 'athena', name: 'Athena', color: '#b9a6ff', note: 'Personal AI' },
  { id: 'budget', name: 'Budget', color: '#f2c879', note: 'Personal finance' },
  { id: 'gameover', name: 'GameOver', color: '#3dd6f5', note: 'Music platform' },
  { id: 'glazebot', name: 'GlazeBot', color: '#f7b2c8', note: 'AI guide' },
  { id: 'skinopathy', name: 'Skinopathy', color: '#8fb3ff', note: 'Healthtech, 2023–25' },
  { id: 'cmic', name: 'CMiC', color: '#d9d5ea', note: 'Now' },
];

const ROWS: Row[] = [
  { id: 'mobile', name: 'Mobile apps', cells: {
    superover: 'A Flutter app on the App Store and Google Play: 24 screens, wallet payments, maps, push and live chat.',
    skinopathy: 'Flutter features in a healthtech app: booking, a food journal, a multi-step medical questionnaire and an AI skin assessment flow.',
    cmic: 'Flutter front ends for construction project management, on a local Drift database.',
  } },
  { id: 'web', name: 'Web front ends', cells: {
    gameday: 'A Next.js 16 booking site and the admin dashboard behind it: rosters, check-in, finances.',
    budget: 'An installable React app with 23 screens, charts and a what-if sandbox.',
    gameover: 'A music site whose player keeps going between pages, over a WebGL aurora.',
    superover: 'The marketing site, with waitlists, host recruitment and SEO.',
    athena: 'An installable web app with voice input and a sheet-based interface.',
  } },
  { id: 'api', name: 'APIs & backends', cells: {
    superover: 'An Express API on Cloud Functions: 19 routes and 8 deployed functions.',
    athena: 'A Fastify server with 65 routes and a shared zod contract that fails the build on both sides when it drifts.',
    gameday: 'Server Actions and route handlers with validation and per-IP rate limits.',
    skinopathy: 'Go APIs for rescheduling and cancelling appointments, with request validation.',
    budget: 'Seven Deno Edge Functions, five of them for Plaid: linking, token exchange, sync, webhooks and unlinking.',
    gameover: 'Eleven Next.js route handlers for Spotify sign-in, playlists and listening stats, and for signing S3 links.',
    glazebot: 'An Express proxy that owns the prompt and my profile, so the browser only ever sends the conversation.',
  } },
  { id: 'payments', name: 'Payments', cells: {
    superover: 'Stripe PaymentIntents priced on the server, webhooks verified on the raw body, refunds handled.',
    gameday: 'Stripe Checkout, plus Interac e-transfers matched from the payments inbox, with one dedup table for both.',
  } },
  { id: 'data', name: 'Databases & SQL', cells: {
    gameday: 'Postgres with Drizzle: advisory locks, atomic seat reservation and a partial unique index for payment codes.',
    budget: '28 tables and 30 SQL functions, including a forecasting engine with p10 to p90 bands.',
    athena: '33 tables across 34 migrations, with capture made idempotent by generated fingerprints and upserts.',
    superover: 'A Firestore schema across 13 collections, with transactions for joins and host claims.',
  } },
  { id: 'security', name: 'Security & privacy', cells: {
    budget: 'Row-level security on all 28 tables; the bank token is readable only by the server.',
    gameday: 'Hashed booking tokens, rate limits, signed webhooks and SPF/DKIM checks on payment emails.',
    superover: 'Secrets in GCP Secret Manager, and no payment counts until Stripe’s signature checks out.',
    athena: 'Per-action trust levels (ask, draft, auto) and a kill switch before anything reaches another person.',
    gameover: 'Spotify tokens in HttpOnly cookies, the client secret kept on the server, and audio only through signed links that expire in an hour.',
    glazebot: 'Model keys never reach the browser, only allowlisted sites can call it, and roles sent by the client are never trusted.',
  } },
  { id: 'realtime', name: 'Real-time & push', cells: {
    superover: 'Live game chat on Firestore streams and pushes that open the right screen.',
    athena: 'Web push to an installed app, with quiet hours and a daily budget for nudges.',
    budget: 'Realtime refreshes the dashboard the moment a transaction lands.',
  } },
  { id: 'ai', name: 'AI & LLMs', cells: {
    athena: 'Claude with 36 tools. Chat cost fell from about 9¢ to 0.4¢ an exchange, measured in production.',
    glazebot: 'A guide to my work, grounded in a profile I approved and told to decline anything it can’t back up.',
    skinopathy: 'The AI skin assessment flow: questions in, categorised results from the model out.',
  } },
  { id: 'jobs', name: 'Jobs & webhooks', cells: {
    athena: 'Five schedules: the 6 AM brief, a 9 PM recap, nudges every 15 minutes, a 5 AM cleanup and encrypted nightly backups.',
    gameday: 'Three scheduled jobs on Upstash QStash with a daily Vercel Cron backup and health checks on an admin page, a payments inbox read over IMAP, and a Stripe webhook that ignores repeat events.',
    superover: 'The Stripe webhook, five Firestore triggers, Cloud Tasks for host reminders and a job that reminds players two hours out.',
    budget: 'Plaid webhooks with verified signatures and cursor-based sync, a nightly fallback sync, and nightly balance snapshots.',
  } },
  { id: 'quality', name: 'Testing & CI/CD', cells: {
    gameday: '580+ tests. CI runs lint, types, migrations, tests and a production build against a real Postgres.',
    athena: '1,200+ tests, including Playwright end to end. Every push to main deploys the server.',
    superover: 'Five GitHub Actions workflows for TestFlight, the App Store, Google Play and the backend.',
    glazebot: 'A node:test suite with a mocked model, plus documented live acceptance checks.',
  } },
  { id: 'integrations', name: 'Third-party APIs', cells: {
    gameover: 'Spotify sign-in and in-browser playback through the Web Playback SDK, and audio from S3.',
    budget: 'Plaid Link, token exchange, re-authentication and transaction sync.',
    superover: 'Stripe wallets, Google Maps, and Apple and Google sign-in.',
    athena: 'Speech in and out through OpenAI audio models, and a Siri Shortcut that posts straight to the API.',
    gameday: 'Google Places for venue search, Resend for email, Upstash for rate limits.',
  } },
];

export function initCapabilities(matrix: HTMLElement, detail: HTMLElement, reduced: boolean) {
  const cols = PROJECTS.length;
  matrix.style.setProperty('--cols', String(cols));
  const head = `<div class="caps__corner"></div>` + PROJECTS.map((p) =>
    `<div class="caps__col" style="--pc:${p.color}" data-col="${p.id}"><span class="caps__coldot"></span><span class="caps__colname">${p.name}</span></div>`).join('');
  const body = ROWS.map((r, ri) => {
    const n = Object.keys(r.cells).length;
    const cells = PROJECTS.map((p, ci) => {
      const lit = r.cells[p.id];
      const d = ((ri + ci) * 0.06).toFixed(2);
      return lit
        ? `<button type="button" class="caps__cell is-lit" style="--pc:${p.color};--d:${d}s" data-row="${r.id}" data-col="${p.id}" aria-label="${r.name} at ${p.name}"><i></i></button>`
        : `<span class="caps__cell" data-row="${r.id}" aria-hidden="true"><i></i></span>`;
    }).join('');
    return `<button type="button" class="caps__row" data-row="${r.id}"><span class="caps__rowname">${r.name}</span><span class="caps__rowcount mono">${n}</span></button>${cells}`;
  }).join('');
  matrix.innerHTML = head + body;

  const rowById = new Map(ROWS.map((r) => [r.id, r]));
  const projById = new Map(PROJECTS.map((p) => [p.id, p]));
  let pinned: { row: string; col?: string } = { row: 'payments' };

  function show(row: string, col?: string) {
    const r = rowById.get(row)!;
    matrix.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
      el.classList.toggle('is-row', el.dataset.row === row);
      el.classList.toggle('is-focus', !!col && el.dataset.row === row && el.dataset.col === col);
    });
    const entries = Object.entries(r.cells).sort(([a], [b]) => (a === col ? -1 : b === col ? 1 : 0));
    detail.innerHTML = `
      <p class="caps__dk mono">${r.name} · ${entries.length} project${entries.length > 1 ? 's' : ''}</p>
      <ul class="caps__ev">${entries.map(([pid, text]) => {
        const p = projById.get(pid)!;
        return `<li class="${pid === col ? 'is-focus' : ''}" style="--pc:${p.color}"><span class="caps__evname"><i></i>${p.name}<em class="mono">${p.note}</em></span><span class="caps__evtext">${text}</span></li>`;
      }).join('')}</ul>`;
    if (!reduced) gsap.fromTo(detail.querySelectorAll('li'), { opacity: 0, x: 8 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.05, ease: 'power3.out' });
  }

  matrix.querySelectorAll<HTMLElement>('.caps__cell.is-lit, .caps__row').forEach((el) => {
    const pick = () => show(el.dataset.row!, el.dataset.col);
    el.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType === 'mouse') pick(); });
    el.addEventListener('focus', pick);
    el.addEventListener('click', () => {
      pinned = { row: el.dataset.row!, col: el.dataset.col };
      pick();
      // On a phone the detail sits below the grid; bring it into view.
      const r = detail.getBoundingClientRect();
      if (r.top > window.innerHeight - 80) detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    });
  });
  matrix.addEventListener('pointerleave', () => show(pinned.row, pinned.col));
  show(pinned.row);

  // Light the grid in a diagonal sweep the first time it is on screen. This is a CSS
  // animation on `scale` with a per-cell delay: a GSAP stagger on `transform` fought the
  // dots' hover transition and left most of them stuck at scale(0), i.e. invisible.
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    matrix.classList.replace('is-pending', 'is-revealing');
  };
  if (!reduced && 'IntersectionObserver' in window) {
    matrix.classList.add('is-pending');
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); reveal(); } }, { threshold: 0.2 });
    io.observe(matrix);
  }

  return { reveal };
}
