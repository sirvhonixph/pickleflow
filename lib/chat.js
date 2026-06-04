async function parseJson(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export async function fetchGlobalChat() {
  return parseJson(await fetch("/api/chat/global", { cache: "no-store" }));
}

export async function postGlobalChat({ playerId, playerName, avatarDataUrl, text }) {
  return parseJson(
    await fetch("/api/chat/global", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, playerName, avatarDataUrl, text }),
    })
  );
}

export async function fetchDirectMessages(withPlayerId, playerId) {
  const params = new URLSearchParams({ with: withPlayerId, playerId });
  return parseJson(
    await fetch(`/api/chat/direct?${params}`, { cache: "no-store" })
  );
}

export async function fetchMessageInbox(playerId) {
  const params = new URLSearchParams({ playerId });
  return parseJson(
    await fetch(`/api/chat/inbox?${params}`, { cache: "no-store" })
  );
}

export async function postDirectMessage({
  fromId,
  fromName,
  toId,
  toName,
  text,
}) {
  return parseJson(
    await fetch("/api/chat/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromId, fromName, toId, toName, text }),
    })
  );
}
