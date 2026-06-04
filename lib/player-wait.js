/** Longest-wait-first helper for the players sidebar. */
export function getPlayerWaitInfo(event, playerId) {
  const now = Date.now();
  const playingCourts = [];
  let earliestQueuedAt = null;

  for (const court of event.courts ?? []) {
    const match = court.currentMatch;
    if (court.status === "live" && match) {
      const onCourt = [...(match.teamA ?? []), ...(match.teamB ?? [])].some(
        (p) => p.playerId === playerId
      );
      if (onCourt) playingCourts.push(court.name);
    }

    if (court.status === "pending" && court.pendingMatch) {
      const onPending = [
        ...(court.pendingMatch.teamA ?? []),
        ...(court.pendingMatch.teamB ?? []),
      ].some((p) => p.playerId === playerId);
      if (onPending) playingCourts.push(`${court.name} (assigned)`);
    }

    const entry = court.queue?.find((q) => q.playerId === playerId);
    if (entry?.queuedAt != null) {
      if (earliestQueuedAt === null || entry.queuedAt < earliestQueuedAt) {
        earliestQueuedAt = entry.queuedAt;
      }
    }
  }

  const reg = event.registrations?.find((r) => r.playerId === playerId);
  const joinedAt = reg?.joinedAt ?? now;

  if (playingCourts.length > 0) {
    return {
      status: "playing",
      playingCourts,
      waitMs: 0,
      sortKey: 0,
    };
  }

  const waitStart = earliestQueuedAt ?? joinedAt;
  const waitMs = Math.max(0, now - waitStart);

  return {
    status: "waiting",
    waitMs,
    waitStart,
    sortKey: waitMs,
  };
}

export function formatWaitDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const hours = Math.floor(mins / 60);

  if (totalSeconds < 60) return "less than 1 min";
  if (mins < 60) return mins === 1 ? "1 min" : `${mins} mins`;
  const remMins = mins % 60;
  if (remMins === 0) return hours === 1 ? "1 hr" : `${hours} hrs`;
  return `${hours} hr ${remMins} min`;
}

export function sortPlayersByWait(registrations, event) {
  return [...registrations].sort((a, b) => {
    const wa = getPlayerWaitInfo(event, a.playerId);
    const wb = getPlayerWaitInfo(event, b.playerId);
    if (wa.status === "playing" && wb.status !== "playing") return 1;
    if (wb.status === "playing" && wa.status !== "playing") return -1;
    return wb.sortKey - wa.sortKey;
  });
}
