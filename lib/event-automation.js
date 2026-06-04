import {
  pickNextFour,
  removeFromQueue,
  normalizeCategory,
} from "@/lib/matchmaking";
import { getPlayerLastMatchEndTime } from "@/lib/match-history";
import {
  buildPendingMatch,
  isPlayerReservedOnEvent,
} from "@/lib/court-pending";

function byFifo(a, b) {
  return (a.queuedAt ?? 0) - (b.queuedAt ?? 0);
}

function preservedQueueTime(event, playerId) {
  let earliest = null;
  for (const court of event.courts ?? []) {
    const entry = (court.queue ?? []).find((q) => q.playerId === playerId);
    if (entry?.queuedAt == null) continue;
    earliest =
      earliest == null
        ? entry.queuedAt
        : Math.min(earliest, entry.queuedAt);
  }
  return earliest;
}

function resolveQueuedAt(event, registration) {
  const waitingSince = preservedQueueTime(event, registration.playerId);
  if (waitingSince != null) return waitingSince;

  const lastPlayed = getPlayerLastMatchEndTime(event, registration.playerId);
  if (lastPlayed != null) return lastPlayed;

  return registration.joinedAt ?? Date.now();
}

/** One shared FIFO wait list for the whole event (open play). */
export function buildGlobalWaitQueue(event) {
  const entries = [];

  for (const reg of event.registrations ?? []) {
    if (isPlayerReservedOnEvent(event, reg.playerId)) continue;

    entries.push({
      playerId: reg.playerId,
      name: reg.name,
      email: reg.email,
      category: normalizeCategory(reg.category),
      queuedAt: resolveQueuedAt(event, reg),
    });
  }

  return entries.sort(byFifo);
}

function getBusyPlayerIds(event, courts) {
  const busy = getLivePlayerIds({ ...event, courts });
  for (const court of courts) {
    if (court.status === "pending" && court.pendingMatch) {
      for (const id of court.pendingMatch.fifoOrder ?? []) {
        busy.add(id);
      }
    }
  }
  return busy;
}

/** Players currently in a live match on any court. */
export function getLivePlayerIds(event, excludeCourtId = null) {
  const ids = new Set();
  for (const court of event.courts ?? []) {
    if (excludeCourtId && court.id === excludeCourtId) continue;
    if (court.status !== "live" || !court.currentMatch) continue;
    for (const p of [
      ...(court.currentMatch.teamA ?? []),
      ...(court.currentMatch.teamB ?? []),
    ]) {
      if (p?.playerId) ids.add(p.playerId);
    }
  }
  return ids;
}

/** Mirror the global wait list on every idle court. */
export function syncQueuesToAllCourts(event) {
  const globalQueue = buildGlobalWaitQueue(event);

  return {
    ...event,
    courts: (event.courts ?? []).map((court) => {
      if (court.status === "live" || court.status === "pending") return court;

      return {
        ...court,
        queue: court.lastMatch ? [] : [...globalQueue],
        autoMatch: court.autoMatch !== false && !court.lastMatch,
      };
    }),
  };
}

/** Propose FIFO matches for idle courts from one shared wait pool. */
export function applyAutoMatchesToIdleCourts(event) {
  const pendingProposals = [];
  let courts = (event.courts ?? []).map((c) => ({
    ...c,
    queue: [...(c.queue ?? [])],
  }));

  const busy = getBusyPlayerIds(event, courts);
  let pool = buildGlobalWaitQueue({ ...event, courts }).filter(
    (q) => !busy.has(q.playerId)
  );

  for (let i = 0; i < courts.length; i++) {
    const court = courts[i];
    if (court.status === "live" || court.status === "pending") continue;
    if (court.autoMatch === false || court.lastMatch) continue;

    const picked = pickNextFour(pool);
    if (!picked) continue;

    const playerIds = picked.map((p) => p.playerId);
    const pendingMatch = buildPendingMatch(picked);

    pendingProposals.push({
      courtId: court.id,
      courtName: court.name,
      pendingMatch,
    });

    courts[i] = {
      ...court,
      status: "pending",
      pendingMatch,
      currentMatch: null,
      queue: [],
      autoMatch: court.autoMatch !== false,
    };

    pool = removeFromQueue(pool, playerIds);
    for (const id of playerIds) busy.add(id);
  }

  const waitingQueue = pool.sort(byFifo);
  courts = courts.map((court) => {
    if (court.status === "live" || court.status === "pending") return court;
    return {
      ...court,
      queue: [...waitingQueue],
    };
  });

  return {
    event: { ...event, courts },
    newMatches: [],
    pendingProposals,
  };
}

export function processEventAutomation(event) {
  if (event?.status === "ended") {
    return { event, newMatches: [], pendingProposals: [] };
  }

  const synced = syncQueuesToAllCourts(event);
  const { event: matched, newMatches, pendingProposals } =
    applyAutoMatchesToIdleCourts(synced);
  return { event: matched, newMatches, pendingProposals };
}
