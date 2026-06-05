import fs from "fs/promises";
import path from "path";
import { get, put } from "@vercel/blob";
import { normalizeEvent } from "@/lib/event-normalize";
import {
  refreshTournamentStandings,
  tournamentEventNeedsPersistRepair,
} from "@/lib/tournament-setup";
import { isValidCategory } from "@/lib/player-category";

const STORE_PATH = path.join(process.cwd(), "data", "pickleflow-store.json");
const EVENTS_DIR = path.join(process.cwd(), "data", "events");
const BLOB_PATHNAME = "pickleflow-store.json";
const STORE_VERSION = 2;
const EVENT_BLOB_PREFIX = "pickleflow-events/";

const eventWriteChains = new Map();

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
    const result = await get(BLOB_PATHNAME, { access: "private" });
    if (result?.statusCode === 200 && result.stream) {
      const text = await new Response(result.stream).text();
      const parsed = JSON.parse(text);
      await seedRepoEventFiles(parsed.eventIds);
      return parsed;
    }
    if (process.env.VERCEL) {
      try {
        const parsed = await readStoreFileRaw();
        const migrated = await migrateStoreToSplit(parsed);
        await writeStoreRaw(migrated);
        await seedRepoEventFiles(migrated.eventIds ?? parsed.eventIds);
        return migrated;
      } catch {
        return emptyStore();
      }
    }
    return seedStoreFromFileIfPresent();
  } catch (err) {
    console.error("readStoreBlobRaw failed:", err);
    if (process.env.VERCEL) {
      throw new Error(
        err.message?.includes("Blob")
          ? err.message
          : "Could not read saved data from Vercel Blob. Check BLOB_READ_WRITE_TOKEN and redeploy."
      );
    }
    return seedStoreFromFileIfPresent();
  }
}

function eventBlobPathname(eventId) {
  return `${EVENT_BLOB_PREFIX}${eventId}.json`;
}

function isFullEventRecord(record) {
  return Boolean(record?.id && (record.courts !== undefined || record.tournamentDivisions !== undefined));
}

async function withEventWriteLock(eventId, fn) {
  const prev = eventWriteChains.get(eventId) ?? Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  eventWriteChains.set(
    eventId,
    prev.then(() => gate)
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (eventWriteChains.get(eventId) === gate) {
      eventWriteChains.delete(eventId);
    }
  }
}

async function readEventFileRaw(eventId) {
  try {
    const raw = await fs.readFile(path.join(EVENTS_DIR, `${eventId}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read embedded events from the committed store file (survives Vercel Blob index-only seed). */
async function readLegacyEventFromRepoStore(eventId) {
  try {
    const parsed = await readStoreFileRaw();
    const legacy = (parsed.events ?? []).find((e) => e?.id === eventId);
    if (legacy && isFullEventRecord(legacy)) {
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Upload repo/local event JSON files when the store index lists ids but Blob has no record. */
async function seedRepoEventFiles(eventIds) {
  const ids = [...new Set((eventIds ?? []).filter(Boolean))];
  for (const id of ids) {
    if (useBlobStorage()) {
      try {
        const result = await get(eventBlobPathname(id), { access: "private" });
        if (result?.statusCode === 200) continue;
      } catch {
        /* upload from disk below */
      }
    } else {
      const local = await readEventFileRaw(id);
      if (local) continue;
    }
    const fromDisk = await readEventFileRaw(id);
    if (fromDisk) {
      await writeEventBlobRaw(fromDisk);
      continue;
    }
    const fromStore = await readLegacyEventFromRepoStore(id);
    if (fromStore) {
      await writeEventBlobRaw(fromStore);
    }
  }
}

async function readEventBlobRaw(eventId) {
  if (useBlobStorage()) {
    try {
      const result = await get(eventBlobPathname(eventId), { access: "private" });
      if (result?.statusCode === 200 && result.stream) {
        const text = await new Response(result.stream).text();
        return JSON.parse(text);
      }
    } catch {
      /* fall through */
    }
  }
  return readEventFileRaw(eventId);
}

async function writeEventBlobRaw(event) {
  const id = event?.id;
  if (!id) return;
  const json = JSON.stringify(event);
  if (useBlobStorage()) {
    await put(eventBlobPathname(id), json, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  await fs.mkdir(EVENTS_DIR, { recursive: true });
  await fs.writeFile(path.join(EVENTS_DIR, `${id}.json`), json, "utf8");
}

async function migrateStoreToSplit(parsed) {
  if (parsed.storeVersion === STORE_VERSION) return parsed;

  const events = parsed.events ?? [];
  const fullEvents = events.filter(isFullEventRecord);

  if (!fullEvents.length) {
    return {
      storeVersion: STORE_VERSION,
      eventIds: events.map((e) => (typeof e === "string" ? e : e?.id)).filter(Boolean),
      players: parsed.players ?? [],
      globalChatMessages: parsed.globalChatMessages ?? [],
      directMessages: parsed.directMessages ?? [],
    };
  }

  for (const ev of fullEvents) {
    await writeEventBlobRaw(ev);
  }

  return {
    storeVersion: STORE_VERSION,
    eventIds: fullEvents.map((e) => e.id),
    players: parsed.players ?? [],
    globalChatMessages: parsed.globalChatMessages ?? [],
    directMessages: parsed.directMessages ?? [],
  };
}

async function readStoreRaw() {
  let parsed;
  if (useBlobStorage()) {
    parsed = await readStoreBlobRaw();
  } else {
    try {
      parsed = await readStoreFileRaw();
    } catch {
      parsed = emptyStore();
    }
  }

  const migrated = await migrateStoreToSplit(parsed);
  if (migrated !== parsed && migrated.storeVersion === STORE_VERSION) {
    await writeStoreRaw(migrated);
  }
  return migrated;
}

async function readEventRecord(eventId) {
  if (useBlobStorage()) {
    try {
      const result = await get(eventBlobPathname(eventId), { access: "private" });
      if (result?.statusCode === 200 && result.stream) {
        const text = await new Response(result.stream).text();
        return JSON.parse(text);
      }
    } catch {
      /* fall through to repo / local file */
    }
  } else {
    const local = await readEventFileRaw(eventId);
    if (local) return local;
  }

  const fromDisk = await readEventFileRaw(eventId);
  if (fromDisk) {
    await safeWriteEventBlob(fromDisk);
    return fromDisk;
  }

  const fromRepoStore = await readLegacyEventFromRepoStore(eventId);
  if (fromRepoStore) {
    await safeWriteEventBlob(fromRepoStore);
    return fromRepoStore;
  }

  try {
    const parsed = await readStoreFileRaw();
    if (parsed.storeVersion !== STORE_VERSION) {
      const legacy = (parsed.events ?? []).find((e) => e.id === eventId);
      if (legacy && isFullEventRecord(legacy)) {
        await safeWriteEventBlob(legacy);
        return legacy;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

async function writeEventRecord(event) {
  await writeEventBlobRaw(event);
  const store = await readStoreRaw();
  const ids = new Set(store.eventIds ?? []);
  ids.add(event.id);
  const nextStore = {
    storeVersion: STORE_VERSION,
    eventIds: Array.from(ids),
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  };
  await writeStoreRaw(nextStore);
}

async function writeStoreBlobRaw(store) {
  await put(BLOB_PATHNAME, JSON.stringify(store), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function writeStoreRaw(store) {
  if (useBlobStorage()) {
    await writeStoreBlobRaw(store);
    return;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "PickleFlow cannot save on the live site without Vercel Blob. In your Vercel project: Storage → Blob → connect to this project, then redeploy."
    );
  }
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store), "utf8");
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
  if (raw.storeVersion === STORE_VERSION) {
    await seedRepoEventFiles(raw.eventIds);
    const events = (
      await Promise.all((raw.eventIds ?? []).map((id) => readEventRecord(id)))
    ).filter(Boolean);
    return normalizeStore({ ...raw, events });
  }
  return normalizeStore(raw);
}

export async function writeStore(store) {
  const events = store.events ?? [];
  for (const ev of events) {
    if (isFullEventRecord(ev)) {
      await writeEventBlobRaw(ev);
    }
  }
  await writeStoreRaw({
    storeVersion: STORE_VERSION,
    eventIds: events.map((e) => e.id).filter(Boolean),
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  });
}

export async function getAllEvents() {
  const store = await readStore();
  return store.events;
}

async function safeWriteEventBlob(event) {
  try {
    await writeEventBlobRaw(event);
  } catch (err) {
    console.error("safeWriteEventBlob failed:", event?.id, err);
  }
}

export async function getEventById(id, { refresh = true, persistRepair = true } = {}) {
  try {
    await seedRepoEventFiles([id]);
    const event = await readEventRecord(id);
    if (!event) return null;
    const normalized = normalizeEvent(event);
    if (!refresh) return normalized;

    const refreshed = refreshTournamentIfNeeded(normalized);
    if (persistRepair && tournamentEventNeedsPersistRepair(normalized, refreshed)) {
      try {
        await writeEventRecord(refreshed);
      } catch (err) {
        console.error("getEventById persistRepair failed:", id, err);
      }
    }
    return refreshed;
  } catch (err) {
    console.error("getEventById failed:", id, err);
    return null;
  }
}

export async function saveEventRecord(record) {
  const normalized = refreshTournamentIfNeeded(normalizeEvent(record));
  await writeEventRecord(normalized);
  return normalized;
}

export async function updateEventRecord(
  id,
  updater,
  { refreshTournament = true } = {}
) {
  return withEventWriteLock(id, async () => {
    let current = await readEventRecord(id);
    if (!current) return null;

    current = normalizeEvent(current);
    if (refreshTournament) {
      current = refreshTournamentIfNeeded(current);
    }

    const raw =
      typeof updater === "function" ? updater(current) : { ...current, ...updater };
    let next = normalizeEvent(raw);
    if (refreshTournament) {
      next = refreshTournamentIfNeeded(next);
    }

    await writeEventRecord(next);
    return next;
  });
}

export async function deleteEventRecord(id, { requireEnded = true } = {}) {
  const event = await readEventRecord(id);
  if (!event) return null;

  if (requireEnded && event.status !== "ended") {
    throw new Error("Only ended events can be removed from history.");
  }

  const store = await readStoreRaw();
  store.eventIds = (store.eventIds ?? []).filter((eid) => eid !== id);
  await writeStoreRaw(store);
  return normalizeEvent(event);
}

/** Remove ended events. When hostId is set, only that host's ended events. */
export async function deleteEndedEvents({ hostId } = {}) {
  const store = await readStoreRaw();
  const removed = [];
  const keptIds = [];

  for (const id of store.eventIds ?? []) {
    const ev = await readEventRecord(id);
    if (!ev) continue;
    const normalized = normalizeEvent(ev);
    if (normalized.status !== "ended" || (hostId && normalized.hostId !== hostId)) {
      keptIds.push(id);
    } else {
      removed.push(normalized);
    }
  }

  await writeStoreRaw({ ...store, eventIds: keptIds });
  const events = (
    await Promise.all(keptIds.map((id) => readEventBlobRaw(id)))
  ).filter(Boolean);
  return { removed, events: events.map(normalizeEvent) };
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
  const existingIds = new Set(store.eventIds ?? []);
  for (const ev of events) {
    const normalized = refreshTournamentIfNeeded(normalizeEvent(ev));
    if (!existingIds.has(normalized.id)) {
      await writeEventRecord(normalized);
      existingIds.add(normalized.id);
    }
  }
  return getAllEvents();
}
