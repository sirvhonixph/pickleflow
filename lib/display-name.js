/** True when name is a real display name, not email / player id placeholder. */
export function isRealPlayerName(name, emailOrId) {
  const n = (name ?? "").trim();
  if (!n) return false;
  const id = (emailOrId ?? "").trim().toLowerCase();
  if (n.toLowerCase() === id) return false;
  if (n.includes("@")) return false;
  return true;
}

export function resolveNameFromHistory(entries, playerId) {
  if (!playerId) return null;
  for (const entry of entries ?? []) {
    for (const p of [...(entry.teamA ?? []), ...(entry.teamB ?? [])]) {
      if (p.playerId === playerId && isRealPlayerName(p.name, playerId)) {
        return p.name.trim();
      }
    }
  }
  return null;
}

export function resolvePlayerDisplayName({
  playerId,
  userName,
  storeName,
  historyEntries,
}) {
  if (isRealPlayerName(userName, playerId)) return userName.trim();
  if (isRealPlayerName(storeName, playerId)) return storeName.trim();
  return resolveNameFromHistory(historyEntries, playerId);
}

export function getDisplayName(user, fallbackName) {
  if (!user) return fallbackName?.trim() || "Player";
  const playerId = user.email ?? user.id ?? "";
  const resolved = resolvePlayerDisplayName({
    playerId,
    userName: user.name,
    storeName: fallbackName,
    historyEntries: [],
  });
  if (resolved) return resolved;
  return "Player";
}
