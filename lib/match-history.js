import { formatTeamSlash } from "@/lib/announce";

export function resolveMatchWinner(scoreA, scoreB) {
  if (scoreA > scoreB) return "A";
  if (scoreB > scoreA) return "B";
  return "tie";
}

export function buildHistoryEntry(court, match) {
  const scoreA = match.scoreA ?? 0;
  const scoreB = match.scoreB ?? 0;
  const winner = resolveMatchWinner(scoreA, scoreB);

  return {
    id: `hist-${Date.now()}-${court.id}`,
    courtId: court.id,
    courtName: court.name,
    teamA: match.teamA ?? [],
    teamB: match.teamB ?? [],
    scoreA,
    scoreB,
    winner,
    basePlayerA: match.basePlayerA ?? null,
    basePlayerB: match.basePlayerB ?? null,
    sidesSwapped: match.sidesSwapped ?? false,
    startedAt: match.startedAt ?? Date.now(),
    endedAt: Date.now(),
  };
}

/** When a player returns to the wait list after playing, they join at the back. */
export function getPlayerLastMatchEndTime(event, playerId) {
  if (!playerId) return null;
  let latest = null;
  for (const entry of event.matchHistory ?? []) {
    const played = [...(entry.teamA ?? []), ...(entry.teamB ?? [])].some(
      (p) => p.playerId === playerId
    );
    if (!played) continue;
    const ended = entry.endedAt ?? 0;
    if (latest == null || ended > latest) latest = ended;
  }
  return latest;
}

export function winnerLabel(entry) {
  if (entry.winner === "A") {
    return { text: formatTeamSlash(entry.teamA), side: "A" };
  }
  if (entry.winner === "B") {
    return { text: formatTeamSlash(entry.teamB), side: "B" };
  }
  return { text: "Tie", side: "tie" };
}
