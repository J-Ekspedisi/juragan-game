function weekId(t) {
  const d = new Date(t + 7 * 3600e3);
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const y = dt.getUTCFullYear();
  const w = Math.ceil(((dt - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}

const SORT = {
  profit: (a, b) => b.p - a.p,
  pkgs: (a, b) => b.k - a.k,
  lvl: (a, b) => b.l - a.l || b.r - a.r
};

export async function onRequestGet({ request, env }) {
  if (!env.RANK) return new Response('not configured', { status: 500 });
  const uid = (new URL(request.url).searchParams.get('uid') || '').toUpperCase();
  const week = weekId(Date.now());
  const board = JSON.parse((await env.RANK.get('b:' + week)) || '{}');
  const all = Object.entries(board).map(([id, v]) => ({ id, ...v }));
  const out = { week, total: all.length, cats: {} };
  for (const c in SORT) {
    const sorted = [...all].sort(SORT[c]);
    const row = (e, i) => ({ pos: i + 1, n: e.n, c: e.c, p: e.p, k: e.k, l: e.l, r: e.r, me: e.id === uid });
    const mi = uid ? sorted.findIndex(e => e.id === uid) : -1;
    out.cats[c] = { top: sorted.slice(0, 20).map(row), me: mi >= 0 ? row(sorted[mi], mi) : null };
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
