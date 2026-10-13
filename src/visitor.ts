// Who gets counted. The ID that ties a returning browser's visits together, and Omer's switch for
// keeping his own browsers out of the numbers, both live in cookies that the site's server sets
// (api/hello.ts says why Safari needs it that way). PostHog (posthog.ts) and Vercel Analytics
// (main.ts) read them through here.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const read = (name: string) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];

// omerelammary.com/?me marks this browser as Omer's; /?notme undoes it. The flag is read once and
// taken out of the address bar at once, so a link copied from there can't switch anyone else off.
// The rest of the query is kept as written (URLSearchParams would turn ?still into ?still=).
const parts = location.search.slice(1).split('&').filter(Boolean);
const has = (key: string) => parts.some((part) => part.split('=')[0] === key);
const flip = has('me') ? 'me' : has('notme') ? 'notme' : '';
if (flip) {
  const rest = parts.filter((part) => !['me', 'notme'].includes(part.split('=')[0])).join('&');
  history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
}

const counted = flip ? flip === 'notme' : read('orbit_me') !== '1';

/** False on a browser Omer has marked as his own: nothing it does is counted. */
export const isCounted = () => counted;

/**
 * This browser's visitor ID. On a later visit it's the cookie the server left; on the first
 * visit, or when the switch is flipped, it comes from the server, which sets the cookies. If the
 * server can't be reached there's none, and PostHog makes an ID of its own.
 */
export async function visitorId(): Promise<string | undefined> {
  const known = read('orbit_id');
  if (known && UUID.test(known) && !flip) return known;
  try {
    const res = await fetch(`/api/hello${flip ? `?${flip}` : ''}`, { cache: 'no-store' });
    const { id } = (await res.json()) as { id?: string };
    if (flip && res.ok) note(flip === 'me' ? 'This browser won’t be counted' : 'This browser counts again');
    return id && UUID.test(id) ? id : undefined;
  } catch {
    return known && UUID.test(known) ? known : undefined;
  }
}

/** Says the switch took. Only Omer ever sees this, and only right after flipping it. */
function note(text: string) {
  const el = document.createElement('p');
  el.className = 'visit-note';
  el.setAttribute('role', 'status');
  el.textContent = text;
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}
