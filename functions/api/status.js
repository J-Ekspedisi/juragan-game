
export async function onRequest(context) {
  const data = {
    status: "ok",
    game: "juragan-game",
    waktu: new Date().toISOString()
  };

  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
