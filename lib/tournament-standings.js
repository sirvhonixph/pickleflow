import { pairDisplayName } from "@/lib/tournament-divisions";

function enrichStandingStats(stats) {
  const avgWinPoints =
    stats.wins > 0 ? stats.pointsInWins / stats.wins : 0;
  const avgLossPoints =
    stats.losses > 0 ? stats.pointsInLosses / stats.losses : 0;

  return {
    ...stats,
    winPct:
      stats.matchesPlayed > 0
        ? Math.round((stats.wins / stats.matchesPlayed) * 1000) / 10
        : 0,
    pointDiff: stats.pointsFor - stats.pointsAgainst,
    avgWinPoints: Math.round(avgWinPoints * 10) / 10,
    avgLossPoints: Math.round(avgLossPoints * 10) / 10,
    /** wins + average(points in wins, points in losses) — 2nd-place tiebreak */
    tieBreaker:
      Math.round(
        (stats.wins + (avgWinPoints + avgLossPoints) / 2) * 100
      ) / 100,
  };
}

export function compareStandings(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.tieBreaker !== a.tieBreaker) return b.tieBreaker - a.tieBreaker;
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
  return b.winPct - a.winPct;
}

export function computeBracketStandings(pairMap, matches) {
  const stats = new Map();

  for (const [id, pair] of pairMap) {
    stats.set(id, {
      pairId: id,
      name: pairDisplayName(pair),
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsInWins: 0,
      pointsInLosses: 0,
      matchesPlayed: 0,
    });
  }

  for (const m of matches) {
    if (m.status !== "completed" && m.winnerPairId == null) continue;
    const a = stats.get(m.pairAId);
    const b = stats.get(m.pairBId);
    if (!a || !b) continue;

    const scoreA = m.scoreA ?? 0;
    const scoreB = m.scoreB ?? 0;
    a.pointsFor += scoreA;
    a.pointsAgainst += scoreB;
    b.pointsFor += scoreB;
    b.pointsAgainst += scoreA;
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;

    if (m.winnerPairId === m.pairAId) {
      a.wins += 1;
      a.pointsInWins += scoreA;
      b.losses += 1;
      b.pointsInLosses += scoreB;
    } else if (m.winnerPairId === m.pairBId) {
      b.wins += 1;
      b.pointsInWins += scoreB;
      a.losses += 1;
      a.pointsInLosses += scoreA;
    } else if (scoreA === scoreB) {
      a.ties += 1;
      b.ties += 1;
    }
  }

  return [...stats.values()].map(enrichStandingStats).sort(compareStandings);
}

/**
 * #1 from the highest win total always advances.
 * #2 from the next win total advances; if several pairs share that record,
 * the tie is broken by wins + avg(points scored in wins & losses).
 */
export function pickAdvancedPairIds(standings, allDone) {
  if (!allDone || standings.length === 0) return [];
  if (standings.length === 1) return [standings[0].pairId];

  const sorted = [...standings].sort(compareStandings);
  const byWins = new Map();
  for (const row of sorted) {
    if (!byWins.has(row.wins)) byWins.set(row.wins, []);
    byWins.get(row.wins).push(row);
  }

  const winLevels = [...byWins.keys()].sort((a, b) => b - a);
  const advanced = [];

  const topGroup = [...byWins.get(winLevels[0])].sort(compareStandings);
  advanced.push(topGroup[0].pairId);

  if (winLevels.length < 2) return advanced;

  const secondGroup = [...byWins.get(winLevels[1])].sort(compareStandings);
  advanced.push(secondGroup[0].pairId);

  return advanced;
}

export function refreshBracketStandings(bracket, pairById) {
  const pairMap = new Map();
  for (const id of bracket.pairIds ?? []) {
    const p = pairById.get(id);
    if (p) pairMap.set(id, p);
  }
  const standings = computeBracketStandings(pairMap, bracket.matches ?? []);
  const completed = (bracket.matches ?? []).filter(
    (m) => m.status === "completed" || m.winnerPairId
  ).length;
  const total = (bracket.matches ?? []).length;
  const allDone = total > 0 && completed >= total;
  const advancedPairIds = bracket.advancedPairIds ?? [];

  return {
    ...bracket,
    standings,
    advancedPairIds,
    poolComplete: allDone,
  };
}

export function allRoundRobinMatchesDone(matches) {
  const list = matches ?? [];
  if (list.length === 0) return false;
  return list.every((m) => m.status === "completed" || m.winnerPairId);
}
