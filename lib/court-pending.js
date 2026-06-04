import { initDoublesPositions } from "@/lib/court-positions";
import { getPlayerLastMatchEndTime } from "@/lib/match-history";
import {
  formDoublesMatch,
  getMatchBracket,
  normalizeCategory,
} from "@/lib/matchmaking";

function isPlayingOnCourt(court, playerId) {
  if (court.status !== "live" || !court.currentMatch) return false;
  const all = [
    ...(court.currentMatch.teamA ?? []),
    ...(court.currentMatch.teamB ?? []),
  ];
  return all.some((p) => p.playerId === playerId);
}

export function getPendingPlayerIds(court) {
  const pm = court?.pendingMatch;
  if (!pm) return new Set();
  const ids = new Set();
  for (const p of [
    ...(pm.teamA ?? []),
    ...(pm.teamB ?? []),
    ...(pm.players ?? []),
  ]) {
    if (p?.playerId) ids.add(p.playerId);
  }
  return ids;
}

export function isPlayerReservedOnEvent(event, playerId) {
  for (const court of event.courts ?? []) {
    if (isPlayingOnCourt(court, playerId)) return true;
    if (court.status === "pending" && getPendingPlayerIds(court).has(playerId)) {
      return true;
    }
  }
  return false;
}

export function formDoublesMatchFromTeams(teamA, teamB) {
  const bracket = getMatchBracket([...(teamA ?? []), ...(teamB ?? [])]);
  return {
    ...initDoublesPositions(teamA, teamB),
    startedAt: Date.now(),
    scoreA: 0,
    scoreB: 0,
    matchBracket: bracket.label,
  };
}

export function buildPendingMatch(picked) {
  const draft = formDoublesMatch(picked);
  return {
    proposedAt: Date.now(),
    fifoOrder: picked.map((p) => p.playerId),
    players: picked,
    matchBracket: draft.matchBracket ?? null,
    formation: draft.formation ?? null,
    teamA: draft.teamA,
    teamB: draft.teamB,
  };
}

/** Registrations + queues not live/pending elsewhere, FIFO. */
export function getAlternatePlayers(event, courtId, excludeIds) {
  const exclude = new Set(excludeIds);
  const byId = new Map();

  for (const reg of event.registrations ?? []) {
    if (exclude.has(reg.playerId)) continue;
    if (isPlayerReservedOnEvent(event, reg.playerId)) continue;

    let queuedAt = null;
    for (const c of event.courts ?? []) {
      const q = c.queue?.find((x) => x.playerId === reg.playerId);
      if (q?.queuedAt != null) {
        queuedAt =
          queuedAt == null ? q.queuedAt : Math.min(queuedAt, q.queuedAt);
      }
    }
    if (queuedAt == null) {
      const lastPlayed = getPlayerLastMatchEndTime(event, reg.playerId);
      queuedAt = lastPlayed ?? reg.joinedAt ?? Date.now();
    }

    byId.set(reg.playerId, {
      playerId: reg.playerId,
      name: reg.name,
      email: reg.email,
      category: normalizeCategory(reg.category),
      queuedAt,
    });
  }

  for (const court of event.courts ?? []) {
    for (const q of court.queue ?? []) {
      if (exclude.has(q.playerId)) continue;
      if (isPlayerReservedOnEvent(event, q.playerId)) continue;
      const existing = byId.get(q.playerId);
      if (!existing || (q.queuedAt ?? 0) < (existing.queuedAt ?? 0)) {
        byId.set(q.playerId, {
          ...q,
          category: normalizeCategory(q.category),
        });
      }
    }
  }

  return [...byId.values()].sort(
    (a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0)
  );
}

function stripCourtSide(player) {
  const { courtSide, ...rest } = player;
  return rest;
}

function validateTeams(teamA, teamB) {
  const a = (teamA ?? []).map(stripCourtSide);
  const b = (teamB ?? []).map(stripCourtSide);
  if (a.length !== 2 || b.length !== 2) {
    throw new Error("Each team needs two players.");
  }
  const ids = [...a, ...b].map((p) => p.playerId);
  if (new Set(ids).size !== 4) {
    throw new Error("Each player can only appear once.");
  }
  return { teamA: a, teamB: b };
}

export function confirmPendingMatch(event, courtId, teamA, teamB) {
  const court = event.courts?.find((c) => c.id === courtId);
  if (!court || court.status !== "pending" || !court.pendingMatch) {
    throw new Error("No pending match on this court.");
  }

  const { teamA: a, teamB: b } = validateTeams(teamA, teamB);
  const bracket = getMatchBracket([...a, ...b]);
  if (bracket.type === "invalid") {
    throw new Error(
      "Invalid bracket. Use same skill level or an allowed pair: Beginner↔Novice, Novice↔Intermediate, Intermediate↔Pro."
    );
  }
  const currentMatch = formDoublesMatchFromTeams(a, b);

  const updatedCourt = {
    ...court,
    status: "live",
    currentMatch,
    pendingMatch: null,
  };

  const newMatch = {
    courtId: court.id,
    courtName: court.name,
    aiAnnounce: court.aiAnnounce !== false,
    teamA: currentMatch.teamA,
    teamB: currentMatch.teamB,
  };

  return {
    event: {
      ...event,
      courts: event.courts.map((c) => (c.id === courtId ? updatedCourt : c)),
    },
    newMatches: [newMatch],
  };
}

export function cancelPendingMatch(event, courtId) {
  const court = event.courts?.find((c) => c.id === courtId);
  if (!court?.pendingMatch) return { event, newMatches: [] };

  const players = court.pendingMatch.players ?? [];
  const existingIds = new Set((court.queue ?? []).map((q) => q.playerId));
  const restored = players.filter((p) => !existingIds.has(p.playerId));

  return {
    event: {
      ...event,
      courts: event.courts.map((c) => {
        if (c.id !== courtId) return c;
        return {
          ...c,
          status: "idle",
          pendingMatch: null,
          queue: [...(c.queue ?? []), ...restored].sort(
            (a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0)
          ),
        };
      }),
    },
    newMatches: [],
  };
}
