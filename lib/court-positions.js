/** @typedef {'left' | 'right'} CourtSide */
/** @typedef {'top' | 'bottom'} CourtHalf */

export function withCourtSide(player, courtSide) {
  return { ...player, courtSide };
}

export function ensureTeamSides(team) {
  return (team ?? []).map((p, i) => ({
    ...p,
    courtSide:
      p.courtSide === "left" || p.courtSide === "right"
        ? p.courtSide
        : i === 0
          ? "right"
          : "left",
  }));
}

/** Even score (0,2,4…) → base on player's RIGHT. Odd (1,3,5…) → player's LEFT. */
export function isEvenScore(score) {
  return (score ?? 0) % 2 === 0;
}

/** Screen slot for the base player given court half and team score. */
export function baseScreenSide(half, score) {
  const even = isEvenScore(score);
  if (half === "top") {
    return even ? "left" : "right";
  }
  return even ? "right" : "left";
}

/**
 * Place base + partner from score parity and facing direction.
 * Top faces down: their right = screen-left when score is even.
 * Bottom faces up: their right = screen-right when score is even.
 */
export function alignTeamToScore(team, basePlayerId, half, score) {
  if (!basePlayerId) return ensureTeamSides(team);
  const baseSide = baseScreenSide(half, score);
  const partnerSide = baseSide === "left" ? "right" : "left";
  return ensureTeamSides(team).map((p) =>
    withCourtSide(p, p.playerId === basePlayerId ? baseSide : partnerSide)
  );
}

export function initDoublesPositions(
  teamA,
  teamB,
  basePlayerA = null,
  basePlayerB = null
) {
  const a0 = teamA[0];
  const a1 = teamA[1];
  const b0 = teamB[0];
  const b1 = teamB[1];
  const baseA = basePlayerA ?? a0?.playerId ?? null;
  const baseB = basePlayerB ?? b0?.playerId ?? null;

  return {
    teamA: alignTeamToScore([a0, a1], baseA, "bottom", 0),
    teamB: alignTeamToScore([b0, b1], baseB, "top", 0),
    basePlayerA: baseA,
    basePlayerB: baseB,
    sidesSwapped: false,
  };
}

export function applyScoreDelta(match, team, delta, currentScores) {
  let scoreA = currentScores.scoreA ?? 0;
  let scoreB = currentScores.scoreB ?? 0;
  let teamA = ensureTeamSides(match.teamA);
  let teamB = ensureTeamSides(match.teamB);
  const swapped = match.sidesSwapped ?? false;

  if (team === "A") {
    scoreA = Math.max(0, scoreA + delta);
    if (delta !== 0 && match.basePlayerA) {
      teamA = alignTeamToScore(
        teamA,
        match.basePlayerA,
        getTeamHalf("A", swapped),
        scoreA
      );
    }
  } else {
    scoreB = Math.max(0, scoreB + delta);
    if (delta !== 0 && match.basePlayerB) {
      teamB = alignTeamToScore(
        teamB,
        match.basePlayerB,
        getTeamHalf("B", swapped),
        scoreB
      );
    }
  }

  return {
    scoreA,
    scoreB,
    teamA,
    teamB,
    basePlayerA: match.basePlayerA,
    basePlayerB: match.basePlayerB,
    sidesSwapped: swapped,
  };
}

/** Set a team's score directly (non-negative integer). */
export function applyScoreValue(match, team, value, currentScores) {
  const parsed = Math.max(0, Math.floor(Number(value)) || 0);
  const scoreA = currentScores.scoreA ?? 0;
  const scoreB = currentScores.scoreB ?? 0;
  const delta = team === "A" ? parsed - scoreA : parsed - scoreB;
  if (delta === 0) {
    return {
      scoreA,
      scoreB,
      teamA: ensureTeamSides(match.teamA),
      teamB: ensureTeamSides(match.teamB),
      basePlayerA: match.basePlayerA,
      basePlayerB: match.basePlayerB,
      sidesSwapped: match.sidesSwapped ?? false,
    };
  }
  return applyScoreDelta(match, team, delta, currentScores);
}

export function getPlayerBySlot(team, courtSide) {
  return ensureTeamSides(team).find((p) => p.courtSide === courtSide);
}

export function getTeamHalf(teamId, sidesSwapped) {
  if (teamId === "A") return sidesSwapped ? "top" : "bottom";
  return sidesSwapped ? "bottom" : "top";
}

export function toggleChangeCourt(match) {
  const sidesSwapped = !match.sidesSwapped;
  let teamA = ensureTeamSides(match.teamA);
  let teamB = ensureTeamSides(match.teamB);

  if (match.basePlayerA) {
    teamA = alignTeamToScore(
      teamA,
      match.basePlayerA,
      getTeamHalf("A", sidesSwapped),
      match.scoreA ?? 0
    );
  }
  if (match.basePlayerB) {
    teamB = alignTeamToScore(
      teamB,
      match.basePlayerB,
      getTeamHalf("B", sidesSwapped),
      match.scoreB ?? 0
    );
  }

  return {
    sidesSwapped,
    teamA,
    teamB,
    scoreA: match.scoreA ?? 0,
    scoreB: match.scoreB ?? 0,
    basePlayerA: match.basePlayerA,
    basePlayerB: match.basePlayerB,
  };
}

/** Attach current scores so server saves never revert to an older stored score. */
export function withCurrentScores(patch, scoreA, scoreB) {
  return {
    ...patch,
    scoreA,
    scoreB,
  };
}

export function getCourtLayout(match) {
  const swapped = !!match.sidesSwapped;
  const bottomTeam = swapped
    ? ensureTeamSides(match.teamB)
    : ensureTeamSides(match.teamA);
  const topTeam = swapped
    ? ensureTeamSides(match.teamA)
    : ensureTeamSides(match.teamB);
  const bottomBase = swapped ? match.basePlayerB : match.basePlayerA;
  const topBase = swapped ? match.basePlayerA : match.basePlayerB;
  const bottomTeamId = swapped ? "B" : "A";
  const topTeamId = swapped ? "A" : "B";
  const bottomScore = swapped ? match.scoreB ?? 0 : match.scoreA ?? 0;
  const topScore = swapped ? match.scoreA ?? 0 : match.scoreB ?? 0;
  const bottomLabel = swapped ? "Team B" : "Team A";
  const topLabel = swapped ? "Team A" : "Team B";

  return {
    swapped,
    bottomTeam,
    topTeam,
    bottomBase,
    topBase,
    bottomTeamId,
    topTeamId,
    bottomScore,
    topScore,
    bottomLabel,
    topLabel,
  };
}

export function scorePositionHint(score) {
  return isEvenScore(score)
    ? "Even score — base on their RIGHT"
    : "Odd score — base on their LEFT";
}
