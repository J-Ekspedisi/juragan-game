
const UID = /JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}/i;

async function hmacHex(key, text) {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function onRequestPost({ request, env }) {
  const sig = request.headers.get('saweria-callback-signature');
  if (!sig) return new Response('forbidden', { status: 403 });
  if (!env.STREAM_KEY) return new Response('not configured', { status: 500 });

  let d;
  try { d = await request.json(); } catch { return new Response('bad json', { status: 400 }); }

  const text = `${d.version}${d.id}${d.amount_raw}${d.donator_name}${d.donator_email}`;
  const expected = await hmacHex(env.STREAM_KEY, text);
  if (!safeEq(sig, expected)) return new Response('invalid signature', { status: 401 });

  if (d.type !== 'donation') return new Response('ignored');

  const m = String(d.message || '').match(UID);
  if (!m) return new Response('no uid');

  const uid = m[0].toUpperCase();
  await env.SUPPORTERS.put('u:' + uid, JSON.stringify({
    t: Date.now(), src: 'saweria', id: d.id, amount: d.amount_raw
  }));
  return new Response('granted');
}
