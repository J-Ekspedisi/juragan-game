// GET  /api/reward?uid=JE-XXXXXX -> {week, pos, gem, claimed}  (hasil minggu LALU)
// POST /api/reward {uid}         -> kreditkan diamond sekali per pemain per minggu
const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;
const MIN_PLAYERS = 5;
const gemFor = pos => pos === 1 ? 50 : pos === 2 ? 30 : pos === 3 ? 20 : pos >= 4 && pos <= 10 ? 10 : 0;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function weekId(t) {
  const d = new Date(t + 7 * 3600e3);
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const y = dt.getUTCFullYear();
  const w = Math.ceil(((dt - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}

// posisi terbaik dari peringkat Laba atau Paket
async function result(env, uid) {
  const week = weekId(Date.now() - 7 * 864e5);
  const all = Object.entries(JSON.parse((await env.RANK.get('b:' + week)) || '{}'));
  let pos = 0;
  if (all.length >= MIN_PLAYERS) for (const f of ['p', 'k']) {
    const i = all.filter(e => e[1][f] > 0).sort((a, b) => b[1][f] - a[1][f]).findIndex(e => e[0] === uid);
    if (i >= 0 && (!pos || i + 1 < pos)) pos = i + 1;
  }
  const claimed = !!(await env.RANK.get('rw:' + week + ':' + uid));
  return { week, pos, gem: gemFor(pos), claimed };
}

export async function onRequestGet({ request, env }) {
  if (!env.RANK) return J({ err: 'not configured' }, 500);
  const uid = (new URL(request.url).searchParams.get('uid') || '').toUpperCase();
  if (!UID.test(uid)) return J({ err: 'bad uid' }, 400);
  return J(await result(env, uid));
}

export async function onRequestPost({ request, env }) {
  if (!env.RANK) return J({ err: 'not configured' }, 500);
  let b;
  try { b = await request.json(); } catch { return J({ err: 'bad json' }, 400); }
  const uid = String(b.uid || '').toUpperCase();
  if (!UID.test(uid)) return J({ err: 'bad uid' }, 400);
  const r = await result(env, uid);
  if (!r.gem) return J({ err: 'none' }, 403);
  if (r.claimed) return J({ err: 'claimed' }, 409);

  let o = {};
  try { o = JSON.parse((await env.RANK.get('u:' + uid)) || '{}') || {}; } catch {}
  // tandai dulu, baru kreditkan
  await env.RANK.put('rw:' + r.week + ':' + uid, '1', { expirationTtl: 30 * 86400 });
  o.gem = Math.max(0, Math.round(+o.gem || 0)) + r.gem;
  if (!Array.isArray(o.own)) o.own = [];
  if (!Number.isInteger(o.eq)) o.eq = -1;
  await env.RANK.put('u:' + uid, JSON.stringify(o));
  return J({ ok: true, added: r.gem, gem: o.gem });
}
