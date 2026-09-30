// Four real request paths, traced from the code. Every hop is a real call (or a real
// cause and effect), every step names the file it lives in, and the safeguards and
// failure paths are the ones the code actually implements.
// Desktop coordinates are in a 1000×600 box; the phone layout is generated.

export type NodeKind = 'client' | 'server' | 'data' | 'service' | 'job';
export type Dir = 'up' | 'down' | 'left' | 'right';
/** `at` is the desktop position (1000×600); `tall` the phone position (460 wide, two columns at x 116 and 344). */
export type FlowNode = { id: string; label: string; sub: string; kind: NodeKind; at: [number, number]; tall: [number, number] };
export type FlowStep = {
  at: string;
  /** Where the signal starts, when it is not the previous step's node. Same as `at` = starts here. */
  from?: string;
  /** What travels along the hop: the call, event or query. */
  via?: string;
  title: string;
  body: string;
  tech: string[];
  file: string;
  /** A guarantee this step adds. */
  guard?: string;
  /** A failure the code handles at this step, drawn off the node. */
  reject?: { text: string; dir: Dir };
};
export type Flow = {
  id: string;
  project: string;
  name: string;
  color: string;
  nodes: FlowNode[];
  steps: FlowStep[];
  stats: [string, string][];
  /** Phone layout: hops ("from>to") that would cross a node go round the outside instead. */
  rails?: Record<string, 'left' | 'right'>;
};

export const KIND_LABEL: Record<NodeKind, string> = {
  client: 'App',
  server: 'Server',
  data: 'Data',
  service: 'Service',
  job: 'Scheduled',
};

export const FLOWS: Flow[] = [
  {
    id: 'superover',
    project: 'SuperOver',
    name: 'A player taps Join',
    color: '#1fd17a',
    rails: { 'push>app': 'left' },
    nodes: [
      { id: 'app', label: 'Flutter app', sub: 'iOS · Android', kind: 'client', at: [110, 300], tall: [116, 45] },
      { id: 'api', label: 'Express API', sub: 'Cloud Functions v2', kind: 'server', at: [480, 300], tall: [344, 165] },
      { id: 'stripe', label: 'Stripe', sub: 'PaymentIntents', kind: 'service', at: [880, 100], tall: [344, 45] },
      { id: 'db', label: 'Firestore', sub: 'games · payments', kind: 'data', at: [880, 300], tall: [116, 285] },
      { id: 'trigger', label: 'Trigger', sub: 'on game update', kind: 'job', at: [880, 500], tall: [344, 405] },
      { id: 'push', label: 'Push', sub: 'Firebase messaging', kind: 'service', at: [480, 500], tall: [116, 525] },
    ],
    steps: [
      { at: 'app', title: 'Check out', body: 'The app prices the spot for the player and any guests they bring, minus their credits.', tech: ['Flutter', 'Provider'], file: 'lib/pages/checkout_page.dart' },
      { at: 'api', via: 'POST /createPayment', title: 'Price it on the server', body: 'The API recomputes the amount from the game itself, so the phone never sets the price.', tech: ['Express', 'Cloud Functions v2'], file: 'controllers/create-payment-intent.ts', guard: 'Server-side price' },
      { at: 'stripe', via: 'PaymentIntent', title: 'Pay', body: 'The API opens a PaymentIntent for that amount. The app’s payment sheet confirms it with Apple Pay, Google Pay or a card, straight with Stripe.', tech: ['Stripe API', 'flutter_stripe'], file: 'lib/api/backend_api.dart', guard: 'Cards stay with Stripe' },
      { at: 'api', via: 'webhook', title: 'Verify Stripe’s signature', body: 'Stripe calls the API back. Its signature is checked against the raw request body before anything is trusted.', tech: ['express.raw', 'constructEvent'], file: 'controllers/stripe-webhook.ts', guard: 'Signed webhooks only', reject: { text: 'bad signature → 400', dir: 'up' } },
      { at: 'db', via: 'status: success', title: 'Record the payment', body: 'The verified result goes on the payment record. The webhook never touches the game itself.', tech: ['Firestore'], file: 'controllers/stripe-webhook.ts' },
      { at: 'api', from: 'app', via: 'POST /joinGame', title: 'Ask to join', body: 'The app polls until the payment reads success, then asks to join. The API checks the payment record first.', tech: ['backoff polling'], file: 'controllers/join-game.ts', guard: 'Paid before joining', reject: { text: 'not paid → 400', dir: 'down' } },
      { at: 'db', via: 'transaction', title: 'Seat the player', body: 'A Firestore transaction reads the game, rejects double joins and full games, then seats the player and their guests.', tech: ['runTransaction'], file: 'controllers/join-game.ts', guard: 'Atomic seat', reject: { text: 'full or already in → 400', dir: 'up' } },
      { at: 'trigger', via: 'onDocumentUpdated', title: 'React to the roster', body: 'When enough players are in, the game flips to confirmed and a Firestore trigger fires.', tech: ['Cloud Functions trigger'], file: 'triggers/game-status-trigger.ts' },
      { at: 'push', via: 'multicast', title: 'Tell everyone', body: '"Game confirmed" goes to every player with game updates on, in batches of 500. Dead tokens are cleaned up.', tech: ['FCM'], file: 'notifications/send-notification.ts' },
      { at: 'app', via: 'notification', title: 'Meet the team', body: 'The push opens the game, where the team chat is a live Firestore stream. A scheduled job reminds everyone two hours before the first ball.', tech: ['Firestore streams', 'onSchedule'], file: 'scheduled/game-reminders.ts' },
    ],
    stats: [['8', 'Cloud Functions in production'], ['19', 'API routes'], ['5', 'CI/CD workflows to TestFlight, App Store and Play']],
  },
  {
    id: 'gameday',
    project: 'GameDay',
    name: 'A player pays by e-transfer',
    color: '#ff4d6a',
    rails: { 'cron>mail': 'right' },
    nodes: [
      { id: 'player', label: 'Player', sub: 'any browser', kind: 'client', at: [110, 100], tall: [116, 45] },
      { id: 'app', label: 'Next.js app', sub: 'Server Actions', kind: 'server', at: [450, 100], tall: [344, 165] },
      { id: 'mail', label: 'Email', sub: 'Resend', kind: 'service', at: [830, 100], tall: [344, 45] },
      { id: 'pg', label: 'Postgres', sub: 'Neon · Drizzle', kind: 'data', at: [450, 320], tall: [116, 285] },
      { id: 'cron', label: 'Scheduled job', sub: 'Upstash QStash', kind: 'job', at: [450, 500], tall: [344, 405] },
      { id: 'inbox', label: 'Payments inbox', sub: 'IMAP', kind: 'service', at: [830, 500], tall: [344, 525] },
      { id: 'admin', label: 'Admin queue', sub: 'unmatched transfers', kind: 'client', at: [110, 500], tall: [116, 405] },
    ],
    steps: [
      { at: 'player', title: 'Book a spot', body: 'A player picks a session and chooses Interac e-transfer. No account needed.', tech: ['Next.js 16', 'React 19'], file: 'components/BookingFlow.tsx' },
      { at: 'app', via: 'Server Action', title: 'Validate and throttle', body: 'The booking is validated, and each IP gets five tries per ten minutes.', tech: ['zod', 'Upstash Ratelimit'], file: 'lib/actions/create-booking.ts', guard: 'Rate limited', reject: { text: 'too many → rate_limited', dir: 'up' } },
      { at: 'pg', via: 'transaction', title: 'Hold the seat', body: 'One transaction takes a lock, checks there is room, and holds the seat for 30 minutes under a unique 6-digit code.', tech: ['Drizzle', 'advisory lock', 'partial unique index'], file: 'lib/dal/bookings.ts', guard: 'Atomic hold', reject: { text: 'no room → session_full', dir: 'left' } },
      { at: 'mail', from: 'app', via: 'send', title: 'Send the instructions', body: 'The amount, the code and the deadline go on screen and by email.', tech: ['Resend'], file: 'lib/actions/create-booking.ts' },
      { at: 'cron', from: 'cron', title: 'Wake up', body: 'A QStash schedule calls the check every few minutes, with a daily Vercel Cron as backup. It only runs with the right secret, compared in constant time.', tech: ['Upstash QStash', 'Vercel Cron', 'timingSafeEqual'], file: 'api/cron/check-etransfers/route.ts', guard: 'Secret required', reject: { text: 'wrong secret → 401', dir: 'down' } },
      { at: 'inbox', via: 'IMAP', title: 'Read the payments inbox', body: 'Only mail from the bank’s domain that passes SPF and DKIM counts, and a message-ID ledger shared with the Stripe webhook handles each one once.', tech: ['imapflow', 'mailparser'], file: 'lib/imap/etransfer-mailbox.ts', guard: 'SPF + DKIM, once each', reject: { text: 'unverified sender → rejected', dir: 'up' } },
      { at: 'pg', from: 'cron', via: 'match', title: 'Match and mark paid', body: 'The job looks for a held booking with that code. The amount must match to the cent, and the booking flips to paid in one transaction.', tech: ['Drizzle', 'transaction'], file: 'lib/dal/etransfer.ts', guard: 'Exact amount' },
      { at: 'mail', from: 'cron', via: 'confirmation', title: 'Confirm it', body: 'A confirmation with a private link to manage the booking goes out. If sending fails, the failure is logged.', tech: ['Resend'], file: 'api/cron/check-etransfers/route.ts' },
      { at: 'admin', from: 'pg', via: 'unmatched', title: 'Humans handle the rest', body: 'Every email is logged. Anything that didn’t match waits in an admin queue to match by hand, dismiss or override.', tech: ['NextAuth', 'allowlist'], file: 'app/admin/unmatched/page.tsx' },
    ],
    stats: [['580+', 'tests, run in CI against a real Postgres'], ['3', 'scheduled jobs, each with a health check'], ['1', 'dedup table shared by Stripe and e-transfers']],
  },
  {
    id: 'athena',
    project: 'Athena',
    name: 'The 6 AM brief',
    color: '#b9a6ff',
    nodes: [
      { id: 'orch', label: 'Orchestrator', sub: 'Node on Railway', kind: 'server', at: [440, 280], tall: [116, 165] },
      { id: 'mem', label: 'Memory', sub: 'Postgres', kind: 'data', at: [820, 90], tall: [344, 45] },
      { id: 'gameday', label: 'GameDay DB', sub: 'SELECT only', kind: 'data', at: [820, 280], tall: [344, 165] },
      { id: 'claude', label: 'Claude Opus', sub: 'Anthropic API', kind: 'service', at: [820, 470], tall: [344, 285] },
      { id: 'push', label: 'Web push', sub: 'VAPID', kind: 'service', at: [440, 480], tall: [116, 285] },
      { id: 'phone', label: 'My phone', sub: 'installed web app', kind: 'client', at: [110, 480], tall: [116, 405] },
    ],
    steps: [
      { at: 'orch', title: 'Wake up at six', body: 'A scheduler inside the orchestrator fires at 6:00 AM, Toronto time.', tech: ['node-cron', 'Railway'], file: 'orchestrator/src/jobs.ts' },
      { at: 'mem', via: 'SQL', title: 'Pull the day', body: 'Open items ranked by rule (urgency, promises to people, deadlines), plus today’s events, goals, this week’s focus and the weather.', tech: ['Postgres', 'Open-Meteo'], file: 'brief/compose.ts', guard: 'Ranked by rules, not a model' },
      { at: 'gameday', from: 'orch', via: 'SELECT', title: 'Check the business', body: 'Two read-only queries find unpaid bookings and sessions below break-even.', tech: ['pg pool'], file: 'business/neon.ts', reject: { text: 'unreachable → noted once', dir: 'up' } },
      { at: 'claude', from: 'orch', via: 'messages.create', title: 'Write it', body: 'Claude Opus writes the brief from that context, with my standing preferences in the system prompt.', tech: ['Anthropic API'], file: 'model/anthropic.ts', guard: 'Cost logged on every call' },
      { at: 'orch', via: 'brief', title: 'Check the draft', body: 'The draft comes back, and the week’s focus is added if the model left it out.', tech: ['TypeScript'], file: 'brief/compose.ts' },
      { at: 'mem', via: 'insert', title: 'Remember it', body: 'The brief is saved, and the items it mentioned are marked as shown so they fade next time.', tech: ['Postgres'], file: 'brief/compose.ts' },
      { at: 'push', from: 'orch', via: 'web-push', title: 'Deliver', body: 'A push goes to every subscribed device.', tech: ['web-push'], file: 'push/webpush.ts', reject: { text: 'dead subscription → removed', dir: 'down' } },
      { at: 'phone', via: 'notification', title: 'Read it', body: 'Tapping the notification opens the app, which fetches today’s brief.', tech: ['service worker', 'React 19'], file: 'web/src/sheets/Brief.tsx' },
    ],
    stats: [['36', 'tools the assistant can call'], ['9¢ → 0.4¢', 'per chat exchange, measured in production'], ['1,200+', 'tests, including Playwright end to end']],
  },
  {
    id: 'budget',
    project: 'Budget',
    name: 'A bank transaction syncs',
    color: '#f2c879',
    nodes: [
      { id: 'plaid', label: 'Bank', sub: 'via Plaid', kind: 'service', at: [110, 190], tall: [116, 45] },
      { id: 'fn', label: 'Edge Function', sub: 'Deno on Supabase', kind: 'server', at: [500, 190], tall: [344, 165] },
      { id: 'app', label: 'Web app', sub: 'React 19', kind: 'client', at: [880, 190], tall: [116, 525] },
      { id: 'pg', label: 'Postgres', sub: 'RLS on every table', kind: 'data', at: [500, 470], tall: [116, 285] },
      { id: 'rt', label: 'Realtime', sub: 'Supabase', kind: 'service', at: [880, 470], tall: [344, 405] },
    ],
    steps: [
      { at: 'plaid', title: 'The bank has news', body: 'Plaid calls my webhook when new transactions are ready.', tech: ['Plaid'], file: 'functions/plaid-webhook/index.ts' },
      { at: 'fn', via: 'webhook', title: 'Verify first', body: 'The webhook’s signed token is checked against Plaid’s key, and the body’s hash compared, before anything runs.', tech: ['Deno', 'jose ES256'], file: 'functions/plaid-webhook/index.ts', guard: 'Signed webhooks only', reject: { text: 'bad token → 401', dir: 'up' } },
      { at: 'plaid', via: '/transactions/sync', title: 'Ask for the changes', body: 'The function asks Plaid for everything new, changed or removed since the last cursor.', tech: ['transactionsSync'], file: '_shared/syncItem.ts' },
      { at: 'fn', via: 'pages', title: 'Clean it up', body: 'Merchant names lose their card-processor noise, my aliases apply, and category rules sort each new transaction. My own edits are never overwritten.', tech: ['TypeScript'], file: '_shared/categoryRules.ts', guard: 'My edits never overwritten' },
      { at: 'pg', via: 'upsert', title: 'Store it privately', body: 'Rows land behind row-level security and a trigger flags refunds. The cursor only moves after the writes commit.', tech: ['Postgres RLS', 'SQL trigger'], file: '_shared/syncItem.ts', guard: 'Row-level security' },
      { at: 'rt', via: 'changes', title: 'Go live', body: 'Realtime broadcasts the new rows, and the app batches bursts over 300 ms.', tech: ['Supabase Realtime'], file: 'lib/useRealtimeRefresh.ts' },
      { at: 'app', via: 'refresh', title: 'See it', body: 'The transaction appears in the inbox, already categorised.', tech: ['React 19'], file: 'routes/Inbox.tsx' },
      { at: 'pg', via: 'rpc: project()', title: 'Look ahead', body: 'A SQL projection engine turns history into monthly forecasts with p10 to p90 bands.', tech: ['SQL function'], file: 'migrations/0006_projection_engine.sql' },
    ],
    stats: [['28', 'tables, all behind row-level security'], ['30', 'SQL functions, including the forecast engine'], ['7', 'Edge Functions on Deno']],
  },
];
