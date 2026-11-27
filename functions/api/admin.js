// Buat kode klaim: {key, act:'code', gem, n?, uid?} -> {codes:[...]} (berlaku 90 hari, sekali pakai)
// Beri status Juragan Eksklusif langsung: {key, uid, sup:true, gem:0}
// POST /api/admin {key, uid, gem}  -> tambah (atau kurangi, pakai angka negatif) diamond pemain.
// Wajib set secret ADMIN_KEY di Cloudflare Pages (Settings > Variables and Secrets).
// Contoh: curl -X POST https://domainmu/api/admin -H "Content-Type: application/json" \
//         -d '{"key":"RAHASIA","uid":"JE-ABC234","gem":120}'
const UID = /^JE-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/;
const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mkCode = () => { const b = crypto.getRandomValues(new Uint8Array(8)); let s = ''; for (const x of b) s += AL[x & 31]; return 'JK-' + s.slice(0, 4) + '-' + s.slice(4); };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.RANK || !env.ADMIN_KEY) return J({ err: 'not configured' }, 500);
  let b;
  try { b = await request.json(); } catch { return J({ err: 'bad json' }, 400); }
  if (String(b.key || '') !== env.ADMIN_KEY) return J({ err: 'forbidden' }, 403);
  if (b.act === 'code') {
    // buat kode klaim: {key, act:'code', gem:120, n:1, uid?:'JE-XXXXXX'}
    const sup = b.sup === true;
    const gem = Math.round(Number(b.gem) || 0), n = Math.min(20, Math.max(1, Math.round(Number(b.n) || 1)));
    if (!Number.isFinite(gem) || gem < (sup ? 0 : 1) || gem > 100000) return J({ err: 'bad gem' }, 400);
    const bind = b.uid ? String(b.uid).toUpperCase() : '';
    if (bind && !UID.test(bind)) return J({ err: 'bad uid' }, 400);
    const codes = [];
    for (let i = 0; i < n; i++) {
      const c = mkCode();
      await env.RANK.put('c:' + c, JSON.stringify({ gem, sup, uid: bind, t: Date.now(), used: 0 }), { expirationTtl: 90 * 86400 });
      codes.push(c);
    }
    return J({ ok: true, gem, sup, codes });
  }
  const uid = String(b.uid || '').toUpperCase();
  if (!UID.test(uid)) return J({ err: 'bad uid' }, 400);
  const n = Math.round(Number(b.gem) || 0);
  const wantSup = b.sup === true;
  if (!Number.isFinite(n) || Math.abs(n) > 100000) return J({ err: 'bad gem' }, 400);
  let o = {};
  try { o = JSON.parse((await env.RANK.get('u:' + uid)) || '{}') || {}; } catch {}
  o.gem = Math.max(0, Math.round(+o.gem || 0) + n);
  if (wantSup) o.sup = 1;
  if (!Array.isArray(o.own)) o.own = [];
  if (!Number.isInteger(o.eq)) o.eq = -1;
  await env.RANK.put('u:' + uid, JSON.stringify(o));
  return J({ ok: true, uid, gem: o.gem });
}
