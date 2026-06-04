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

/** Save player row in PickleFlow store (required for login after Supabase auth). */
export async function upsertPlayerProfile(profile) {
  const email = (profile.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Email required.");

  const data = await parseJson(
    await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: profile.name ?? email,
        category: profile.category ?? "",
        dupr: profile.dupr ?? "",
        registeredAt: profile.registeredAt ?? Date.now(),
      }),
    })
  );
  return data.player;
}

/**
 * Load player from store, or create from Supabase session if auth exists but store row is missing.
 */
export async function ensureRegisteredPlayer(email, { supabase } = {}) {
  const normalized = (email ?? "").trim().toLowerCase();
  try {
    return await fetchRegisteredPlayer(normalized);
  } catch (err) {
    if (err.code !== "NOT_REGISTERED") throw err;
  }

  let name = normalized;
  let category = "";
  let dupr = "";

  if (supabase) {
    const { data: authData } = await supabase.auth.getUser();
    const meta = authData?.user?.user_metadata ?? {};
    const full = `${meta.first_name ?? ""} ${meta.last_name ?? ""}`.trim();
    if (full) name = full;
    if (meta.category) category = meta.category;
    if (meta.dupr_id) dupr = meta.dupr_id;

    const { data: row } = await supabase
      .from("profiles")
      .select("first_name, last_name, category, dupr_id")
      .eq("email", normalized)
      .maybeSingle();

    if (row) {
      const fromProfile = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      if (fromProfile) name = fromProfile;
      if (row.category) category = row.category;
      if (row.dupr_id) dupr = row.dupr_id;
    }
  }

  return upsertPlayerProfile({
    email: normalized,
    name,
    category,
    dupr,
  });
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
