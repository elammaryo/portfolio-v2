// api/hello.js, called the way Vercel calls it: a web Request in, a Response out.
// Run with: node scripts/test-hello.mjs (Node 20 or later; no dependencies).
import assert from 'node:assert/strict';
import { GET } from '../api/hello.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const call = async (path, { host = 'omerelammary.com', cookie } = {}) => {
  const headers = { host };
  if (cookie) headers.cookie = cookie;
  const res = GET(new Request(`https://${host}${path}`, { headers }));
  const body = await res.json();
  return { res, body, cookies: res.headers.getSetCookie() };
};

// 1. A first visit gets a fresh random ID, set for 400 days across omerelammary.com and www.
{
  const { res, body, cookies } = await call('/api/hello');
  assert.equal(res.status, 200);
  assert.match(body.id, UUID);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0], `orbit_id=${body.id}; Path=/; Max-Age=34560000; SameSite=Lax; Secure; Domain=omerelammary.com`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  console.log('first visit ok:', cookies[0]);
}
// 2. Two first visits never share an ID.
{
  const a = await call('/api/hello'), b = await call('/api/hello');
  assert.notEqual(a.body.id, b.body.id);
  console.log('distinct ids ok');
}
// 3. A browser that already has one keeps it (and the cookie is renewed).
{
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const { body, cookies } = await call('/api/hello', { cookie: `foo=bar; orbit_id=${id}; ph=1` });
  assert.equal(body.id, id);
  assert.ok(cookies[0].startsWith(`orbit_id=${id};`));
  console.log('known id kept ok');
}
// 4. A hand-edited or junk cookie is replaced, never passed on.
for (const junk of ['hello', 'DROP TABLE', '0F8FAD5B-D9CB-469F-A165-70867728950E;x', '']) {
  const { body } = await call('/api/hello', { cookie: `orbit_id=${junk}` });
  assert.match(body.id, UUID);
  assert.notEqual(body.id, junk);
}
console.log('junk replaced ok');
// 5. www shares the domain; a preview host keeps its cookie to itself.
{
  const www = await call('/api/hello', { host: 'www.omerelammary.com' });
  assert.ok(www.cookies[0].endsWith('; Domain=omerelammary.com'));
  const preview = await call('/api/hello', { host: 'portfolio-v2-abc.vercel.app' });
  assert.ok(!preview.cookies[0].includes('Domain='));
  const port = await call('/api/hello', { host: 'omerelammary.com:443' });
  assert.ok(port.cookies[0].endsWith('; Domain=omerelammary.com'));
  console.log('domains ok');
}
// 6. ?me sets the switch for 400 days; ?notme clears it; both keep the ID.
{
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const me = await call('/api/hello?me', { cookie: `orbit_id=${id}` });
  assert.equal(me.body.id, id);
  assert.equal(me.cookies.length, 2);
  assert.equal(me.cookies[1], 'orbit_me=1; Path=/; Max-Age=34560000; SameSite=Lax; Secure; Domain=omerelammary.com');
  const notme = await call('/api/hello?notme', { cookie: `orbit_id=${id}; orbit_me=1` });
  assert.equal(notme.body.id, id);
  assert.equal(notme.cookies[1], 'orbit_me=; Path=/; Max-Age=0; SameSite=Lax; Secure; Domain=omerelammary.com');
  const plain = await call('/api/hello', { cookie: `orbit_id=${id}; orbit_me=1` });
  assert.equal(plain.cookies.length, 1);
  console.log('switch ok');
}
console.log('ALL PASS');
