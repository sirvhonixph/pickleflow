import { getCurrentUser, getPlayerId, saveCurrentUser } from "@/lib/session";

async function parseJson(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function playerProfilePath(playerId) {
  return `/players/${encodeURIComponent(playerId)}`;
}

export async function fetchPlayers(query = "") {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return parseJson(await fetch(`/api/players${params}`, { cache: "no-store" }));
}

export async function fetchPlayerProfile(playerId) {
  return parseJson(
    await fetch(`/api/players/${encodeURIComponent(playerId)}`, {
      cache: "no-store",
    })
  );
}

/** True only if this email completed app registration (players store). */
export async function fetchRegisteredPlayer(email) {
  const id = (email ?? "").trim().toLowerCase();
  if (!id) return null;
  const res = await fetch(
    `/api/players/lookup?email=${encodeURIComponent(id)}`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? "No account found. Register first.");
    err.code = "NOT_REGISTERED";
    throw err;
  }
  return data.player;
}

export async function updateMyProfile(patch) {
  const user = getCurrentUser();
  const playerId = getPlayerId(user);
  if (!playerId) throw new Error("Log in to update your profile.");

  const data = await parseJson(
    await fetch("/api/players/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, ...patch }),
    })
  );

  saveCurrentUser({
    ...user,
    name: data.player.name ?? user.name,
    category: data.player.category ?? user.category,
    dupr: data.player.dupr ?? user.dupr,
    avatarDataUrl: data.player.avatarDataUrl ?? "",
  });

  return data.player;
}
