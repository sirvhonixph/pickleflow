async function parseJson(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export async function fetchChatNotifications({ playerId, displayName, since = 0 }) {
  const params = new URLSearchParams({
    playerId,
    since: String(since),
  });
  if (displayName) params.set("displayName", displayName);

  return parseJson(
    await fetch(`/api/chat/notifications?${params}`, { cache: "no-store" })
  );
}

export function getActiveDmPartnerId() {
  if (typeof window === "undefined") return null;
  if (!window.location.pathname.startsWith("/messages")) return null;
  const withParam = new URLSearchParams(window.location.search).get("with");
  return withParam ? decodeURIComponent(withParam).trim().toLowerCase() : null;
}
