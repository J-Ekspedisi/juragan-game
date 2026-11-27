// GET /api/avatar?h=<hash publik>&v=<versi>  -> gambar avatar (tanpa membuka ID pemain)
export async function onRequestGet({ request, env }) {
  if (!env.RANK) return new Response('not configured', { status: 500 });
  const h = new URL(request.url).searchParams.get('h') || '';
  if (!/^[0-9a-f]{16}$/.test(h)) return new Response('bad', { status: 400 });
  const d = await env.RANK.get('a:' + h);
  const m = d && d.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) return new Response('none', { status: 404 });
  const bin = atob(m[2]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Response(u8, { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
