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

/** Round-robin: each pair plays every other pair once. */
export function generateRoundRobinMatches(pairIds) {
  const uniqueIds = [...new Set(pairIds)];
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
  return matches;
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

    const pairIds = [...new Set(chunk.map((p) => p.id))];
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
      matches: generateRoundRobinMatches(pairIds),
      standings: [],
      advancedPairIds: [],
    });
  }

  return brackets;
}
