import fs from "fs/promises";
import path from "path";
import { get, put } from "@vercel/blob";
import { normalizeEvent } from "@/lib/event-normalize";
import {
  refreshTournamentStandings,
  tournamentEventNeedsPersistRepair,
} from "@/lib/tournament-setup";
import { isValidCategory } from "@/lib/player-category";
import {
  mergeConcurrentEventWrites,
  eventHasAllPairIds,
  pairRegistrationIds,
} from "@/lib/event-merge";

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
  const events = (parsed.events ?? []).filter(Boolean).map(normalizeEvent);
  return {
    events,
    players: parsed.players ?? [],
    globalChatMessages: parsed.globalChatMessages ?? [],
    directMessages: parsed.directMessages ?? [],
  };
}

function isFullEventRecord(record) {
  return Boolean(
    record?.id && (record.courts !== undefined || record.tournamentDivisions !== undefined)
  );
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

async function readStoreFileRaw() {
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

// ─── Local dev: one JSON file with full events inline ───────────────────────

function consolidateLocalStore(parsed) {
  if (!parsed || typeof parsed !== "object") return emptyStore();
  if (Array.isArray(parsed.events)) {
    const { storeVersion: _sv, eventIds: _ids, ...rest } = parsed;
    return normalizeStore(rest);
  }
  return normalizeStore(parsed);
}

async function readLocalStoreRaw() {
  try {
    const parsed = await readStoreFileRaw();
    return consolidateLocalStore(parsed);
  } catch {
    return emptyStore();
  }
}

async function writeLocalStoreRaw(store) {
  const payload = {
    events: store.events ?? [],
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

// ─── Online (Vercel Blob): index + per-event blobs ─────────────────────────

async function seedStoreFromFileIfPresent() {
  try {
    const parsed = await readStoreFileRaw();
    const store = normalizeStore(parsed);
    await writeBlobIndexRaw({
      storeVersion: STORE_VERSION,
      eventIds: store.events.map((e) => e.id),
      players: store.players,
      globalChatMessages: store.globalChatMessages,
      directMessages: store.directMessages,
    });
    for (const ev of store.events) {
      if (isFullEventRecord(ev)) {
        await writeEventBlobRaw(ev);
      }
    }
    return {
      storeVersion: STORE_VERSION,
      eventIds: store.events.map((e) => e.id),
      players: store.players,
      globalChatMessages: store.globalChatMessages,
      directMessages: store.directMessages,
    };
  } catch {
    return {
      storeVersion: STORE_VERSION,
      eventIds: [],
      players: [],
      globalChatMessages: [],
      directMessages: [],
    };
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
        await writeBlobIndexRaw(migrated);
        await seedRepoEventFiles(migrated.eventIds);
        return migrated;
      } catch {
        return {
          storeVersion: STORE_VERSION,
          eventIds: [],
          players: [],
          globalChatMessages: [],
          directMessages: [],
        };
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

async function readLegacyEventFromRepoStore(eventId) {
  try {
    const parsed = await readStoreFileRaw();
    const legacy = (parsed.events ?? []).find((e) => e?.id === eventId);
    if (legacy && isFullEventRecord(legacy)) return legacy;
  } catch {
    /* ignore */
  }
  return null;
}

async function blobEventExists(eventId) {
  if (!useBlobStorage()) return "missing";
  try {
    const result = await get(eventBlobPathname(eventId), { access: "private" });
    if (result?.statusCode === 200) return "ok";
    if (result?.statusCode === 404) return "missing";
    return "error";
  } catch {
    return "error";
  }
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

async function seedRepoEventFiles(eventIds) {
  const ids = [...new Set((eventIds ?? []).filter(Boolean))];
  for (const id of ids) {
    if (useBlobStorage()) {
      const exists = await blobEventExists(id);
      if (exists === "ok" || exists === "error") continue;
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

async function migrateStoreToSplit(parsed) {
  if (parsed.storeVersion === STORE_VERSION && !parsed.events?.length) {
    return parsed;
  }

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

async function readBlobIndexRaw() {
  let parsed = await readStoreBlobRaw();
  if (parsed.storeVersion !== STORE_VERSION && Array.isArray(parsed.events)) {
    parsed = await migrateStoreToSplit(parsed);
    await writeBlobIndexRaw(parsed);
  }
  return parsed;
}

async function writeBlobIndexRaw(store) {
  await put(BLOB_PATHNAME, JSON.stringify(store), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readEventRecord(eventId) {
  if (useBlobStorage()) {
    const exists = await blobEventExists(eventId);
    if (exists === "ok") {
      try {
        const result = await get(eventBlobPathname(eventId), { access: "private" });
        if (result?.statusCode === 200 && result.stream) {
          const text = await new Response(result.stream).text();
          return JSON.parse(text);
        }
      } catch {
        return null;
      }
    }
    if (exists === "error") return null;
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
    if (Array.isArray(parsed.events)) {
      const legacy = parsed.events.find((e) => e.id === eventId);
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
  const store = await readBlobIndexRaw();
  const ids = new Set(store.eventIds ?? []);
  ids.add(event.id);
  await writeBlobIndexRaw({
    storeVersion: STORE_VERSION,
    eventIds: Array.from(ids),
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  });
}

async function safeWriteEventBlob(event) {
  try {
    await writeEventBlobRaw(event);
  } catch (err) {
    console.error("safeWriteEventBlob failed:", event?.id, err);
  }
}

// ─── Unified read/write ──────────────────────────────────────────────────────

async function readStoreRaw() {
  if (!useBlobStorage()) {
    return readLocalStoreRaw();
  }
  return readBlobIndexRaw();
}

async function writeStoreRaw(store) {
  if (!useBlobStorage()) {
    await writeLocalStoreRaw(store);
    return;
  }
  const eventIds =
    store.eventIds ??
    (store.events ?? []).map((e) => e.id).filter(Boolean);
  await writeBlobIndexRaw({
    storeVersion: STORE_VERSION,
    eventIds,
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  });
}

async function readFullStore() {
  if (!useBlobStorage()) {
    return readLocalStoreRaw();
  }
  const raw = await readBlobIndexRaw();
  await seedRepoEventFiles(raw.eventIds);
  const events = (
    await Promise.all((raw.eventIds ?? []).map((id) => readEventRecord(id)))
  ).filter(Boolean);
  return normalizeStore({ ...raw, events });
}

export async function readStore() {
  return readFullStore();
}

export async function writeStore(store) {
  if (!useBlobStorage()) {
    await writeLocalStoreRaw(store);
    return;
  }
  const events = store.events ?? [];
  for (const ev of events) {
    if (isFullEventRecord(ev)) {
      await writeEventBlobRaw(ev);
    }
  }
  await writeBlobIndexRaw({
    storeVersion: STORE_VERSION,
    eventIds: events.map((e) => e.id).filter(Boolean),
    players: store.players ?? [],
    globalChatMessages: store.globalChatMessages ?? [],
    directMessages: store.directMessages ?? [],
  });
}

export async function getAllEvents() {
  const store = await readFullStore();
  return store.events;
}

export async function getEventById(id, { refresh = true, persistRepair = true } = {}) {
  try {
    if (!useBlobStorage()) {
      const store = await readLocalStoreRaw();
      const index = store.events.findIndex((e) => e.id === id);
      if (index < 0) return null;

      const normalized = normalizeEvent(store.events[index]);
      if (!refresh) return normalized;

      const refreshed = refreshTournamentIfNeeded(normalized);
      if (
        persistRepair &&
        normalized.status !== "ended" &&
        (tournamentEventNeedsPersistRepair(normalized, refreshed) ||
          tournamentSnapshot(refreshed) !== tournamentSnapshot(normalized))
      ) {
        store.events[index] = refreshed;
        await writeLocalStoreRaw(store);
      }
      return refreshed;
    }

    await seedRepoEventFiles([id]);
    const event = await readEventRecord(id);
    if (!event) return null;
    const normalized = normalizeEvent(event);
    if (!refresh) return normalized;

    const refreshed = refreshTournamentIfNeeded(normalized);
    if (
      persistRepair &&
      normalized.status !== "ended" &&
      tournamentEventNeedsPersistRepair(normalized, refreshed)
    ) {
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
  if (!useBlobStorage()) {
    const store = await readLocalStoreRaw();
    store.events.push(normalized);
    await writeLocalStoreRaw(store);
    return normalized;
  }
  await writeEventRecord(normalized);
  return normalized;
}

export async function updateEventRecord(
  id,
  updater,
  { refreshTournament = true } = {}
) {
  if (!useBlobStorage()) {
    const store = await readLocalStoreRaw();
    const index = store.events.findIndex((e) => e.id === id);
    if (index < 0) return null;

    let current = normalizeEvent(store.events[index]);
    if (refreshTournament) current = refreshTournamentIfNeeded(current);

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
    if (refreshTournament) next = refreshTournamentIfNeeded(next);

    store.events[index] = next;
    await writeLocalStoreRaw(store);
    return next;
  }

  return withEventWriteLock(id, async () => {
    const MAX_ATTEMPTS = 5;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let current = await readEventRecord(id);
      if (!current) return null;

      current = normalizeEvent(current);
      if (refreshTournament) current = refreshTournamentIfNeeded(current);

      const beforePairIds = pairRegistrationIds(current);

      const raw =
        typeof updater === "function"
          ? updater(current)
          : { ...current, ...updater };
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
      if (refreshTournament) next = refreshTournamentIfNeeded(next);

      const fresh = await readEventRecord(id);
      if (fresh) {
        next = normalizeEvent(
          mergeConcurrentEventWrites(normalizeEvent(fresh), next)
        );
        if (refreshTournament) next = refreshTournamentIfNeeded(next);
      }

      await writeEventRecord(next);

      const verify = await readEventRecord(id);
      if (!verify) return normalizeEvent(next);

      const merged = normalizeEvent(
        mergeConcurrentEventWrites(normalizeEvent(verify), next)
      );
      const expectedIds = pairRegistrationIds(merged);

      if (
        eventHasAllPairIds(verify, beforePairIds) &&
        eventHasAllPairIds(verify, expectedIds)
      ) {
        if (refreshTournament) {
          return refreshTournamentIfNeeded(merged);
        }
        return merged;
      }

      if (attempt === MAX_ATTEMPTS - 1) {
        await writeEventRecord(merged);
        return refreshTournament
          ? refreshTournamentIfNeeded(merged)
          : merged;
      }
    }

    return null;
  });
}

export async function deleteEventRecord(id, { requireEnded = true } = {}) {
  if (!useBlobStorage()) {
    const store = await readLocalStoreRaw();
    const index = store.events.findIndex((e) => e.id === id);
    if (index < 0) return null;
    const event = normalizeEvent(store.events[index]);
    if (requireEnded && event.status !== "ended") {
      throw new Error("Only ended events can be removed from history.");
    }
    store.events.splice(index, 1);
    await writeLocalStoreRaw(store);
    return event;
  }

  const event = await readEventRecord(id);
  if (!event) return null;
  const normalized = normalizeEvent(event);
  if (requireEnded && normalized.status !== "ended") {
    throw new Error("Only ended events can be removed from history.");
  }
  const store = await readBlobIndexRaw();
  store.eventIds = (store.eventIds ?? []).filter((eid) => eid !== id);
  await writeBlobIndexRaw(store);
  return normalized;
}

export async function deleteEndedEvents({ hostId } = {}) {
  if (!useBlobStorage()) {
    const store = await readLocalStoreRaw();
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
    await writeLocalStoreRaw(store);
    return { removed, events: store.events.map(normalizeEvent) };
  }

  const store = await readBlobIndexRaw();
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

  await writeBlobIndexRaw({ ...store, eventIds: keptIds });
  const events = (
    await Promise.all(keptIds.map((eid) => readEventBlobRaw(eid)))
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
  if (!q) return store.players.slice(0, limit);
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
  if (!useBlobStorage()) {
    const store = await readLocalStoreRaw();
    const existingIds = new Set(store.events.map((e) => e.id));
    for (const ev of events) {
      const normalized = refreshTournamentIfNeeded(normalizeEvent(ev));
      if (!existingIds.has(normalized.id)) {
        store.events.push(normalized);
        existingIds.add(normalized.id);
      }
    }
    await writeLocalStoreRaw(store);
    return store.events.map(normalizeEvent);
  }

  const store = await readBlobIndexRaw();
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
