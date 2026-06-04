import fs from "fs/promises";
import path from "path";
import { head, put } from "@vercel/blob";
import { normalizeEvent } from "@/lib/event-normalize";
import { refreshTournamentStandings } from "@/lib/tournament-setup";
import { isValidCategory } from "@/lib/player-category";

const STORE_PATH = path.join(process.cwd(), "data", "pickleflow-store.json");
const BLOB_PATHNAME = "pickleflow-store.json";

function useBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function emptyStore() {
  return {
    events: [],
    players: [],
    globalChatMessages: [],
    directMessages: [],
  };
}

function normalizeStore(parsed) {
  return {
    events: (parsed.events ?? []).map(normalizeEvent),
    players: parsed.players ?? [],
    globalChatMessages: parsed.globalChatMessages ?? [],
    directMessages: parsed.directMessages ?? [],
  };
}

async function readStoreFileRaw() {
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function seedStoreFromFileIfPresent() {
  try {
    const parsed = await readStoreFileRaw();
    const store = normalizeStore(parsed);
    await writeStoreRaw(store);
    return store;
  } catch {
    return emptyStore();
  }
}

async function readStoreBlobRaw() {
  try {
    const meta = await head(BLOB_PATHNAME);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) throw new Error("Blob fetch failed");
    return JSON.parse(await res.text());
  } catch {
    return seedStoreFromFileIfPresent();
  }
}

async function writeStoreBlobRaw(store) {
  await put(BLOB_PATHNAME, JSON.stringify(store, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readStoreRaw() {
  if (useBlobStorage()) {
    return readStoreBlobRaw();
  }
  try {
    return normalizeStore(await readStoreFileRaw());
  } catch {
    return emptyStore();
  }
}

async function writeStoreRaw(store) {
  if (useBlobStorage()) {
    await writeStoreBlobRaw(store);
    return;
  }
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function tournamentSnapshot(event) {
  return JSON.stringify({
    knockouts: Object.fromEntries(
      Object.entries(event.tournamentDivisions ?? {}).map(([id, div]) => [
        id,
        div.knockout ?? null,
      ])
    ),
    activeDivisionId: event.activeDivisionId ?? null,
  });
}

function refreshTournamentIfNeeded(event) {
  if (
    event.type !== "tournament" ||
    Object.keys(event.tournamentDivisions ?? {}).length === 0
  ) {
    return event;
  }
  try {
    return refreshTournamentStandings(event);
  } catch (err) {
    console.error("refreshTournamentStandings failed:", err);
    return event;
  }
}

export async function readStore() {
  const raw = await readStoreRaw();
  return normalizeStore(raw);
}

export async function writeStore(store) {
  await writeStoreRaw({
    events: store.events ?? [],
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  });
}

export async function getAllEvents() {
  const store = await readStore();
  return store.events;
}

export async function getEventById(id) {
  try {
    const raw = await readStoreRaw();
    const index = (raw.events ?? []).findIndex((e) => e.id === id);
    if (index < 0) return null;

    const event = raw.events[index];
    const normalized = normalizeEvent(event);
    const refreshed = refreshTournamentIfNeeded(normalized);

    if (tournamentSnapshot(refreshed) !== tournamentSnapshot(normalized)) {
      raw.events[index] = refreshed;
      await writeStoreRaw(raw);
    }

    return refreshed;
  } catch {
    return null;
  }
}

export async function saveEventRecord(record) {
  const store = await readStore();
  const normalized = refreshTournamentIfNeeded(normalizeEvent(record));
  store.events.push(normalized);
  await writeStore(store);
  return normalized;
}

export async function updateEventRecord(id, updater) {
  const store = await readStore();
  const index = store.events.findIndex((e) => e.id === id);
  if (index < 0) return null;
  const current = refreshTournamentIfNeeded(normalizeEvent(store.events[index]));
  const raw =
    typeof updater === "function" ? updater(current) : { ...current, ...updater };
  const next = refreshTournamentIfNeeded(normalizeEvent(raw));
  store.events[index] = next;
  await writeStore(store);
  return next;
}

export async function deleteEventRecord(id, { requireEnded = true } = {}) {
  const store = await readStore();
  const index = store.events.findIndex((e) => e.id === id);
  if (index < 0) return null;

  const event = store.events[index];
  if (requireEnded && event.status !== "ended") {
    throw new Error("Only ended events can be removed from history.");
  }

  store.events.splice(index, 1);
  await writeStore(store);
  return normalizeEvent(event);
}

/** Remove ended events. When hostId is set, only that host's ended events. */
export async function deleteEndedEvents({ hostId } = {}) {
  const store = await readStore();
  const removed = [];

  store.events = (store.events ?? []).filter((e) => {
    if (e.status !== "ended") return true;
    if (hostId && e.hostId !== hostId) return true;
    removed.push(normalizeEvent(e));
    return false;
  });

  await writeStore(store);
  return { removed, events: store.events };
}

export async function upsertPlayer(player) {
  const store = await readStore();
  const email = (player.email ?? "").trim().toLowerCase();
  if (!email) return store.players;
  const idx = store.players.findIndex((p) => p.email === email);

  if (idx >= 0) {
    const prev = store.players[idx];
    store.players[idx] = {
      ...prev,
      email,
      ...(player.name !== undefined && player.name !== ""
        ? { name: player.name }
        : {}),
      ...(player.category !== undefined && player.category !== ""
        ? { category: player.category }
        : {}),
      ...(player.dupr !== undefined ? { dupr: player.dupr } : {}),
      ...(player.avatarDataUrl !== undefined
        ? { avatarDataUrl: player.avatarDataUrl }
        : {}),
      ...(player.registeredAt !== undefined
        ? { registeredAt: player.registeredAt }
        : {}),
    };
    await writeStore(store);
    return store.players[idx];
  }

  const row = {
    email,
    name: player.name ?? email,
    category: isValidCategory(player.category) ? player.category : "",
    dupr: player.dupr ?? "",
    registeredAt: player.registeredAt ?? Date.now(),
    avatarDataUrl: player.avatarDataUrl ?? "",
  };
  store.players.push(row);
  await writeStore(store);
  return row;
}

export async function getPlayerByEmail(email) {
  const id = (email ?? "").trim().toLowerCase();
  if (!id) return null;
  const store = await readStore();
  return store.players.find((p) => p.email === id) ?? null;
}

export async function searchPlayers(query, limit = 30) {
  const store = await readStore();
  const q = (query ?? "").trim().toLowerCase();
  if (!q) {
    return store.players.slice(0, limit);
  }
  return store.players
    .filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
    )
    .slice(0, limit);
}

export async function getGlobalChatMessages(limit = 80) {
  const store = await readStore();
  return (store.globalChatMessages ?? []).slice(-limit);
}

export async function addGlobalChatMessage(message) {
  const store = await readStore();
  const row = {
    id: `gchat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerId: message.playerId,
    playerName: message.playerName,
    avatarDataUrl: message.avatarDataUrl ?? "",
    text: (message.text ?? "").trim().slice(0, 500),
    createdAt: Date.now(),
  };
  if (!row.playerId || !row.text) {
    throw new Error("Message and player id required.");
  }
  store.globalChatMessages = [
    ...(store.globalChatMessages ?? []),
    row,
  ].slice(-200);
  await writeStore(store);
  return row;
}

export async function getDirectMessages(playerId, withPlayerId, limit = 100) {
  const a = (playerId ?? "").trim().toLowerCase();
  const b = (withPlayerId ?? "").trim().toLowerCase();
  if (!a || !b) return [];
  const store = await readStore();
  return (store.directMessages ?? [])
    .filter(
      (m) =>
        (m.fromId === a && m.toId === b) || (m.fromId === b && m.toId === a)
    )
    .slice(-limit);
}

export async function getDirectMessagesForPlayer(playerId, limit = 100) {
  const id = (playerId ?? "").trim().toLowerCase();
  if (!id) return [];
  const store = await readStore();
  return (store.directMessages ?? [])
    .filter((m) => m.fromId === id || m.toId === id)
    .slice(-limit);
}

export async function getMessageInbox(playerId, limit = 50) {
  const id = (playerId ?? "").trim().toLowerCase();
  if (!id) return [];

  const store = await readStore();
  const playerMap = new Map((store.players ?? []).map((p) => [p.email, p]));
  const threads = new Map();

  for (const m of store.directMessages ?? []) {
    if (m.fromId !== id && m.toId !== id) continue;

    const otherId = m.fromId === id ? m.toId : m.fromId;
    const prev = threads.get(otherId);
    if (!prev || m.createdAt > prev.lastAt) {
      const otherPlayer = playerMap.get(otherId);
      threads.set(otherId, {
        playerId: otherId,
        playerName:
          otherPlayer?.name ??
          (m.fromId === id ? m.toName : m.fromName) ??
          otherId,
        avatarDataUrl: otherPlayer?.avatarDataUrl ?? "",
        lastMessage: m.text,
        lastAt: m.createdAt,
        lastFromId: m.fromId,
        fromMe: m.fromId === id,
      });
    }
  }

  return Array.from(threads.values())
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, limit);
}

export async function addDirectMessage(message) {
  const store = await readStore();
  const fromId = (message.fromId ?? "").trim().toLowerCase();
  const toId = (message.toId ?? "").trim().toLowerCase();
  const text = (message.text ?? "").trim().slice(0, 500);
  if (!fromId || !toId || !text) {
    throw new Error("Sender, recipient, and message required.");
  }
  if (fromId === toId) {
    throw new Error("Cannot message yourself.");
  }
  const row = {
    id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromId,
    fromName: message.fromName ?? fromId,
    toId,
    toName: message.toName ?? toId,
    text,
    createdAt: Date.now(),
  };
  store.directMessages = [...(store.directMessages ?? []), row].slice(-1000);
  await writeStore(store);
  return row;
}

export async function importEvents(events) {
  const store = await readStore();
  const existingIds = new Set(store.events.map((e) => e.id));
  for (const ev of events) {
    const normalized = refreshTournamentIfNeeded(normalizeEvent(ev));
    if (!existingIds.has(normalized.id)) {
      store.events.push(normalized);
      existingIds.add(normalized.id);
    }
  }
  await writeStore(store);
  return store.events;
}
