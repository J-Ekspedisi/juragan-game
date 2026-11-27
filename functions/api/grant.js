
const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('authorization') || '';
  if (!env.ADMIN_KEY || !safeEq(auth, 'Bearer ' + env.ADMIN_KEY)) return new Response('unauthorized', { status: 401 });
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const uid = String(body.uid || '').toUpperCase();
  if (!UID.test(uid)) return new Response('bad uid', { status: 400 });
  if (body.revoke) await env.SUPPORTERS.delete('u:' + uid);
  else await env.SUPPORTERS.put('u:' + uid, JSON.stringify({ t: Date.now(), src: 'manual' }));
  return new Response(body.revoke ? 'revoked' : 'granted');
}
