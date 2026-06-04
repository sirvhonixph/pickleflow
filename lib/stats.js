async function parseJson(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export async function fetchLeaderboard(eventId = null) {
  const q = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
  return parseJson(await fetch(`/api/stats/leaderboard${q}`, { cache: "no-store" }));
}

export async function fetchPlayerStats(playerId, eventId = null) {
  const params = new URLSearchParams({ playerId });
  if (eventId) params.set("eventId", eventId);
  return parseJson(
    await fetch(`/api/stats/player?${params}`, { cache: "no-store" })
  );
}
