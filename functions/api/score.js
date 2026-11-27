const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;

function weekId(t) {
  const d = new Date(t + 7 * 3600e3);
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const y = dt.getUTCFullYear();
  const w = Math.ceil(((dt - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}

async function pubHash(uid, env) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('je-avatar:' + uid + (env.SALT || '')));
  return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
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

  // bingkai & avatar diambil dari profil di server (bukan dari klien), jadi tidak bisa dipalsukan
  let f = -1, av = '', v = 0, sp = 0;
  try {
    const pr = JSON.parse((await env.RANK.get('u:' + uid)) || 'null');
    if (pr) {
      if (Number.isInteger(pr.eq) && Array.isArray(pr.own) && pr.own.includes(pr.eq)) f = pr.eq;
      if (pr.v > 0) { v = pr.v | 0; av = await pubHash(uid, env); }
      if (pr.sup) sp = 1;
    }
  } catch {}
  // status Juragan Eksklusif juga bisa tercatat lewat grant.js (binding SUPPORTERS)
  if (!sp && env.SUPPORTERS) { try { if (await env.SUPPORTERS.get('u:' + uid)) sp = 1; } catch {} }

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
    f, a: av, v, s: sp,
    g: sp ? num(b.g, 0, 4) : 0,
    w: sp ? num(b.w, 0, 3) : 0,
    t: now
  };
  await env.RANK.put(key, JSON.stringify(board), { expirationTtl: 14 * 86400 });
  return new Response(JSON.stringify({ ok: true, week: weekId(now) }), { headers: { 'Content-Type': 'application/json' } });
}
