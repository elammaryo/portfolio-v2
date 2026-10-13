// PostHog: where visitors come from (down to the city), what they're on, which links brought
// them, and recordings of how they move through the page, on PostHog's free tier. Omer asked
// for it on 2026-10-13, for more detail than Vercel Web Analytics (main.ts), which stays for
// the basics and only goes down to the country. It reports to his "Default project" on
// PostHog's US cloud (us.posthog.com/project/150186). Recordings are switched on in that
// project's settings, not here.
//
// Everything goes through omerelammary.com/orbit, which vercel.json rewrites to PostHog's US
// servers, so the browser only ever talks to the site itself. Blockers that filter by domain
// let that through (PostHog's own advice); a path that says "analytics", "tracking" or PostHog's
// documented "/ingest" would be on their lists, hence the planet's word for it.
//
// It only runs on Omer's domain (not previews, localhost or the published artifact), and it
// loads as its own chunk once the page is idle, so nothing on screen waits for it.
//
// Recordings mask every input by PostHog's default. A message sent to GlazeBot comes back as
// a chat bubble, which is text rather than an input, so glazebot.ts marks it `ph-mask` too.
// The planet, the sky and the GameOver wall are canvases, which recordings don't capture: in
// a replay those areas are empty, and that isn't a fault.

/** The project's public token: it can send events, not read them, so it's meant to ship. */
const KEY = 'phc_o6WVA5vK8SKsh4QiECzXDIyBJPb4xwKBZBFv6jLC8s9';
const LIVE = /(^|\.)omerelammary\.com$/.test(location.hostname);

export function initPostHog() {
  if (!KEY || !LIVE) return;
  const start = () =>
    import('posthog-js')
      .then(({ default: posthog }) =>
        posthog.init(KEY, {
          api_host: '/orbit',
          ui_host: 'https://us.posthog.com',
          defaults: '2026-08-30',
          // Visitors stay anonymous: no person profiles unless someone is identified, which
          // this site never does.
          person_profiles: 'identified_only',
          // The site asks visitors nothing. Without this the SDK fetches its 100 KB survey
          // script on every visit even when the project has no surveys.
          disable_surveys: true,
        }),
      )
      .catch(() => undefined);
  if ('requestIdleCallback' in window) requestIdleCallback(() => void start(), { timeout: 4000 });
  else setTimeout(() => void start(), 2000);
}
