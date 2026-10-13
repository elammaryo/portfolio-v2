// @ts-check
// The ID that PostHog recognises a returning browser by (src/visitor.ts), handed out by the
// site's own server. Omer asked on 2026-10-13 to see when the same visitor keeps coming back
// over days or weeks.
//
// Why a server hands it out: Safari deletes everything a page's script stores, cookies
// included, after seven days of Safari use in which the visitor doesn't interact with the site,
// so an ID PostHog keeps for itself makes an iPhone that comes back after two weeks look like a
// new visitor. A cookie set in an HTTP response from the site itself isn't script storage, and
// Safari keeps it for as long as it asks. Fingerprinting was the other way, and was ruled out:
// Safari 26 is built to defeat it, and it's covert tracking. The ID is random and says nothing
// about anyone.
//
// The page calls this on a browser's first visit, and when Omer flips his switch (?me keeps that
// browser out of the counts, ?notme lets it back in); every other visit reads the cookie
// itself. The switch is a server-set cookie too, for the same Safari reason.
//
// JavaScript rather than TypeScript on purpose: the project's tsconfig.json is Vite's (noEmit,
// importing .ts), set up for the page rather than for compiling a function, and a .js function
// needs no compiling at all. The JSDoc types and @ts-check keep it type-checked anyway.

/** Browsers cap a cookie's life at about 400 days, so asking for more buys nothing. */
const LIFETIME = 400 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @param {string | null} header */
function readCookies(header) {
  /** @type {Map<string, string>} */
  const jar = new Map();
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return jar;
}

/**
 * @param {string} name
 * @param {string} value
 * @param {number} maxAge
 * @param {string} host
 */
function cookie(name, value, maxAge, host) {
  // On Omer's domain it's shared by omerelammary.com and www, as PostHog's own cookie is; on any
  // other host (a preview deployment) it stays with that host, since a browser drops a cookie
  // that names a domain the page isn't on.
  const domain = /(^|\.)omerelammary\.com$/.test(host) ? '; Domain=omerelammary.com' : '';
  // Not HttpOnly: the page reads the ID itself on every later visit.
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure${domain}`;
}

/** @param {Request} request */
export function GET(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('host') ?? url.hostname).split(':')[0].toLowerCase();
  const known = readCookies(request.headers.get('cookie')).get('orbit_id') ?? '';
  // Anything that isn't one of ours is replaced: a hand-edited cookie can't put arbitrary text
  // into PostHog as somebody's ID.
  const id = UUID.test(known) ? known : crypto.randomUUID();
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie('orbit_id', id, LIFETIME, host));
  if (url.searchParams.has('me')) headers.append('Set-Cookie', cookie('orbit_me', '1', LIFETIME, host));
  else if (url.searchParams.has('notme')) headers.append('Set-Cookie', cookie('orbit_me', '', 0, host));
  return Response.json({ id }, { headers });
}
