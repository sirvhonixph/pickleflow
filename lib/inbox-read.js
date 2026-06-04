import { notifyInboxUpdate } from "@/lib/inbox-events";

const READ_KEY = "pickleflow_inbox_read";

function readMap() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getInboxReadAt(partnerId) {
  if (!partnerId) return 0;
  return readMap()[partnerId.trim().toLowerCase()] ?? 0;
}

export function markInboxRead(partnerId, at = Date.now()) {
  if (typeof window === "undefined" || !partnerId) return;
  const id = partnerId.trim().toLowerCase();
  const map = readMap();
  map[id] = at;
  localStorage.setItem(READ_KEY, JSON.stringify(map));
  notifyInboxUpdate();
}

export function isThreadUnread(thread, myId) {
  if (!thread || thread.lastFromId === myId) return false;
  return thread.lastAt > getInboxReadAt(thread.playerId);
}

export function formatInboxTime(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
