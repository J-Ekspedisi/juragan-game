// Cloud Save: POST /api/cloud
//   {act:'save', uid, key, slot, data, t, base, force, m} -> {ok, srv}
//   {act:'list', uid, key}                                -> {slots:[{slot,t,srv,m}]}
//   {act:'load', uid, key, slot}                          -> {data, t, srv, m}
// Data di KV RANK: 'cs:<uid>:<slot>' (isi save, metadata kecil), 'ck:<uid>' (hash kode pemulihan).
// Kode pemulihan dibuat di HP pemain dan hanya disimpan server dalam bentuk hash.
const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;
const KEY = /^[A-Z2-9]{12}$/;
const MAXLEN = 6000000;       // batas ukuran data (karakter)
const MAX_FAIL = 10;          // percobaan kode salah per IP per 10 menit
const TTL = 400 * 86400;      // simpanan disegarkan tiap upload
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, n);

async function hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.RANK) return J({ err: 'not configured' }, 500);
  let b;
  try { b = await request.json(); } catch { return J({ err: 'bad json' }, 400); }

  const act = String(b.act || '');
  if (!['save', 'list', 'load'].includes(act)) return J({ err: 'bad act' }, 400);
  const uid = String(b.uid || '').toUpperCase();
  if (!UID.test(uid)) return J({ err: 'bad uid' }, 400);
  const key = String(b.key || '').toUpperCase();
  if (!KEY.test(key)) return J({ err: 'bad key' }, 400);

  // batas percobaan salah
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  const rk = 'rc:' + ip;
  let fails = 0;
  try { fails = parseInt((await env.RANK.get(rk)) || '0', 10) || 0; } catch {}
  if (fails >= MAX_FAIL) return J({ err: 'limit' }, 429);
  const fail = async (err, status) => {
    try { await env.RANK.put(rk, String(fails + 1), { expirationTtl: 600 }); } catch {}
    return J({ err }, status);
  };

  // cek kode pemulihan (pertama kali menyimpan = mendaftarkan kode)
  const h = await hex('je-cloud:' + uid + ':' + key + (env.SALT || ''));
  const stored = await env.RANK.get('ck:' + uid);
  if (!stored) {
    if (act !== 'save') return fail('forbidden', 403);
    await env.RANK.put('ck:' + uid, h);
  } else if (!safeEq(stored, h)) {
    return fail('forbidden', 403);
  }

  if (act === 'list') {
    const l = await env.RANK.list({ prefix: 'cs:' + uid + ':' });
    const slots = (l.keys || []).map(k => ({ slot: +k.name.split(':')[2], ...(k.metadata || {}) })).filter(s => s.slot >= 1 && s.slot <= 3);
    return J({ ok: true, slots });
  }

  const slot = Math.round(Number(b.slot));
  if (!(slot >= 1 && slot <= 3)) return J({ err: 'bad slot' }, 400);
  const dk = 'cs:' + uid + ':' + slot;

  if (act === 'load') {
    const r = await env.RANK.getWithMetadata(dk);
    if (!r || r.value == null) return J({ err: 'empty' }, 404);
    const m = r.metadata || {};
    return J({ ok: true, data: r.value, t: m.t || 0, srv: m.srv || 0, m: m.m || {} });
  }

  // save
  const data = String(b.data || '');
  if (!/^(gz|raw):/.test(data)) return J({ err: 'bad data' }, 400);
  if (data.length > MAXLEN) return J({ err: 'too big' }, 413);
  const t = Math.round(Number(b.t)) || Date.now();
  const force = b.force === true;
  const base = Math.round(Number(b.base)) || 0;
  const cur = await env.RANK.getWithMetadata(dk);
  const cm = cur && cur.value != null ? (cur.metadata || {}) : null;
  const now = Date.now();
  if (cm && !force) {
    if (now - (cm.srv || 0) < 15000) return J({ err: 'too fast' }, 429);
    if (base !== (cm.srv || 0)) return J({ err: 'conflict', srv: cm.srv || 0, t: cm.t || 0 }, 409);
  }
  const m = b.m && typeof b.m === 'object' ? b.m : {};
  const meta = { srv: now, t, m: { n: clean(m.n, 30), o: clean(m.o, 30), c: Math.round(Number(m.c)) || 0, l: Math.round(Number(m.l)) || 0 } };
  await env.RANK.put(dk, data, { expirationTtl: TTL, metadata: meta });
  return J({ ok: true, srv: now });
}
