import { compareStandings } from "@/lib/tournament-standings";

const QUARTERFINAL_SIZE = 8;

function finisherFromRow(bracket, row, rank) {
  return {
    pairId: row.pairId,
    name: row.name,
    rank,
    bracketId: bracket.id,
    bracketLabel: bracket.label,
    wins: row.wins,
    losses: row.losses,
    pointDiff: row.pointDiff,
    tournamentPoints: row.tournamentPoints,
    tieBreaker: row.tieBreaker,
    winPct: row.winPct,
  };
}

export function getBracketFinishers(bracket) {
  return (bracket.standings ?? []).map((row, i) =>
    finisherFromRow(bracket, row, i + 1)
  );
}

function sortCandidates(list) {
  return [...list].sort(compareStandings);
}

/**
 * 4-bracket quarterfinal cross-over:
 * A1 vs C2, A2 vs C1, B1 vs D2, B2 vs D1
 */
export function buildFourBracketQuarterfinals(brackets) {
  const ordered = [...brackets].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  if (ordered.length !== 4) return [];

  const rank = (bracketIndex, place) =>
    getBracketFinishers(ordered[bracketIndex])[place - 1] ?? null;

  return [
    {
      id: "qf-ac-1",
      label: "Bracket A #1 vs Bracket C #2",
      pairA: rank(0, 1),
      pairB: rank(2, 2),
    },
    {
      id: "qf-ac-2",
      label: "Bracket A #2 vs Bracket C #1",
      pairA: rank(0, 2),
      pairB: rank(2, 1),
    },
    {
      id: "qf-bd-1",
      label: "Bracket B #1 vs Bracket D #2",
      pairA: rank(1, 1),
      pairB: rank(3, 2),
    },
    {
      id: "qf-bd-2",
      label: "Bracket B #2 vs Bracket D #1",
      pairA: rank(1, 2),
      pairB: rank(3, 1),
    },
  ].filter((m) => m.pairA && m.pairB);
}

export function advancementRuleSummary(bracketCount) {
  switch (bracketCount) {
    case 5:
      return "5 brackets → Top 1 from each bracket + 3 best 2nd-place wildcards (8 teams).";
    case 4:
      return "4 brackets → Top 2 from each bracket (8 teams). Quarterfinals: A1 vs C2, A2 vs C1, B1 vs D2, B2 vs D1.";
    case 3:
      return "3 brackets → Top 2 from each bracket + 2 best 3rd-place wildcards (8 teams).";
    case 2:
      return "2 brackets → Top 4 from each bracket (8 teams).";
    case 1:
      return "1 bracket → Top 8 overall (8 teams).";
    default:
      if (bracketCount > 5) {
        return `${bracketCount} brackets → Top 1 from each + best 2nd-place wildcards to fill 8 teams.`;
      }
      return `${bracketCount} bracket(s) → fill 8 quarterfinal spots by record.`;
  }
}

export function computeDivisionAdvancement(divisionSetup) {
  const brackets = divisionSetup.brackets ?? [];
  const bracketCount = brackets.length;
  const allComplete =
    bracketCount > 0 && brackets.every((b) => b.poolComplete);

  if (!allComplete) {
    return {
      ready: false,
      bracketCount,
      ruleSummary: advancementRuleSummary(bracketCount),
      autoQualifiers: [],
      wildcards: [],
      allQualified: [],
      quarterfinals: [],
    };
  }

  const byBracket = brackets.map((bracket) => ({
    bracket,
    finishers: getBracketFinishers(bracket),
  }));

  let autoQualifiers = [];
  let wildcardPool = [];
  let wildcardCount = 0;

  if (bracketCount === 5) {
    autoQualifiers = byBracket
      .map(({ bracket, finishers }) =>
        finishers[0] ? { ...finishers[0], slot: "auto" } : null
      )
      .filter(Boolean);
    wildcardPool = byBracket
      .map(({ finishers }) => finishers[1])
      .filter(Boolean);
    wildcardCount = QUARTERFINAL_SIZE - autoQualifiers.length;
  } else if (bracketCount === 4) {
    autoQualifiers = byBracket.flatMap(({ finishers }) =>
      [finishers[0], finishers[1]]
        .filter(Boolean)
        .map((f) => ({ ...f, slot: "auto" }))
    );
    wildcardCount = 0;
  } else if (bracketCount === 3) {
    autoQualifiers = byBracket.flatMap(({ finishers }) =>
      [finishers[0], finishers[1]]
        .filter(Boolean)
        .map((f) => ({ ...f, slot: "auto" }))
    );
    wildcardPool = byBracket
      .map(({ finishers }) => finishers[2])
      .filter(Boolean);
    wildcardCount = QUARTERFINAL_SIZE - autoQualifiers.length;
  } else if (bracketCount === 2) {
    autoQualifiers = byBracket.flatMap(({ finishers }) =>
      finishers
        .slice(0, 4)
        .map((f) => ({ ...f, slot: "auto" }))
    );
    wildcardCount = Math.max(0, QUARTERFINAL_SIZE - autoQualifiers.length);
    if (wildcardCount > 0) {
      wildcardPool = byBracket.flatMap(({ finishers }) => finishers.slice(4));
    }
  } else if (bracketCount === 1) {
    autoQualifiers = (byBracket[0]?.finishers ?? [])
      .slice(0, QUARTERFINAL_SIZE)
      .map((f) => ({ ...f, slot: "auto" }));
    wildcardCount = 0;
  } else if (bracketCount > 5) {
    autoQualifiers = byBracket
      .map(({ finishers }) =>
        finishers[0] ? { ...finishers[0], slot: "auto" } : null
      )
      .filter(Boolean);
    wildcardPool = byBracket
      .map(({ finishers }) => finishers[1])
      .filter(Boolean);
    wildcardCount = QUARTERFINAL_SIZE - autoQualifiers.length;
  } else {
    autoQualifiers = sortCandidates(
      byBracket.flatMap(({ finishers }) => finishers)
    )
      .slice(0, QUARTERFINAL_SIZE)
      .map((f) => ({ ...f, slot: "auto" }));
    wildcardCount = 0;
  }

  const wildcards = sortCandidates(wildcardPool)
    .slice(0, wildcardCount)
    .map((f) => ({ ...f, slot: "wildcard" }));

  const allQualified = [...autoQualifiers, ...wildcards].slice(
    0,
    QUARTERFINAL_SIZE
  );

  const quarterfinals =
    bracketCount === 4 ? buildFourBracketQuarterfinals(brackets) : [];

  return {
    ready: true,
    bracketCount,
    ruleSummary: advancementRuleSummary(bracketCount),
    autoQualifiers,
    wildcards,
    allQualified,
    quarterfinals,
  };
}

export function refreshDivisionAdvancement(divisionSetup) {
  const advancement = computeDivisionAdvancement(divisionSetup);
  const advancedSet = new Set(
    advancement.allQualified.map((q) => q.pairId)
  );

  const brackets = (divisionSetup.brackets ?? []).map((bracket) => ({
    ...bracket,
    advancedPairIds: bracket.poolComplete
      ? (bracket.standings ?? [])
          .filter((s) => advancedSet.has(s.pairId))
          .map((s) => s.pairId)
      : [],
  }));

  return {
    ...divisionSetup,
    brackets,
    advancement,
    divisionPoolComplete: advancement.ready,
  };
}
