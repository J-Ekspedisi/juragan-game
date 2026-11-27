// POST /api/redeem {uid, code} -> klaim kode buatan admin.js (sekali pakai).
// Kode disimpan di KV RANK dengan key 'c:JK-XXXX-XXXX'; profil pemain di 'u:JE-XXXXXX'.
const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;
const CODE = /^JK[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{8}$/;
const MAX_FAIL = 10; // percobaan gagal per IP per 10 menit
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.RANK) return J({ err: 'not configured' }, 500);
  let b;
  try { b = await request.json(); } catch { return J({ err: 'bad json' }, 400); }

  const uid = String(b.uid || '').toUpperCase();
  if (!UID.test(uid)) return J({ err: 'bad uid' }, 400);

  const raw = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!CODE.test(raw)) return J({ err: 'format' }, 400);
  const code = 'JK-' + raw.slice(2, 6) + '-' + raw.slice(6);

  // batas percobaan gagal
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  const rk = 'rl:' + ip;
  let fails = 0;
  try { fails = parseInt((await env.RANK.get(rk)) || '0', 10) || 0; } catch {}
  if (fails >= MAX_FAIL) return J({ err: 'limit' }, 429);
  const fail = async (err, status) => {
    try { await env.RANK.put(rk, String(fails + 1), { expirationTtl: 600 }); } catch {}
    return J({ err }, status);
  };

  let rec = null;
  try { rec = JSON.parse((await env.RANK.get('c:' + code)) || 'null'); } catch {}
  if (!rec) return fail('invalid', 404);
  if (rec.used) return fail('used', 409);
  if (rec.uid && rec.uid !== uid) return fail('invalid', 403);

  // tandai terpakai dulu, baru kreditkan
  rec.used = uid;
  rec.ut = Date.now();
  await env.RANK.put('c:' + code, JSON.stringify(rec), { expirationTtl: 90 * 86400 });

  let o = {};
  try { o = JSON.parse((await env.RANK.get('u:' + uid)) || '{}') || {}; } catch {}
  const add = Math.max(0, Math.round(+rec.gem || 0));
  o.gem = Math.max(0, Math.round(+o.gem || 0) + add);
  if (rec.sup) o.sup = 1;
  if (!Array.isArray(o.own)) o.own = [];
  if (!Number.isInteger(o.eq)) o.eq = -1;
  await env.RANK.put('u:' + uid, JSON.stringify(o));

  return J({ ok: true, added: add, sup: !!rec.sup, gem: o.gem, own: o.own, eq: o.eq, v: o.v || 0, h: o.h || '' });
}
