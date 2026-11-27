const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;

function weekId(t) {
  const d = new Date(t + 7 * 3600e3);
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const y = dt.getUTCFullYear();
  const w = Math.ceil(((dt - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}

const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, n);
const num = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0; };

export async function onRequestPost({ request, env }) {
  if (!env.RANK) return new Response('not configured', { status: 500 });
  let b;
  try { b = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const uid = String(b.uid || '').toUpperCase();
  if (!UID.test(uid)) return new Response('bad uid', { status: 400 });
  const name = clean(b.name, 20);
  if (name.length < 3) return new Response('bad name', { status: 400 });

  const now = Date.now();
  const key = 'b:' + weekId(now);
  const board = JSON.parse((await env.RANK.get(key)) || '{}');
  const old = board[uid];
  if (old && now - old.t < 20000) return new Response('too fast', { status: 429 });
  if (!old && Object.keys(board).length >= 3000) return new Response('full', { status: 503 });

  const hrs = old ? Math.max(1, (now - old.t) / 36e5) : 1;
  const p = num(b.p, -1e12, 1e12);
  const k = num(b.k, 0, 1e6);
  const l = num(b.l, 1, 200);
  const r = num(b.r, 0, 100);

  board[uid] = {
    n: name,
    c: clean(b.co, 24),
    p: old ? Math.min(p, old.p + 2e9 * hrs) : Math.min(p, 5e9),
    k: old ? Math.min(Math.max(k, old.k), old.k + 2000 * hrs) : Math.min(k, 5000),
    l: old ? Math.min(Math.max(l, old.l), old.l + 5) : l,
    r,
    t: now
  };
  await env.RANK.put(key, JSON.stringify(board), { expirationTtl: 14 * 86400 });
  return new Response(JSON.stringify({ ok: true, week: weekId(now) }), { headers: { 'Content-Type': 'application/json' } });
}
