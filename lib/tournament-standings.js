import { pairDisplayName } from "@/lib/tournament-divisions";
import {
  dedupeRoundRobinMatches,
  expectedRoundRobinMatchCount,
  matchesPerPairInRoundRobin,
  mergeRoundRobinSchedule,
} from "@/lib/tournament-brackets";
import {
  matchCountsForStandings,
  winnerPairIdFromMatch,
} from "@/lib/tournament-live";

export { matchCountsForStandings, winnerPairIdFromMatch };

function enrichStandingStats(stats, expectedPerPair) {
  const avgWinPoints =
    stats.wins > 0 ? stats.pointsInWins / stats.wins : 0;
  const avgLossPoints =
    stats.losses > 0 ? stats.pointsInLosses / stats.losses : 0;
  const played = stats.matchesPlayed ?? 0;

  return {
    ...stats,
    expectedMatches: expectedPerPair,
    matchesRemaining: Math.max(0, expectedPerPair - played),
    winPct:
      played > 0 ? Math.round((stats.wins / played) * 1000) / 10 : 0,
    schedulePct:
      expectedPerPair > 0
        ? Math.round((played / expectedPerPair) * 1000) / 10
        : 0,
    pointDiff: stats.pointsFor - stats.pointsAgainst,
    avgWinPoints: Math.round(avgWinPoints * 10) / 10,
    avgLossPoints: Math.round(avgLossPoints * 10) / 10,
    tieBreaker:
      Math.round(
        (stats.wins + (avgWinPoints + avgLossPoints) / 2) * 100
      ) / 100,
  };
}

export function compareStandings(a, b) {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.tieBreaker !== a.tieBreaker) return b.tieBreaker;
  if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
  return b.winPct - a.winPct;
}

export function computeBracketStandings(pairMap, matches, { expectedPerPair } = {}) {
  const expected =
    expectedPerPair ??
    (pairMap.size > 0 ? matchesPerPairInRoundRobin(pairMap.size) : 0);
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
    if (!matchCountsForStandings(m)) continue;
    const a = stats.get(m.pairAId);
    const b = stats.get(m.pairBId);
    if (!a || !b) continue;

    const scoreA = m.scoreA ?? 0;
    const scoreB = m.scoreB ?? 0;
    const winner = winnerPairIdFromMatch(m);

    a.pointsFor += scoreA;
    a.pointsAgainst += scoreB;
    b.pointsFor += scoreB;
    b.pointsAgainst += scoreA;
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;

    if (winner === m.pairAId) {
      a.wins += 1;
      a.pointsInWins += scoreA;
      b.losses += 1;
      b.pointsInLosses += scoreB;
    } else if (winner === m.pairBId) {
      b.wins += 1;
      b.pointsInWins += scoreB;
      a.losses += 1;
      a.pointsInLosses += scoreA;
    }
  }

  return [...stats.values()]
    .map((row) => enrichStandingStats(row, expected))
    .sort(compareStandings);
}

/**
 * #1 from the highest win total always advances.
 * #2 from the next win total advances; tiebreak by TB then +/−.
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

export function evaluateBracketPoolPlay(bracket, pairById) {
  const pairMap = new Map();
  for (const id of bracket.pairIds ?? []) {
    const p = pairById.get(id);
    if (p) pairMap.set(id, p);
  }

  const pairCount = bracket.pairIds?.length ?? 0;
  const expectedPerPair = matchesPerPairInRoundRobin(pairCount);
  const expectedTotal = expectedRoundRobinMatchCount(pairCount);
  const matches = mergeRoundRobinSchedule(bracket.matches, bracket.pairIds);
  const standings = computeBracketStandings(pairMap, matches, {
    expectedPerPair,
  });
  const finishedMatches = matches.filter((m) => matchCountsForStandings(m)).length;
  const everyPairDone = standings.every(
    (r) => r.matchesPlayed >= expectedPerPair
  );
  const poolComplete =
    expectedTotal > 0 &&
    finishedMatches >= expectedTotal &&
    everyPairDone &&
    matches.length >= expectedTotal;

  return {
    matches,
    standings,
    poolComplete,
    expectedTotal,
    expectedPerPair,
    finishedMatches,
    matchesRemaining: Math.max(0, expectedTotal - finishedMatches),
  };
}

export function refreshBracketStandings(bracket, pairById) {
  const evaluated = evaluateBracketPoolPlay(bracket, pairById);
  const advancedPairIds = evaluated.poolComplete
    ? pickAdvancedPairIds(evaluated.standings, true)
    : bracket.advancedPairIds ?? [];

  return {
    ...bracket,
    matches: evaluated.matches,
    standings: evaluated.standings,
    advancedPairIds,
    poolComplete: evaluated.poolComplete,
    roundRobinMeta: {
      pairCount: bracket.pairIds?.length ?? 0,
      matchCount: evaluated.matches.length,
      matchesPerPair: evaluated.expectedPerPair,
      finishedMatches: evaluated.finishedMatches,
      matchesRemaining: evaluated.matchesRemaining,
    },
  };
}

export function allRoundRobinMatchesDone(bracketOrMatches, pairIds) {
  if (Array.isArray(bracketOrMatches)) {
    const ids = pairIds ?? [];
    const matches = mergeRoundRobinSchedule(bracketOrMatches, ids);
    const expected = expectedRoundRobinMatchCount(ids.length);
    const finished = matches.filter((m) => matchCountsForStandings(m)).length;
    return expected > 0 && finished >= expected;
  }
  return Boolean(bracketOrMatches?.poolComplete);
}
