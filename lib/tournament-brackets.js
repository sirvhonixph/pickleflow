import {
  isMatchComplete,
  isMatchLive,
  winnerPairIdFromMatch,
} from "@/lib/tournament-live";

/** Split N items across K buckets as evenly as possible (e.g. 20 pairs → 4 courts → [5,5,5,5]). */
export function distributeEvenly(total, bucketCount) {
  if (bucketCount < 1) return [];
  const base = Math.floor(total / bucketCount);
  const remainder = total % bucketCount;
  return Array.from({ length: bucketCount }, (_, i) =>
    i < remainder ? base + 1 : base
  );
}

/**
 * Plan brackets: pairs per bracket = ceil(pairCount / courtCount).
 * Example: 20 pairs, 4 courts → 5 per bracket → 4 brackets (A–D).
 */
export function planBracketDistribution(pairCount, courtCount) {
  if (courtCount < 1) {
    throw new Error("Add at least one court before running the calculator.");
  }
  if (pairCount < 2) {
    throw new Error("Need at least 2 pairs in this division.");
  }

  const distribution = distributeEvenly(pairCount, courtCount);
  const pairsPerBracket = Math.max(...distribution);
  const bracketCount = distribution.length;

  return {
    pairCount,
    courtCount,
    bracketCount,
    pairsPerBracket,
    distribution,
    formulaText: `${pairCount} ÷ ${courtCount} = ${pairsPerBracket} pairs per bracket (${bracketCount} brackets)`,
  };
}

const BRACKET_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function bracketLabel(index) {
  return `Bracket ${BRACKET_LETTERS[index] ?? index + 1}`;
}

/** n pairs → each plays (n−1) games; bracket has n×(n−1)/2 total matches. */
export function expectedRoundRobinMatchCount(pairCount) {
  if (pairCount < 2) return 0;
  return (pairCount * (pairCount - 1)) / 2;
}

export function matchesPerPairInRoundRobin(pairCount) {
  return Math.max(0, pairCount - 1);
}

/** Keep one row per pair-up; prefer completed/live over empty duplicates. */
export function dedupeRoundRobinMatches(matches) {
  const byKey = new Map();
  const rank = (m) => {
    if (isMatchComplete(m)) return 3;
    if (isMatchLive(m)) return 2;
    if ((m.scoreA ?? 0) > 0 || (m.scoreB ?? 0) > 0 || m.playedAt) return 1;
    return 0;
  };

  for (const m of matches ?? []) {
    if (!m.pairAId || !m.pairBId) continue;
    const key = [m.pairAId, m.pairBId].sort().join("|");
    const prev = byKey.get(key);
    if (!prev || rank(m) > rank(prev)) {
      byKey.set(key, m);
    }
  }
  return [...byKey.values()];
}

/** Round-robin: each pair plays every other pair exactly once. */
export function generateRoundRobinMatches(pairIds) {
  const uniqueIds = [...new Set(pairIds.filter(Boolean))];
  const matches = [];
  const seen = new Set();

  for (let i = 0; i < uniqueIds.length; i++) {
    for (let j = i + 1; j < uniqueIds.length; j++) {
      const key = [uniqueIds[i], uniqueIds[j]].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      matches.push({
        id: `rr-${uniqueIds[i]}-${uniqueIds[j]}`,
        pairAId: uniqueIds[i],
        pairBId: uniqueIds[j],
        scoreA: 0,
        scoreB: 0,
        winnerPairId: null,
        status: "scheduled",
        playedAt: null,
      });
    }
  }
  return dedupeRoundRobinMatches(matches);
}

/** Promote scored games to completed so standings count them. */
export function normalizeStoredMatch(m) {
  if (!m?.pairAId || !m.pairBId) return m;
  const scoreA = m.scoreA ?? 0;
  const scoreB = m.scoreB ?? 0;
  const hasScore = scoreA > 0 || scoreB > 0;
  const winner = winnerPairIdFromMatch(m);

  if (winner && m.status !== "live") {
    return {
      ...m,
      status: "completed",
      winnerPairId: winner,
      playedAt: m.playedAt ?? Date.now(),
    };
  }

  if (hasScore && m.playedAt != null && winner) {
    return {
      ...m,
      status: "completed",
      winnerPairId: winner,
    };
  }

  return m;
}

/** Full RR schedule merged with saved results (never drop unplayed pairings). */
export function mergeRoundRobinSchedule(existingMatches, pairIds) {
  const ids = [...new Set((pairIds ?? []).filter(Boolean))];
  const canonical = generateRoundRobinMatches(ids);
  const byKey = new Map();
  for (const m of dedupeRoundRobinMatches(existingMatches ?? [])) {
    const key = [m.pairAId, m.pairBId].sort().join("|");
    byKey.set(key, normalizeStoredMatch(m));
  }
  return canonical.map((template) => {
    const key = [template.pairAId, template.pairBId].sort().join("|");
    const saved = byKey.get(key);
    return saved ? normalizeStoredMatch(saved) : template;
  });
}

export function assignPairsToBrackets(pairs, courts, distribution, divisionId) {
  const sorted = [...pairs].sort(
    (a, b) => (a.registeredAt ?? 0) - (b.registeredAt ?? 0)
  );
  const brackets = [];
  let offset = 0;

  for (let i = 0; i < distribution.length; i++) {
    const size = distribution[i];
    const chunk = sorted.slice(offset, offset + size);
    offset += size;
    const court = courts[i];
    if (!court) continue;

    const pairIds = [...new Set(chunk.map((p) => p.id).filter(Boolean))];
    const matches = generateRoundRobinMatches(pairIds);
    brackets.push({
      id: `bracket-${divisionId}-${court.id}-${i}`,
      label: bracketLabel(i),
      courtId: court.id,
      courtName: court.name,
      pairIds,
      pairs: chunk.map((p) => ({
        id: p.id,
        name: p.displayName ?? p.teamName,
      })),
      matches,
      roundRobinMeta: {
        pairCount: pairIds.length,
        matchCount: matches.length,
        matchesPerPair: matchesPerPairInRoundRobin(pairIds.length),
      },
      standings: [],
      advancedPairIds: [],
    });
  }

  return brackets;
}
