import fs from "fs/promises";
import path from "path";
import { normalizeEvent } from "@/lib/event-normalize";
import {
  refreshTournamentStandings,
  tournamentEventNeedsPersistRepair,
} from "@/lib/tournament-setup";
import { isValidCategory } from "@/lib/player-category";

const STORE_PATH = path.join(process.cwd(), "data", "pickleflow-store.json");

function emptyStore() {
  return {
    events: [],
    players: [],
    globalChatMessages: [],
    directMessages: [],
  };
}

function normalizeStore(parsed) {
  const events = (parsed.events ?? [])
    .filter(Boolean)
    .map(normalizeEvent);
  return {
    events,
    players: parsed.players ?? [],
    globalChatMessages: parsed.globalChatMessages ?? [],
    directMessages: parsed.directMessages ?? [],
  };
}

/** Flatten split-store (post-deploy) back into one local JSON file. */
function consolidateSplitStore(parsed) {
  if (!parsed || typeof parsed !== "object") return emptyStore();

  if (Array.isArray(parsed.events) && parsed.events.length > 0) {
    const { storeVersion: _sv, eventIds: _ids, ...rest } = parsed;
    return normalizeStore(rest);
  }

  if (parsed.storeVersion && Array.isArray(parsed.eventIds)) {
    return {
      events: [],
      players: parsed.players ?? [],
      globalChatMessages: parsed.globalChatMessages ?? [],
      directMessages: parsed.directMessages ?? [],
    };
  }

  return normalizeStore(parsed);
}

async function readStoreFileRaw() {
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function readStoreRaw() {
  try {
    const parsed = await readStoreFileRaw();
    return consolidateSplitStore(parsed);
  } catch {
    return emptyStore();
  }
}

async function writeStoreRaw(store) {
  const payload = {
    events: store.events ?? [],
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
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
  if (event?.status === "ended") return event;
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
  return readStoreRaw();
}

export async function writeStore(store) {
  await writeStoreRaw(store);
}

export async function getAllEvents() {
  const store = await readStoreRaw();
  return store.events;
}

export async function getEventById(id, { refresh = true, persistRepair = true } = {}) {
  try {
    const store = await readStoreRaw();
    const index = store.events.findIndex((e) => e.id === id);
    if (index < 0) return null;

    const normalized = normalizeEvent(store.events[index]);
    if (!refresh) return normalized;

    const refreshed = refreshTournamentIfNeeded(normalized);
    if (
      persistRepair &&
      normalized.status !== "ended" &&
      tournamentEventNeedsPersistRepair(normalized, refreshed)
    ) {
      store.events[index] = refreshed;
      await writeStoreRaw(store);
    } else if (
      persistRepair &&
      tournamentSnapshot(refreshed) !== tournamentSnapshot(normalized)
    ) {
      store.events[index] = refreshed;
      await writeStoreRaw(store);
    }
    return refreshed;
  } catch (err) {
    console.error("getEventById failed:", id, err);
    return null;
  }
}

export async function saveEventRecord(record) {
  const store = await readStoreRaw();
  const normalized = refreshTournamentIfNeeded(normalizeEvent(record));
  store.events.push(normalized);
  await writeStoreRaw(store);
  return normalized;
}

export async function updateEventRecord(
  id,
  updater,
  { refreshTournament = true } = {}
) {
  const store = await readStoreRaw();
  const index = store.events.findIndex((e) => e.id === id);
  if (index < 0) return null;

  let current = normalizeEvent(store.events[index]);
  if (refreshTournament) {
    current = refreshTournamentIfNeeded(current);
  }

  const raw =
    typeof updater === "function" ? updater(current) : { ...current, ...updater };
  let next = normalizeEvent(raw);
  if (current.status === "ended") {
    next = {
      ...next,
      status: "ended",
      endedAt: next.endedAt ?? current.endedAt ?? null,
      tournamentPhase:
        next.tournamentPhase === "ended" ? "ended" : current.tournamentPhase,
    };
  }
  if (refreshTournament) {
    next = refreshTournamentIfNeeded(next);
  }

  store.events[index] = next;
  await writeStoreRaw(store);
  return next;
}

export async function deleteEventRecord(id, { requireEnded = true } = {}) {
  const store = await readStoreRaw();
  const index = store.events.findIndex((e) => e.id === id);
  if (index < 0) return null;

  const event = normalizeEvent(store.events[index]);
  if (requireEnded && event.status !== "ended") {
    throw new Error("Only ended events can be removed from history.");
  }

  store.events.splice(index, 1);
  await writeStoreRaw(store);
  return event;
}

export async function deleteEndedEvents({ hostId } = {}) {
  const store = await readStoreRaw();
  const removed = [];
  store.events = store.events.filter((e) => {
    const normalized = normalizeEvent(e);
    if (
      normalized.status === "ended" &&
      (!hostId || normalized.hostId === hostId)
    ) {
      removed.push(normalized);
      return false;
    }
    return true;
  });
  await writeStoreRaw(store);
  return { removed, events: store.events.map(normalizeEvent) };
}

export async function upsertPlayer(player) {
  const store = await readStoreRaw();
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
      ...(player.category !== undefined
        ? {
            category: isValidCategory(player.category)
              ? player.category
              : prev.category ?? "",
          }
        : {}),
      ...(player.dupr !== undefined ? { dupr: player.dupr } : {}),
      ...(player.avatarDataUrl !== undefined
        ? { avatarDataUrl: player.avatarDataUrl }
        : {}),
      ...(player.registeredAt !== undefined
        ? { registeredAt: player.registeredAt }
        : {}),
    };
    await writeStoreRaw(store);
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
  await writeStoreRaw(store);
  return row;
}

export async function getPlayerByEmail(email) {
  const id = (email ?? "").trim().toLowerCase();
  if (!id) return null;
  const store = await readStoreRaw();
  return store.players.find((p) => p.email === id) ?? null;
}

export async function searchPlayers(query, limit = 30) {
  const store = await readStoreRaw();
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
  const store = await readStoreRaw();
  return (store.globalChatMessages ?? []).slice(-limit);
}

export async function addGlobalChatMessage(message) {
  const store = await readStoreRaw();
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
  await writeStoreRaw(store);
  return row;
}

export async function getDirectMessages(playerId, withPlayerId, limit = 100) {
  const a = (playerId ?? "").trim().toLowerCase();
  const b = (withPlayerId ?? "").trim().toLowerCase();
  if (!a || !b) return [];
  const store = await readStoreRaw();
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
  const store = await readStoreRaw();
  return (store.directMessages ?? [])
    .filter((m) => m.fromId === id || m.toId === id)
    .slice(-limit);
}

export async function getMessageInbox(playerId, limit = 50) {
  const id = (playerId ?? "").trim().toLowerCase();
  if (!id) return [];

  const store = await readStoreRaw();
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
  const store = await readStoreRaw();
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
  await writeStoreRaw(store);
  return row;
}

export async function importEvents(events) {
  const store = await readStoreRaw();
  const existingIds = new Set(store.events.map((e) => e.id));
  for (const ev of events) {
    const normalized = refreshTournamentIfNeeded(normalizeEvent(ev));
    if (!existingIds.has(normalized.id)) {
      store.events.push(normalized);
      existingIds.add(normalized.id);
    }
  }
  await writeStoreRaw(store);
  return store.events.map(normalizeEvent);
}
