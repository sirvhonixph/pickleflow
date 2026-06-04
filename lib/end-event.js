import { buildHistoryEntry } from "@/lib/match-history";

export function isEventActive(event) {
  return event?.status !== "ended";
}

/** Host ends the whole open play session. */
export function endEntireEvent(event) {
  if (event?.status === "ended") {
    return event;
  }

  const matchHistory = [...(event.matchHistory ?? [])];

  const courts = (event.courts ?? []).map((court) => {
    let next = { ...court, autoMatch: false };

    if (court.status === "live" && court.currentMatch) {
      matchHistory.unshift(buildHistoryEntry(court, court.currentMatch));
      next = {
        ...next,
        status: "idle",
        currentMatch: null,
      };
    }

    if (court.status === "pending" && court.pendingMatch) {
      const players = court.pendingMatch.players ?? [];
      const existingIds = new Set((next.queue ?? []).map((q) => q.playerId));
      const restored = players.filter((p) => !existingIds.has(p.playerId));
      next = {
        ...next,
        status: "idle",
        pendingMatch: null,
        queue: [...(next.queue ?? []), ...restored].sort(
          (a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0)
        ),
      };
    }

    return next;
  });

  return {
    ...event,
    status: "ended",
    endedAt: Date.now(),
    matchHistory,
    courts,
  };
}
