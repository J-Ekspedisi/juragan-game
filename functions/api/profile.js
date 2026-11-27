// GET  /api/profile?uid=JE-XXXXXX  -> {gem, own, eq, v, h}
// POST /api/profile {uid, act:'buy'|'eq'|'av'|'delav'|'cash'|'spend', i?, d?, k?}
// Data disimpan di KV binding RANK, kunci "u:<uid>". Avatar di "a:<hash publik>".
const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;
const PRICE = [500, 300, 150, 400, 800, 350, 250, 600, 450, 200]; // harus sama dengan FR di index.html
// paket uang game: [harga diamond, jumlah rupiah]. Harus sama dengan CP di index.html
const CASH = [[100, 5e8], [350, 2e9], [800, 5e9], [1500, 1e10], [6500, 5e10]];
// fitur premium: [kode] = harga diamond. Harus sama dengan PR di index.html
const SPEND = { ins: 80, shield: 60, speed: 40, grace: 50 };
const IMG = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+\/=]+$/;
const MAX_AV = 150000;

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function pub(uid, env) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('je-avatar:' + uid + (env.SALT || '')));
  return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function load(env, uid) {
  try {
    const o = JSON.parse((await env.RANK.get('u:' + uid)) || 'null');
    if (o) {
      const own = (Array.isArray(o.own) ? o.own : []).filter(i => Number.isInteger(i) && i >= 0 && i < PRICE.length);
      return { gem: Math.max(0, Math.round(+o.gem || 0)), own, eq: own.includes(o.eq) ? o.eq : -1, v: Math.max(0, o.v | 0), ta: o.ta || 0, sup: o.sup ? 1 : 0 };
    }
  } catch {}
  return { gem: 0, own: [], eq: -1, v: 0, ta: 0, sup: 0 };
}

const out = async (p, uid, env) => ({ gem: p.gem, own: p.own, eq: p.eq, v: p.v, h: p.v ? await pub(uid, env) : '', sup: !!p.sup });

export async function onRequestGet({ request, env }) {
  if (!env.RANK) return J({ err: 'not configured' }, 500);
  const uid = (new URL(request.url).searchParams.get('uid') || '').toUpperCase();
  if (!UID.test(uid)) return J({ err: 'bad uid' }, 400);
  return J(await out(await load(env, uid), uid, env));
}

export async function onRequestPost({ request, env }) {
  if (!env.RANK) return J({ err: 'not configured' }, 500);
  let b;
  try { b = await request.json(); } catch { return J({ err: 'bad json' }, 400); }
  const uid = String(b.uid || '').toUpperCase();
  if (!UID.test(uid)) return J({ err: 'bad uid' }, 400);
  const p = await load(env, uid);
  const now = Date.now();
  let grant = 0;

  if (b.act === 'buy') {
    const i = b.i;
    if (!Number.isInteger(i) || i < 0 || i >= PRICE.length) return J({ err: 'bad item' }, 400);
    if (p.own.includes(i)) return J({ err: 'owned' }, 409);
    if (p.gem < PRICE[i]) return J({ err: 'gem' }, 402);
    p.gem -= PRICE[i]; p.own.push(i); p.eq = i;
  } else if (b.act === 'eq') {
    const i = b.i;
    if (i !== -1 && !p.own.includes(i)) return J({ err: 'not owned' }, 403);
    p.eq = i;
  } else if (b.act === 'cash') {
    const i = b.i;
    if (!Number.isInteger(i) || i < 0 || i >= CASH.length) return J({ err: 'bad item' }, 400);
    if (p.gem < CASH[i][0]) return J({ err: 'gem' }, 402);
    p.gem -= CASH[i][0]; grant = CASH[i][1];
  } else if (b.act === 'spend') {
    const k = String(b.k || '');
    if (!Object.prototype.hasOwnProperty.call(SPEND, k)) return J({ err: 'bad item' }, 400);
    if (p.gem < SPEND[k]) return J({ err: 'gem' }, 402);
    p.gem -= SPEND[k];
  } else if (b.act === 'av') {
    const d = String(b.d || '');
    if (d.length > MAX_AV || !IMG.test(d)) return J({ err: 'bad image' }, 400);
    if (now - p.ta < 3000) return J({ err: 'too fast' }, 429);
    await env.RANK.put('a:' + await pub(uid, env), d);
    p.v = (p.v || 0) + 1; p.ta = now;
  } else if (b.act === 'delav') {
    await env.RANK.delete('a:' + await pub(uid, env));
    p.v = 0;
  } else return J({ err: 'bad act' }, 400);

  await env.RANK.put('u:' + uid, JSON.stringify(p));
  const res = await out(p, uid, env);
  if (grant) res.cash = grant;
  return J(res);
}
