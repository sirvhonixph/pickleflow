import { CATEGORY_ORDER, categoryLabel } from "@/lib/categories";
import { initDoublesPositions } from "@/lib/court-positions";

/** Only these cross-level brackets are allowed. */
export const ADJACENT_BRACKETS = [
  ["beginner", "novice"],
  ["novice", "intermediate"],
  ["intermediate", "pro"],
];

function byFifo(a, b) {
  return (a.queuedAt ?? 0) - (b.queuedAt ?? 0);
}

/** 50% flip which side of the court each pair starts on. */
function maybeSwapTeamSides(teamA, teamB) {
  if (Math.random() < 0.5) {
    return { teamA: teamB, teamB: teamA };
  }
  return { teamA, teamB };
}

/** 50% swap partner order (left/right on court). */
function maybeSwapPartners(team) {
  if (team.length < 2 || Math.random() >= 0.5) return team;
  return [team[1], team[0]];
}

/**
 * From four FIFO players, form two pairs then randomly assign to Team A/B
 * and randomize partner side on court.
 */
function assignTeamsFromFour(players) {
  const sorted = normalizeQueue(players).sort(byFifo);
  let pairOne = sorted.slice(0, 2);
  let pairTwo = sorted.slice(2, 4);
  ({ teamA: pairOne, teamB: pairTwo } = maybeSwapTeamSides(pairOne, pairTwo));
  return {
    teamA: maybeSwapPartners(pairOne),
    teamB: maybeSwapPartners(pairTwo),
  };
}

export function normalizeCategory(cat) {
  const c = String(cat ?? "beginner").toLowerCase().trim();
  return CATEGORY_ORDER.includes(c) ? c : "beginner";
}

function normalizeQueue(queue) {
  return [...queue].map((p) => ({
    ...p,
    category: normalizeCategory(p.category),
  }));
}

function countByCategory(sorted) {
  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0]));
  for (const p of sorted) {
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }
  return counts;
}

function oldestWaitInCategory(sorted, cat) {
  const inCat = sorted.filter((p) => p.category === cat);
  if (!inCat.length) return Infinity;
  return Math.min(...inCat.map((p) => p.queuedAt ?? 0));
}

function isAdjacentPair(a, b) {
  return ADJACENT_BRACKETS.some(
    ([low, high]) =>
      (low === a && high === b) || (low === b && high === a)
  );
}

function hasOddCount(sorted, cat) {
  return sorted.filter((p) => p.category === cat).length % 2 === 1;
}

/** Longest-waiting category among those with enough players for a perfect 4. */
function pickPerfectFour(sorted) {
  const eligible = CATEGORY_ORDER.filter(
    (cat) => sorted.filter((p) => p.category === cat).length >= 4
  );
  if (!eligible.length) return null;

  eligible.sort(
    (a, b) => oldestWaitInCategory(sorted, a) - oldestWaitInCategory(sorted, b)
  );

  const cat = eligible[0];
  return sorted.filter((p) => p.category === cat).sort(byFifo).slice(0, 4);
}

/**
 * Cross-level only when a category has an odd count (1, 3, 5…).
 * Brackets: beginner↔novice, novice↔intermediate, intermediate↔pro.
 */
function pickAdjacentFour(sorted) {
  const brackets = ADJACENT_BRACKETS.filter(
    ([low, high]) =>
      (hasOddCount(sorted, low) || hasOddCount(sorted, high)) &&
      sorted.filter((p) => p.category === low || p.category === high).length >=
        4
  );

  if (!brackets.length) return null;

  brackets.sort((a, b) => {
    const waitA = Math.min(
      oldestWaitInCategory(sorted, a[0]),
      oldestWaitInCategory(sorted, a[1])
    );
    const waitB = Math.min(
      oldestWaitInCategory(sorted, b[0]),
      oldestWaitInCategory(sorted, b[1])
    );
    return waitA - waitB;
  });

  const [low, high] = brackets[0];
  return sorted
    .filter((p) => p.category === low || p.category === high)
    .sort(byFifo)
    .slice(0, 4);
}

/**
 * Perfect matchmaking (FIFO):
 * 1) Four same level (beginner vs beginner, etc.)
 * 2) If odd count in a level, adjacent bracket only (beginner vs novice, etc.)
 */
export function pickNextFour(queue) {
  const sorted = normalizeQueue(queue).sort(byFifo);
  if (sorted.length < 4) return null;

  return pickPerfectFour(sorted) ?? pickAdjacentFour(sorted);
}

function slashLabel(lower, upper) {
  return `${categoryLabel(lower)} / ${categoryLabel(upper)}`;
}

function sameLevelLabel(cat) {
  return `${categoryLabel(cat)} vs ${categoryLabel(cat)}`;
}

/**
 * Odd-count adjacent formations:
 * - Mixed: Novice/Intermediate vs Novice/Intermediate (1+1 each team)
 * - Level lines: Novice vs Novice on one side, Intermediate vs Intermediate other (3+1)
 * - Level split: 2 lower vs 2 upper (2+2)
 */
function formAdjacentDoubles(lowPlayers, highPlayers, lower, upper) {
  const ln = categoryLabel(lower);
  const hn = categoryLabel(upper);
  const slash = slashLabel(lower, upper);

  if (lowPlayers.length === 2 && highPlayers.length === 2) {
    return {
      teamA: [lowPlayers[0], highPlayers[0]],
      teamB: [lowPlayers[1], highPlayers[1]],
      matchBracket: `${slash} vs ${slash}`,
      formation: "mixed",
    };
  }

  if (lowPlayers.length === 3 && highPlayers.length === 1) {
    return {
      teamA: [lowPlayers[0], highPlayers[0]],
      teamB: [lowPlayers[1], lowPlayers[2]],
      matchBracket: `${slash} vs ${ln} vs ${ln}`,
      formation: "mixed-vs-lower-pair",
    };
  }

  if (lowPlayers.length === 1 && highPlayers.length === 3) {
    return {
      teamA: [lowPlayers[0], highPlayers[0]],
      teamB: [highPlayers[1], highPlayers[2]],
      matchBracket: `${slash} vs ${hn} vs ${hn}`,
      formation: "mixed-vs-upper-pair",
    };
  }

  if (lowPlayers.length >= 2 && highPlayers.length >= 2) {
    return {
      teamA: lowPlayers.slice(0, 2),
      teamB: highPlayers.slice(0, 2),
      matchBracket: `${ln} vs ${hn}`,
      formation: "level-split",
    };
  }

  return null;
}

/** Rebuild teams when host toggles mixed vs level-split (2+2 adjacent only). */
export function applyAdjacentFormation(players, formation) {
  const normalized = normalizeQueue(players);
  const cats = [...new Set(normalized.map((p) => p.category))].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );
  if (cats.length !== 2 || !isAdjacentPair(cats[0], cats[1])) {
    return formDoublesMatch(players);
  }
  const [lower, upper] = cats;
  const lowPlayers = normalized
    .filter((p) => p.category === lower)
    .sort(byFifo);
  const highPlayers = normalized
    .filter((p) => p.category === upper)
    .sort(byFifo);

  if (lowPlayers.length === 2 && highPlayers.length === 2) {
    let layout;
    if (formation === "level-split") {
      layout = {
        teamA: lowPlayers,
        teamB: highPlayers,
        matchBracket: `${categoryLabel(lower)} vs ${categoryLabel(upper)}`,
        formation: "level-split",
      };
    } else {
      layout = formAdjacentDoubles(lowPlayers, highPlayers, lower, upper);
    }
    if (layout) {
      return {
        ...initDoublesPositions(layout.teamA, layout.teamB),
        startedAt: Date.now(),
        scoreA: 0,
        scoreB: 0,
        matchBracket: layout.matchBracket,
        formation: layout.formation,
      };
    }
  }

  return formDoublesMatch(players);
}

export function getMatchBracket(players) {
  const normalized = normalizeQueue(players);
  const cats = [...new Set(normalized.map((p) => p.category))];

  if (cats.length === 1) {
    return {
      type: "perfect",
      label: sameLevelLabel(cats[0]),
      categories: cats,
    };
  }

  if (cats.length === 2) {
    const [lower, upper] = cats.sort(
      (x, y) => CATEGORY_ORDER.indexOf(x) - CATEGORY_ORDER.indexOf(y)
    );
    if (isAdjacentPair(lower, upper)) {
      const lowP = normalized.filter((p) => p.category === lower);
      const highP = normalized.filter((p) => p.category === upper);
      const layout = formAdjacentDoubles(
        lowP.sort(byFifo),
        highP.sort(byFifo),
        lower,
        upper
      );
      return {
        type: "adjacent",
        label: layout?.matchBracket ?? `${categoryLabel(lower)} vs ${categoryLabel(upper)}`,
        lower,
        upper,
        categories: [lower, upper],
        formation: layout?.formation ?? null,
        canToggleFormation:
          lowP.length === 2 && highP.length === 2,
      };
    }
  }

  return { type: "invalid", label: "Invalid bracket", categories: cats };
}

export function formDoublesMatch(players) {
  const normalized = normalizeQueue(players).sort(byFifo);
  const bracket = getMatchBracket(normalized);

  if (bracket.type === "perfect") {
    const { teamA, teamB } = assignTeamsFromFour(normalized);
    return {
      ...initDoublesPositions(teamA, teamB),
      startedAt: Date.now(),
      scoreA: 0,
      scoreB: 0,
      matchBracket: bracket.label,
      formation: "perfect",
    };
  }

  if (bracket.type === "adjacent") {
    const { lower, upper } = bracket;
    const lowPlayers = normalized
      .filter((p) => p.category === lower)
      .sort(byFifo);
    const highPlayers = normalized
      .filter((p) => p.category === upper)
      .sort(byFifo);

    const layout = formAdjacentDoubles(
      lowPlayers,
      highPlayers,
      lower,
      upper
    );

    if (layout) {
      const { teamA, teamB } = maybeSwapTeamSides(layout.teamA, layout.teamB);
      return {
        ...initDoublesPositions(
          maybeSwapPartners(teamA),
          maybeSwapPartners(teamB)
        ),
        startedAt: Date.now(),
        scoreA: 0,
        scoreB: 0,
        matchBracket: layout.matchBracket,
        formation: layout.formation,
      };
    }
  }

  const { teamA, teamB } = assignTeamsFromFour(normalized);
  return {
    ...initDoublesPositions(teamA, teamB),
    startedAt: Date.now(),
    scoreA: 0,
    scoreB: 0,
    matchBracket: bracket.label,
    formation: "fallback",
  };
}

/** Alternates that keep the same perfect or adjacent bracket. */
export function filterAlternatesForBracket(alternates, bracket) {
  if (!bracket || bracket.type === "invalid") return alternates;
  if (bracket.type === "perfect") {
    return alternates.filter((p) => p.category === bracket.categories[0]);
  }
  if (bracket.type === "adjacent") {
    const allowed = new Set(bracket.categories);
    return alternates.filter((p) => allowed.has(normalizeCategory(p.category)));
  }
  return alternates;
}

/** Why idle auto-match has not started (for UI). */
export function autoMatchWaitReason(queue, availableCount) {
  if (availableCount < 4) {
    return `Need ${4 - availableCount} more available player${availableCount === 3 ? "" : "s"} (others may be on court).`;
  }
  if (pickNextFour(queue)) return null;
  const sorted = normalizeQueue(queue);
  const counts = countByCategory(sorted);
  const hasOdd = CATEGORY_ORDER.some((c) => counts[c] % 2 === 1);
  if (!hasOdd) {
    return "Need 4 in the same skill level, or an odd count for a mixed cross-level bracket.";
  }
  return "Not enough players in a valid skill bracket (same level or adjacent levels only).";
}

export function removeFromQueue(queue, playerIds) {
  const set = new Set(playerIds);
  return queue.filter((p) => !set.has(p.playerId));
}

/** All court assignments for a player (can be queued on multiple courts). */
export function getPlayerCourtStatuses(event, playerId) {
  const statuses = [];
  for (const court of event.courts ?? []) {
    if (court.queue?.some((q) => q.playerId === playerId)) {
      statuses.push({
        courtId: court.id,
        courtName: court.name,
        status: "queued",
      });
    }
    if (court.status === "pending" && court.pendingMatch) {
      const onPending = [
        ...(court.pendingMatch.teamA ?? []),
        ...(court.pendingMatch.teamB ?? []),
      ].some((p) => p.playerId === playerId);
      if (onPending) {
        statuses.push({
          courtId: court.id,
          courtName: court.name,
          status: "pending",
        });
      }
    }
    const match = court.currentMatch;
    if (match && court.status === "live") {
      const onCourt = [...(match.teamA ?? []), ...(match.teamB ?? [])].some(
        (p) => p.playerId === playerId
      );
      if (onCourt) {
        statuses.push({
          courtId: court.id,
          courtName: court.name,
          status: "playing",
        });
      }
    }
  }
  return statuses;
}

/** Primary status: playing first, else first queue. */
export function getPlayerCourtStatus(event, playerId) {
  const all = getPlayerCourtStatuses(event, playerId);
  return (
    all.find((s) => s.status === "playing") ??
    all.find((s) => s.status === "pending") ??
    all[0] ??
    null
  );
}
