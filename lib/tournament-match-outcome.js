/** Default score when a pair wins because the other did not show. */
export const DEFAULT_FORFEIT_WIN_SCORE = 11;
export const DEFAULT_FORFEIT_LOSS_SCORE = 0;

/** Winner from explicit field or decisive scores. */
export function inferWinnerPairId(match) {
  if (!match?.pairAId || !match?.pairBId) return null;
  if (match.winnerPairId) return match.winnerPairId;
  const scoreA = match.scoreA ?? 0;
  const scoreB = match.scoreB ?? 0;
  if (scoreA > scoreB) return match.pairAId;
  if (scoreB > scoreA) return match.pairBId;
  return null;
}

export function hasDecisiveRoundRobinScore(match) {
  const scoreA = match?.scoreA ?? 0;
  const scoreB = match?.scoreB ?? 0;
  return (
    scoreA !== scoreB && (scoreA > 0 || scoreB > 0) && !!inferWinnerPairId(match)
  );
}

export function isRoundRobinMatchLocked(match) {
  return match?.resultLocked === true;
}

/** Host may lock only after a real final result exists. */
export function canLockRoundRobinMatch(match) {
  if (!match?.pairAId || !match?.pairBId) return false;
  if (isRoundRobinMatchLocked(match)) return false;
  if (match.status === "live") return false;
  return hasRecordedRoundRobinResult(sealRoundRobinMatchRow(match));
}

export function lockRoundRobinMatchRow(match) {
  const sealed = sealRoundRobinMatchRow(match);
  if (!hasRecordedRoundRobinResult(sealed)) {
    throw new Error("Only completed matches with a final result can be locked.");
  }
  return {
    ...sealed,
    status: "completed",
    resultLocked: true,
    lockedAt: match.lockedAt ?? Date.now(),
  };
}

/** Valid finished result — never drop from merge or allow a repeat pairing. */
export function hasRecordedRoundRobinResult(match) {
  if (!match?.pairAId || !match?.pairBId) return false;
  if (isRoundRobinMatchLocked(match)) return true;
  if (match.status === "live") return false;
  if (isForfeitMatch(match)) return true;
  if (match.status === "completed" && match.winnerPairId) return true;
  if (match.playedAt != null && match.winnerPairId) return true;
  if (match.status !== "live" && hasDecisiveRoundRobinScore(match)) return true;
  const scoreA = match.scoreA ?? 0;
  const scoreB = match.scoreB ?? 0;
  if (scoreA === 0 && scoreB === 0) return false;
  if (scoreA === scoreB) return false;
  return match.status === "completed" || match.playedAt != null;
}

export function isForfeitMatch(match) {
  return match?.completionType === "forfeit" && !!match?.winnerPairId;
}

/** 0–0 or finished without a valid winner — must be played again. */
export function isVoidMatchResult(match) {
  if (!match?.pairAId || !match?.pairBId) return false;
  if (isRoundRobinMatchLocked(match)) return false;
  if (isForfeitMatch(match)) return false;
  if (match.status === "live") return false;

  const scoreA = match.scoreA ?? 0;
  const scoreB = match.scoreB ?? 0;
  const wasClosed =
    match.status === "completed" || match.playedAt != null || scoreA > 0 || scoreB > 0;

  if (!wasClosed) return false;
  if (hasDecisiveRoundRobinScore(match)) return false;
  if (scoreA === 0 && scoreB === 0) return true;
  if (!match.winnerPairId) return true;
  return false;
}

/** Promote decisive scores to a locked completed row (survives merge / refresh). */
export function sealRoundRobinMatchRow(match) {
  if (!match?.pairAId || !match?.pairBId) return match;
  if (isRoundRobinMatchLocked(match)) return lockRoundRobinMatchRow(match);
  if (isForfeitMatch(match)) return match;

  if (match.status === "live" && hasDecisiveRoundRobinScore(match)) {
    const winner = inferWinnerPairId(match);
    return {
      ...match,
      status: "completed",
      winnerPairId: winner,
      playedAt: match.playedAt ?? Date.now(),
    };
  }

  if (match.status === "live") return match;
  if (hasRecordedRoundRobinResult(match)) {
    const winner = inferWinnerPairId(match);
    return {
      ...match,
      status: "completed",
      winnerPairId: winner ?? match.winnerPairId,
      playedAt: match.playedAt ?? Date.now(),
    };
  }
  if (hasDecisiveRoundRobinScore(match)) {
    const winner = inferWinnerPairId(match);
    return {
      ...match,
      status: "completed",
      winnerPairId: winner,
      playedAt: match.playedAt ?? Date.now(),
    };
  }
  return match;
}

/** Needs a real result or default win — show Start on court. */
export function needsRematch(match) {
  return isVoidMatchResult(match);
}

/** Force completed status on every recorded row (fixes stuck status:live). */
export function sealAllBracketMatchRows(matches) {
  return (matches ?? []).map((m) => {
    if (isRoundRobinMatchLocked(m)) {
      return lockRoundRobinMatchRow(m);
    }
    if (m?.status === "live") {
      return m;
    }
    const sealed = sealRoundRobinMatchRow(m);
    if (hasRecordedRoundRobinResult(sealed)) {
      return { ...sealed, status: "completed" };
    }
    return sealed;
  });
}

/** Only void / invalid rows may reopen — recorded / locked results are permanent. */
export function reopenMatchForRematch(match) {
  if (isRoundRobinMatchLocked(match)) {
    return lockRoundRobinMatchRow(match);
  }
  const sealed = sealRoundRobinMatchRow(match);
  if (hasRecordedRoundRobinResult(sealed)) {
    return sealed;
  }
  return {
    ...match,
    status: "scheduled",
    scoreA: 0,
    scoreB: 0,
    winnerPairId: null,
    playedAt: null,
    startedAt: undefined,
    completionType: undefined,
    forfeitLoserPairId: undefined,
  };
}

export function buildForfeitCompletedMatch(match, winnerPairId) {
  if (winnerPairId !== match.pairAId && winnerPairId !== match.pairBId) {
    throw new Error("Winner must be one of the two pairs in this match.");
  }
  const scoreA =
    winnerPairId === match.pairAId
      ? DEFAULT_FORFEIT_WIN_SCORE
      : DEFAULT_FORFEIT_LOSS_SCORE;
  const scoreB =
    winnerPairId === match.pairBId
      ? DEFAULT_FORFEIT_WIN_SCORE
      : DEFAULT_FORFEIT_LOSS_SCORE;

  return {
    ...match,
    status: "completed",
    winnerPairId,
    scoreA,
    scoreB,
    playedAt: Date.now(),
    completionType: "forfeit",
    forfeitLoserPairId:
      winnerPairId === match.pairAId ? match.pairBId : match.pairAId,
  };
}
