// PostHog: where visitors come from (down to the city), what they're on, which links brought
// them, and recordings of how they move through the page, on PostHog's free tier. Omer asked
// for it on 2026-10-13, for more detail than Vercel Web Analytics (main.ts), which stays for
// the basics and only goes down to the country.
//
// Everything goes through omerelammary.com/orbit, which vercel.json rewrites to PostHog's US
// servers, so the browser only ever talks to the site itself. Blockers that filter by domain
// let that through (PostHog's own advice); a path that says "analytics", "tracking" or PostHog's
// documented "/ingest" would be on their lists, hence the planet's word for it.
//
// It only runs on Omer's domain (not previews, localhost or the published artifact), and it
// loads as its own chunk once the page is idle, so nothing on screen waits for it.

/** The project's public token: it can send events, not read them, so it's meant to ship. */
const KEY = '';
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
        }),
      )
      .catch(() => undefined);
  if ('requestIdleCallback' in window) requestIdleCallback(() => void start(), { timeout: 4000 });
  else setTimeout(() => void start(), 2000);
}
