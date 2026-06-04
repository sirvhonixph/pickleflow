const USER_KEY = "pickleflow_demo_user";

export function getCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCurrentUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearCurrentUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

export function getPlayerId(user) {
  return user?.email ?? user?.id ?? "";
}

import { resolvePlayerDisplayName } from "@/lib/display-name";

export function getDisplayName(user) {
  if (!user) return "Player";
  const playerId = user.email ?? user.id ?? "";
  const resolved = resolvePlayerDisplayName({
    playerId,
    userName: user.name,
    storeName: null,
    historyEntries: [],
  });
  return resolved || "Player";
}

export function isEventHost(event, user) {
  if (!event || !user) return false;
  const id = getPlayerId(user);
  return event.hostId === id;
}
