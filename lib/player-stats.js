/** Per-player stats from completed open-play matches (individual, not pairs). */

export function collectOpenPlayHistory(events, eventIdFilter = null) {
  const entries = [];
  for (const event of events ?? []) {
    if (event.type !== "open_play") continue;
    if (eventIdFilter && event.id !== eventIdFilter) continue;
    for (const h of event.matchHistory ?? []) {
      entries.push({
        ...h,
        eventId: event.id,
        eventName: event.name,
        eventDate: event.date,
      });
    }
  }
  return entries;
}

function ensurePlayer(map, player) {
  const id = player?.playerId;
  if (!id) return null;
  if (!map.has(id)) {
    map.set(id, {
      playerId: id,
      name: player.name ?? id,
      wins: 0,
      losses: 0,
      ties: 0,
      matches: 0,
    });
  }
  const row = map.get(id);
  if (player.name && row.name === id) row.name = player.name;
  return row;
}

function computeWinPct(wins, losses) {
  const decided = wins + losses;
  if (decided <= 0) return 0;
  return Math.min(100, Math.round((wins / decided) * 1000) / 10);
}

export function computePlayerStats(entries) {
  const map = new Map();

  for (const entry of entries) {
    const teamA = entry.teamA ?? [];
    const teamB = entry.teamB ?? [];
    const winner = entry.winner;

    if (winner === "A") {
      for (const p of teamA) {
        const row = ensurePlayer(map, p);
        if (row) {
          row.wins++;
          row.matches++;
        }
      }
      for (const p of teamB) {
        const row = ensurePlayer(map, p);
        if (row) {
          row.losses++;
          row.matches++;
        }
      }
    } else if (winner === "B") {
      for (const p of teamB) {
        const row = ensurePlayer(map, p);
        if (row) {
          row.wins++;
          row.matches++;
        }
      }
      for (const p of teamA) {
        const row = ensurePlayer(map, p);
        if (row) {
          row.losses++;
          row.matches++;
        }
      }
    } else {
      for (const p of [...teamA, ...teamB]) {
        const row = ensurePlayer(map, p);
        if (row) {
          row.ties++;
          row.matches++;
        }
      }
    }
  }

  return [...map.values()].map((s) => ({
    ...s,
    winPct: computeWinPct(s.wins, s.losses),
  }));
}

export function buildLeaderboard(stats) {
  return [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    return b.matches - a.matches;
  });
}

export function getPlayerRank(leaderboard, playerId) {
  if (!playerId) return null;
  const idx = leaderboard.findIndex((p) => p.playerId === playerId);
  return idx < 0 ? null : idx + 1;
}

export function getPlayerResultInMatch(entry, playerId) {
  const onA = (entry.teamA ?? []).some((p) => p.playerId === playerId);
  const onB = (entry.teamB ?? []).some((p) => p.playerId === playerId);
  if (!onA && !onB) return null;
  if (entry.winner === "tie") return "tie";
  if (entry.winner === "A") return onA ? "win" : "loss";
  if (entry.winner === "B") return onB ? "win" : "loss";
  return null;
}

export function getPlayerHistory(entries, playerId) {
  if (!playerId) return [];

  return entries
    .filter((e) =>
      [...(e.teamA ?? []), ...(e.teamB ?? [])].some(
        (p) => p.playerId === playerId
      )
    )
    .map((entry) => ({
      ...entry,
      result: getPlayerResultInMatch(entry, playerId),
      playerTeam: (entry.teamA ?? []).some((p) => p.playerId === playerId)
        ? "A"
        : "B",
      playerScore:
        (entry.teamA ?? []).some((p) => p.playerId === playerId)
          ? entry.scoreA
          : entry.scoreB,
      opponentScore:
        (entry.teamA ?? []).some((p) => p.playerId === playerId)
          ? entry.scoreB
          : entry.scoreA,
    }))
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
}

export function getPlayerStatsSummary(entries, playerId) {
  const history = getPlayerHistory(entries, playerId);
  const stats = computePlayerStats(entries);
  const leaderboard = buildLeaderboard(stats);
  const row = stats.find((s) => s.playerId === playerId);
  const rank = getPlayerRank(leaderboard, playerId);

  return {
    stats: row ?? {
      playerId,
      wins: 0,
      losses: 0,
      ties: 0,
      matches: 0,
      winPct: 0,
    },
    rank,
    isTopThree: rank != null && rank <= 3,
    history,
    leaderboard,
  };
}
