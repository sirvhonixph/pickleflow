import {
  expectedRoundRobinMatchCount,
  planBracketDistribution,
  assignPairsToBrackets,
  mergeRoundRobinSchedule,
  getBracketRoundRobinMatches,
  applyConfirmedResultsToStoredMatches,
  buildPermanentPairingIndex,
  purgePreResetBracketRows,
  pickPreferredRoundRobinRow,
  recordBracketConfirmedResult,
  resolvePermanentPairingRow,
  roundRobinPairKey,
  stabilizeBracketMatches,
  syncBracketConfirmedResults,
  assertDisjointBracketPairIds,
  buildRegeneratedBrackets,
} from "@/lib/tournament-brackets";
import { pairDisplayName, getEventDivisions, pairsInDivision } from "@/lib/tournament-divisions";
import { courtsForDivision } from "@/lib/tournament-court-pools";
import { refreshBracketStandings } from "@/lib/tournament-standings";
import { refreshDivisionAdvancement } from "@/lib/tournament-advancement";
import {
  applyKnockoutMatchPatch,
  ensureDivisionKnockout,
  startQuarterfinalMatches,
} from "@/lib/tournament-knockout";
import {
  ensureTournamentMatchLayout,
  isMatchLive,
  patchNeedsLayoutRefresh,
  resolveLiveMatchLayout,
  validateMatchBasePatch,
} from "@/lib/tournament-live";
import {
  buildForfeitCompletedMatch,
  hasRecordedRoundRobinResult,
  isVoidMatchResult,
  reopenMatchForRematch,
  sealAllBracketMatchRows,
  sealRoundRobinMatchRow,
  isRoundRobinMatchLocked,
  completeAndLockRoundRobinRow,
  hasDecisiveRoundRobinScore,
  inferWinnerPairId,
  isForfeitMatch,
  isPermanentRoundRobinResult,
  lockRoundRobinMatchRow,
  sealPermanentPairingRow,
} from "@/lib/tournament-match-outcome";
import { isKnockoutFullyComplete } from "@/lib/tournament-knockout-ui";
import {
  assertCanBracketDivision,
  assertCanUseCourtsForDivision,
  enrichDivisionCompletion,
  getCourtOccupyingDivisionId,
  syncActiveDivision,
  isDivisionComplete,
  divisionHasMatchProgress,
} from "@/lib/tournament-division-schedule";

function poolBracketsHiddenByKnockout(divSetup) {
  return (
    divSetup.knockout?.initialized &&
    !isKnockoutFullyComplete(divSetup.knockout)
  );
}

function bestRowForPairing(matches, m) {
  const key = roundRobinPairKey(m);
  if (!key) return null;
  let best = null;
  for (const row of matches ?? []) {
    if (roundRobinPairKey(row) !== key) continue;
    best = best ? pickPreferredRoundRobinRow(best, row) : row;
  }
  return best;
}

/** Close an abandoned live row — never wipe a locked/finished pairing. */
function finalizeStuckLiveMatch(m, allMatches = [], permanentIndex = null) {
  const permanent = resolvePermanentPairingRow(permanentIndex, m);
  if (permanent && isPermanentRoundRobinResult(permanent)) {
    return sealPermanentPairingRow(permanent);
  }
  const stored = bestRowForPairing(allMatches, m);
  if (stored && isPermanentRoundRobinResult(stored)) {
    return sealPermanentPairingRow(stored);
  }
  if (isPermanentRoundRobinResult(m)) {
    return sealPermanentPairingRow(m);
  }
  const sealed = sealRoundRobinMatchRow(m);
  if (hasRecordedRoundRobinResult(sealed)) {
    return completeAndLockRoundRobinRow(sealed);
  }

  if (hasDecisiveRoundRobinScore(m)) {
    return completeAndLockRoundRobinRow({
      ...m,
      status: "completed",
      winnerPairId: inferWinnerPairId(m),
      playedAt: m.playedAt ?? Date.now(),
    });
  }

  const scoreA = m.scoreA ?? 0;
  const scoreB = m.scoreB ?? 0;

  if (scoreA > scoreB && m.pairAId) {
    return completeAndLockRoundRobinRow({
      ...m,
      status: "completed",
      winnerPairId: m.pairAId,
      scoreA,
      scoreB,
      playedAt: m.playedAt ?? Date.now(),
    });
  }
  if (scoreB > scoreA && m.pairBId) {
    return completeAndLockRoundRobinRow({
      ...m,
      status: "completed",
      winnerPairId: m.pairBId,
      scoreA,
      scoreB,
      playedAt: m.playedAt ?? Date.now(),
    });
  }
  return {
    ...m,
    status: "scheduled",
    scoreA: 0,
    scoreB: 0,
    winnerPairId: null,
    playedAt: null,
    startedAt: undefined,
    completionType: undefined,
    forfeitLoserPairId: undefined,
    resultLocked: undefined,
    lockedAt: undefined,
  };
}

function releaseCourtRoundRobinBracket(
  bracket,
  { scheduleResetAt, courtId, divisionId, bracketOrRoundId, matchId }
) {
  if (bracket.courtId !== courtId) return bracket;
  const stabilizeOpts = {
    scheduleResetAt,
    bracketId: bracket.id,
  };
  const synced = syncBracketConfirmedResults(bracket);
  const permanentIndex = buildPermanentPairingIndex(
    synced.matches,
    synced.confirmedResults
  );
  const stabilized = stabilizeBracketMatches(synced, stabilizeOpts);

  return stabilizeBracketMatches(
    syncBracketConfirmedResults({
      ...stabilized,
      matches: (stabilized.matches ?? [])
        .filter((m) => {
          if (!isMatchLive(m)) return true;
          if (bracket.id === bracketOrRoundId && m.id === matchId) {
            return true;
          }
          return !resolvePermanentPairingRow(permanentIndex, m);
        })
        .map((m) => {
          const permanent = resolvePermanentPairingRow(permanentIndex, m);
          if (permanent) {
            return sealPermanentPairingRow(permanent);
          }
          if (!isMatchLive(m)) return m;
          if (bracket.id === bracketOrRoundId && m.id === matchId) {
            return m;
          }
          return finalizeStuckLiveMatch(
            m,
            stabilized.matches,
            permanentIndex
          );
        }),
    }),
    stabilizeOpts
  );
}

/** Clear other live matches on this court before starting the requested one. */
export function releaseCourtForNewLive(
  event,
  courtId,
  divisionId,
  bracketOrRoundId,
  matchId,
  { roundId } = {}
) {
  const rid = roundId ?? bracketOrRoundId;
  const divisions = { ...(event.tournamentDivisions ?? {}) };
  const divSetup = divisions[divisionId];
  if (!divSetup) return event;

  let nextDiv = { ...divSetup };

  if (!poolBracketsHiddenByKnockout(nextDiv)) {
    nextDiv = {
      ...nextDiv,
      brackets: (nextDiv.brackets ?? []).map((bracket) =>
        releaseCourtRoundRobinBracket(bracket, {
          scheduleResetAt: nextDiv.scheduleResetAt,
          courtId,
          divisionId,
          bracketOrRoundId,
          matchId,
        })
      ),
    };
  }

  if (nextDiv.knockout?.rounds) {
    nextDiv = {
      ...nextDiv,
      knockout: {
        ...nextDiv.knockout,
        rounds: nextDiv.knockout.rounds.map((round) => ({
          ...round,
          matches: (round.matches ?? []).map((m) => {
            if (m.courtId !== courtId) return m;
            if (!isMatchLive(m)) return m;
            if (round.id === rid && m.id === matchId) {
              return m;
            }
            return finalizeStuckLiveMatch(
              m,
              round.matches ?? [],
              buildPermanentPairingIndex(round.matches ?? [])
            );
          }),
        })),
      },
    };
  }

  divisions[divisionId] = nextDiv;
  return { ...event, tournamentDivisions: divisions };
}

/** Live row the host is scoring on — may differ from reconciled locked canonical row. */
function findLiveRowForCompletion(
  bracket,
  matchId,
  existing,
  target,
  extraRows = []
) {
  const rows = [...(bracket.matches ?? []), ...(extraRows ?? [])];
  const byId = rows.find((m) => m.id === matchId && m.status === "live");
  if (byId) return byId;
  if (existing?.status === "live") return existing;
  const key = roundRobinPairKey(target) || roundRobinPairKey(existing);
  if (!key) return null;
  return (
    rows.find(
      (m) => m.status === "live" && roundRobinPairKey(m) === key
    ) ?? null
  );
}

function scoresMatchRecordedResult(patch, row) {
  if (!row) return false;
  const scoreA = patch.scoreA ?? row.scoreA;
  const scoreB = patch.scoreB ?? row.scoreB;
  if (scoreA === row.scoreA && scoreB === row.scoreB) return true;
  if (scoreA === row.scoreB && scoreB === row.scoreA) return true;
  return false;
}

/** Pick the row that actually has the final score (same view as the schedule UI). */
function resolveRowForLock(bracket, div, matchId, target, existing) {
  const scheduleResetAt = div.scheduleResetAt ?? bracket.scheduleResetAt;
  const merged = getBracketRoundRobinMatches(
    { ...bracket, scheduleResetAt },
    { scheduleResetAt }
  );
  const key =
    (target && roundRobinPairKey(target)) ||
    (existing && roundRobinPairKey(existing)) ||
    null;
  const candidates = [
    target,
    existing,
    merged.find((m) => m.id === matchId),
    key ? merged.find((m) => roundRobinPairKey(m) === key) : null,
    ...(bracket.matches ?? []).filter(
      (m) => key && roundRobinPairKey(m) === key
    ),
  ].filter(Boolean);
  let best = null;
  for (const row of candidates) {
    best = best ? pickPreferredRoundRobinRow(best, row) : row;
  }
  return best ? sealRoundRobinMatchRow(best) : null;
}

/** Merge schedule and drop pre-reset ghosts so starts are not blocked after regenerate. */
function reconcileBracketMatches(bracket, divisionSetup) {
  return stabilizeBracketMatches(bracket, {
    scheduleResetAt: divisionSetup?.scheduleResetAt,
    bracketId: bracket.id,
  });
}

function assertCourtAvailableForLive(
  event,
  courtId,
  divisionId,
  bracketId,
  matchId
) {
  const activeId = getCourtOccupyingDivisionId(event, courtId);
  if (activeId && activeId !== divisionId) {
    throw new Error("Courts are reserved for another division.");
  }

  for (const [divId, divSetup] of Object.entries(event.tournamentDivisions ?? {})) {
    if (activeId && divId !== activeId) continue;
    for (const round of divSetup.knockout?.rounds ?? []) {
      for (const m of round.matches ?? []) {
        if (m.courtId !== courtId) continue;
        if (
          isMatchLive(m) &&
          !(divId === divisionId && round.id === bracketId && m.id === matchId)
        ) {
          throw new Error("Another match is already live on this court.");
        }
      }
    }

    if (poolBracketsHiddenByKnockout(divSetup)) continue;

    for (const bracket of divSetup.brackets ?? []) {
      if (bracket.courtId !== courtId) continue;
      for (const m of bracket.matches ?? []) {
        if (
          isMatchLive(m) &&
          !(
            divId === divisionId &&
            bracket.id === bracketId &&
            m.id === matchId
          )
        ) {
          throw new Error("Another match is already live on this court.");
        }
      }
    }
  }
}

export function buildDivisionSetup(event, divisionId, { resetScores = false } = {}) {
  const pairs = (event.pairRegistrations ?? [])
    .filter((p) => p.divisionId === divisionId)
    .map((p) => ({
      ...p,
      displayName: pairDisplayName(p),
    }));

  const courts = courtsForDivision(event, divisionId);
  const plan = planBracketDistribution(pairs.length, courts.length);
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  let brackets = assignPairsToBrackets(
    pairs,
    courts,
    plan.distribution,
    divisionId
  );
  assertDisjointBracketPairIds(brackets);
  brackets = brackets.map((b) =>
    refreshBracketStandings(b, pairById, { resetScores })
  );

  return refreshDivisionAdvancement({
    divisionId,
    plan,
    brackets,
    updatedAt: Date.now(),
  });
}

function buildRegeneratedDivisionSetup(setup, scheduleResetAt) {
  const brackets = buildRegeneratedBrackets(setup.brackets, scheduleResetAt).map(
    (b) => purgePreResetBracketRows({ ...b, scheduleResetAt })
  );
  return refreshDivisionAdvancement({
    divisionId: setup.divisionId,
    plan: setup.plan,
    brackets,
    scheduleResetAt,
    updatedAt: Date.now(),
    knockout: undefined,
    divisionComplete: false,
    championPairId: undefined,
  });
}

export function applyDivisionSetup(event, divisionId, options = {}) {
  const { regenerate = false, force = false } = options;
  assertCanBracketDivision(event, divisionId, {
    regenerate,
    force: regenerate || force,
  });

  const scheduleResetAt = regenerate ? Date.now() : undefined;
  const setup = buildDivisionSetup(event, divisionId, {
    resetScores: regenerate,
  });
  const divisions = { ...(event.tournamentDivisions ?? {}) };
  divisions[divisionId] =
    scheduleResetAt != null
      ? buildRegeneratedDivisionSetup(setup, scheduleResetAt)
      : setup;

  const occupying = getCourtOccupyingDivisionId(event);
  const activeDivisionId = occupying ?? divisionId;

  let next = syncActiveDivision({
    ...event,
    tournamentDivisions: divisions,
    activeDivisionId,
    tournamentPhase:
      event.tournamentPhase === "ended" ? "ended" : "pool_play",
  });

  if (regenerate) {
    const stillKnockout = Object.values(next.tournamentDivisions ?? {}).some(
      (d) => d.knockout?.initialized
    );
    if (!stillKnockout && next.tournamentPhase === "knockout") {
      next = { ...next, tournamentPhase: "pool_play" };
    }
  }

  return next;
}

export function regenerateDivisionSetup(event, divisionId, { force = true } = {}) {
  return applyDivisionSetup(event, divisionId, { regenerate: true, force });
}

/** True when refreshed event should be written back (schedule repaired, etc.). */
export function tournamentEventNeedsPersistRepair(before, after) {
  if (before?.type !== "tournament" || after?.type !== "tournament") {
    return false;
  }

  for (const [divId, divAfter] of Object.entries(
    after.tournamentDivisions ?? {}
  )) {
    const divBefore = before.tournamentDivisions?.[divId];
    for (const bracketAfter of divAfter.brackets ?? []) {
      const bracketBefore = divBefore?.brackets?.find(
        (b) => b.id === bracketAfter.id
      );
      const pairCount = bracketAfter.pairIds?.length ?? 0;
      const expected = expectedRoundRobinMatchCount(pairCount);
      const beforeCount = bracketBefore?.matches?.length ?? 0;
      const afterCount = bracketAfter.matches?.length ?? 0;

      if (afterCount > beforeCount && afterCount >= expected) return true;
      if (bracketBefore?.poolComplete !== bracketAfter.poolComplete) return true;
      if (bracketBefore?.poolComplete && !bracketAfter.poolComplete) return true;

      const mergedBefore = mergeRoundRobinSchedule(
        bracketBefore?.matches,
        bracketBefore?.pairIds
      );
      const mergedAfter = mergeRoundRobinSchedule(
        bracketAfter.matches,
        bracketAfter.pairIds
      );
      if (mergedAfter.length > mergedBefore.length) return true;
    }
  }

  return false;
}

export function refreshTournamentStandings(event) {
  if (event.type !== "tournament") return event;

  const pairById = new Map(
    (event.pairRegistrations ?? []).map((p) => [p.id, p])
  );
  const divisions = { ...(event.tournamentDivisions ?? {}) };

  for (const [divisionId, div] of Object.entries(divisions)) {
    const brackets = (div.brackets ?? []).map((b) => {
      const withNames = {
        ...b,
        pairs: (b.pairs ?? []).map((p) => {
          const full = pairById.get(p.id);
          return full ? { ...p, name: pairDisplayName(full) } : p;
        }),
      };
      const reconciled = reconcileBracketMatches(
        syncBracketConfirmedResults({
          ...withNames,
          scheduleResetAt: div.scheduleResetAt,
        }),
        div
      );
      return syncBracketConfirmedResults(
        refreshBracketStandings(reconciled, pairById, {
          scheduleResetAt: div.scheduleResetAt,
        })
      );
    });
    let refreshed = refreshDivisionAdvancement({
      ...div,
      brackets,
    });
    refreshed = ensureDivisionKnockout(refreshed, courtsForDivision(event, divisionId), {
      ...event,
      tournamentDivisions: divisions,
    }, divisionId);
    divisions[divisionId] = enrichDivisionCompletion(refreshed);
  }

  const anyKnockout = Object.values(divisions).some((d) => d.knockout?.initialized);
  const phase =
    event.tournamentPhase === "ended"
      ? "ended"
      : anyKnockout
        ? "knockout"
        : event.tournamentPhase === "pool_play"
          ? "pool_play"
          : event.tournamentPhase;

  return syncActiveDivision({
    ...event,
    status: event.status,
    endedAt: event.endedAt,
    tournamentDivisions: divisions,
    tournamentPhase: phase,
  });
}

export function startDivisionQuarterfinals(event, divisionId) {
  if (event.type !== "tournament") {
    throw new Error("Not a tournament event.");
  }

  const divisions = { ...(event.tournamentDivisions ?? {}) };
  const div = divisions[divisionId];
  if (!div) throw new Error("Division not found.");
  if (!div.advancement?.ready) {
    throw new Error("Finish all pool matches before starting quarterfinals.");
  }
  if ((event.courts?.length ?? 0) < 1) {
    throw new Error("Add at least one court before starting quarterfinals.");
  }

  const pairById = new Map(
    (event.pairRegistrations ?? []).map((p) => [p.id, p])
  );

  let setup = ensureDivisionKnockout(div, courtsForDivision(event, divisionId), event, divisionId);
  setup = {
    ...setup,
    knockout: startQuarterfinalMatches(
      setup.knockout,
      { ...event, tournamentDivisions: divisions },
      divisionId,
      pairById
    ),
  };

  divisions[divisionId] = setup;

  return syncActiveDivision({
    ...event,
    tournamentDivisions: divisions,
    tournamentPhase: "knockout",
  });
}

export function applyAllDivisionSetups(event, { regenerate = false, force = false } = {}) {
  if (event.type !== "tournament") {
    throw new Error("Not a tournament event.");
  }
  if ((event.courts?.length ?? 0) < 1) {
    throw new Error("Add courts before running the bracket calculator.");
  }

  let next = event;
  let applied = 0;

  for (const division of getEventDivisions(event)) {
    const existing = next.tournamentDivisions?.[division.id];
    if (existing && isDivisionComplete(existing) && !(regenerate && force)) {
      continue;
    }
    if (existing && divisionHasMatchProgress(existing) && !force) continue;
    if (regenerate) {
      if (!existing?.brackets?.length) continue;
    } else {
      if (existing && divisionHasMatchProgress(existing)) continue;
      if (existing?.brackets?.length) continue;
    }

    if (pairsInDivision(next, division.id).length < 2) continue;

    try {
      next = applyDivisionSetup(next, division.id, {
        regenerate,
        force: regenerate ? true : force,
      });
      applied += 1;
    } catch {
      /* skip divisions that cannot be distributed or are blocked */
    }
  }

  if (applied === 0) {
    throw new Error(
      regenerate
        ? "No divisions were regenerated. Each needs existing brackets and must not be finished."
        : "No divisions were ready. Each needs at least 2 pairs and must not already be bracketed or in progress."
    );
  }

  return syncActiveDivision({
    ...next,
    tournamentPhase:
      next.tournamentPhase === "ended" ? "ended" : "pool_play",
  });
}

export function updateTournamentMatch(
  event,
  divisionId,
  bracketId,
  matchId,
  patch,
  { roundId } = {}
) {
  let divisions = { ...(event.tournamentDivisions ?? {}) };
  let div = divisions[divisionId];
  if (!div) return event;

  const pairById = new Map(
    (event.pairRegistrations ?? []).map((p) => [p.id, p])
  );

  if (patch.status === "live") {
    assertCanUseCourtsForDivision(event, divisionId);

    const isKnockoutPath =
      roundId || div.knockout?.rounds?.some((r) => r.id === bracketId);
    let courtId = null;
    let startingNewLiveOnCourt = false;
    let liveTargetRow = null;

    if (isKnockoutPath) {
      const rid = roundId ?? bracketId;
      const round = div.knockout?.rounds?.find((r) => r.id === rid);
      const matchMeta = round?.matches?.find((m) => m.id === matchId);
      courtId = matchMeta?.courtId ?? null;
      liveTargetRow = matchMeta ?? null;
      startingNewLiveOnCourt = matchMeta?.status !== "live";
    } else {
      const bracket = (div.brackets ?? []).find((b) => b.id === bracketId);
      courtId = bracket?.courtId ?? null;
      const syncedBracket = bracket
        ? syncBracketConfirmedResults(bracket)
        : null;
      let row = (syncedBracket?.matches ?? []).find((m) => m.id === matchId);
      if (!row && syncedBracket) {
        row = getBracketRoundRobinMatches(
          { ...syncedBracket, scheduleResetAt: div.scheduleResetAt },
          { scheduleResetAt: div.scheduleResetAt }
        ).find((m) => m.id === matchId);
      }
      liveTargetRow = row ?? null;
      const pairingKey = row ? roundRobinPairKey(row) : null;
      const confirmedRow =
        pairingKey && syncedBracket?.confirmedResults?.[pairingKey];
      const hasConfirmedResult =
        isPermanentRoundRobinResult(row) ||
        isPermanentRoundRobinResult(confirmedRow);
      const isLiveScoreAutosave =
        row?.status === "live" &&
        (patch.scoreA !== undefined ||
          patch.scoreB !== undefined ||
          patch.teamA !== undefined ||
          patch.teamB !== undefined ||
          patch.basePlayerA !== undefined ||
          patch.basePlayerB !== undefined ||
          patch.sidesSwapped !== undefined);

      if (hasConfirmedResult && !isLiveScoreAutosave) {
        return event;
      }

      startingNewLiveOnCourt =
        !hasConfirmedResult &&
        !isLiveScoreAutosave &&
        (!row || row.status !== "live");
    }

    if (
      isKnockoutPath &&
      liveTargetRow &&
      isPermanentRoundRobinResult(liveTargetRow) &&
      liveTargetRow.status !== "live"
    ) {
      return event;
    }

    // Only when a NEW match takes the court — not on every +/- score autosave.
    if (courtId && startingNewLiveOnCourt) {
      event = releaseCourtForNewLive(
        event,
        courtId,
        divisionId,
        bracketId,
        matchId,
        { roundId }
      );
      divisions = { ...(event.tournamentDivisions ?? {}) };
      div = divisions[divisionId];
    }
  }

  if (roundId || div.knockout?.rounds?.some((r) => r.id === bracketId)) {
    const rid = roundId ?? bracketId;
    const round = div.knockout?.rounds?.find((r) => r.id === rid);
    const matchMeta = round?.matches?.find((m) => m.id === matchId);
    if (patch.status === "live" && matchMeta?.courtId) {
      assertCourtAvailableForLive(
        event,
        matchMeta.courtId,
        divisionId,
        rid,
        matchId
      );
    }

    const knockout = applyKnockoutMatchPatch(
      div.knockout,
      rid,
      matchId,
      patch,
      pairById,
      divisionId,
      event
    );
    divisions[divisionId] = enrichDivisionCompletion({ ...div, knockout });
    const anyKnockout = Object.values(divisions).some((d) => d.knockout?.initialized);
    return syncActiveDivision({
      ...event,
      tournamentDivisions: divisions,
      tournamentPhase: anyKnockout ? "knockout" : event.tournamentPhase,
    });
  }

  const bracketMeta = (div.brackets ?? []).find((b) => b.id === bracketId);
  if (patch.status === "live") {
    if (bracketMeta?.courtId) {
      assertCourtAvailableForLive(
        event,
        bracketMeta.courtId,
        divisionId,
        bracketId,
        matchId
      );
    }
  }

  const sanitizeBracket = (bracket) => {
    const reconciled = reconcileBracketMatches(bracket, div);
    return refreshBracketStandings(reconciled, pairById, {
      scheduleResetAt: div.scheduleResetAt,
    });
  };

  const brackets = (div.brackets ?? []).map((bracket) => {
    if (bracket.id !== bracketId) {
      return syncBracketConfirmedResults(
        stabilizeBracketMatches(
          applyConfirmedResultsToStoredMatches({
            ...bracket,
            scheduleResetAt: div.scheduleResetAt ?? bracket.scheduleResetAt,
          }),
          {
            scheduleResetAt: div.scheduleResetAt,
            bracketId: bracket.id,
          }
        )
      );
    }

    let workingBracket = syncBracketConfirmedResults(
      applyConfirmedResultsToStoredMatches(
        syncBracketConfirmedResults(bracket)
      )
    );
    const reconciled = reconcileBracketMatches(workingBracket, div);
    const existing = (workingBracket.matches ?? []).find((m) => m.id === matchId);
    let target =
      (reconciled.matches ?? []).find((m) => m.id === matchId) ??
      (existing
        ? (reconciled.matches ?? []).find(
            (m) => roundRobinPairKey(m) === roundRobinPairKey(existing)
          )
        : null);
    let targetId = target?.id ?? matchId;
    const startingLive =
      patch.status === "live" && target?.status !== "live";
    const scheduleResetAt = div.scheduleResetAt ?? workingBracket.scheduleResetAt;
    const stabilizedBase = stabilizeBracketMatches(
      { ...workingBracket, scheduleResetAt },
      { scheduleResetAt, bracketId: workingBracket.id }
    );
    const liveRowForCompletion = findLiveRowForCompletion(
      workingBracket,
      matchId,
      existing,
      target,
      stabilizedBase.matches
    );
    const permanentIndex = buildPermanentPairingIndex(
      stabilizedBase.matches,
      stabilizedBase.confirmedResults
    );

    const preserveOtherMatchRow = (m) => {
      if (isRoundRobinMatchLocked(m)) {
        return lockRoundRobinMatchRow(m);
      }
      if (isMatchLive(m)) {
        return m;
      }
      if (isPermanentRoundRobinResult(m)) {
        const sealed = sealRoundRobinMatchRow(m);
        return isRoundRobinMatchLocked(sealed)
          ? lockRoundRobinMatchRow(sealed)
          : completeAndLockRoundRobinRow(sealed);
      }
      return m;
    };

    if (patch.resultLocked === true) {
      const rowToLock = resolveRowForLock(
        workingBracket,
        div,
        matchId,
        target,
        existing
      );
      if (!rowToLock) {
        throw new Error("Match not found.");
      }
      if (isRoundRobinMatchLocked(rowToLock)) {
        return syncBracketConfirmedResults(
          stabilizeBracketMatches(workingBracket, {
            scheduleResetAt: div.scheduleResetAt,
            bracketId: workingBracket.id,
          })
        );
      }
      const lockedRow = lockRoundRobinMatchRow({
        ...rowToLock,
        scheduleGeneration:
          div.scheduleResetAt ?? rowToLock.scheduleGeneration ?? workingBracket.scheduleResetAt,
      });
      workingBracket = recordBracketConfirmedResult(workingBracket, lockedRow);
      const targetKey = roundRobinPairKey(rowToLock);
      const rawMatches = workingBracket.matches ?? [];
      let found = false;
      const matchesAfterLock = rawMatches.map((m) => {
        if (m.id === targetId || roundRobinPairKey(m) === targetKey) {
          found = true;
          return { ...lockedRow, id: m.id ?? lockedRow.id };
        }
        return m;
      });
      const scheduleResetAtLock = div.scheduleResetAt ?? workingBracket.scheduleResetAt;
      const withMatches = stabilizeBracketMatches(
        {
          ...workingBracket,
          scheduleResetAt: scheduleResetAtLock,
          matches: found ? matchesAfterLock : [...matchesAfterLock, lockedRow],
        },
        { scheduleResetAt: scheduleResetAtLock, bracketId: workingBracket.id }
      );
      const refreshed = refreshBracketStandings(withMatches, pairById, {
        scheduleResetAt: div.scheduleResetAt,
      });
      const eventWithDivisions = { ...event, tournamentDivisions: divisions };
      return {
        ...syncBracketConfirmedResults(refreshed),
        matches: (refreshed.matches ?? []).map((m) => {
          if (isRoundRobinMatchLocked(m)) return lockRoundRobinMatchRow(m);
          if (isMatchLive(m)) {
            return resolveLiveMatchLayout(m, eventWithDivisions, divisionId);
          }
          return m;
        }),
      };
    }

    if (target && isRoundRobinMatchLocked(target)) {
      if (patch.status === "completed") {
        if (liveRowForCompletion) {
          target = liveRowForCompletion;
          targetId = liveRowForCompletion.id;
        } else if (scoresMatchRecordedResult(patch, target)) {
          return syncBracketConfirmedResults(
            stabilizeBracketMatches(workingBracket, {
              scheduleResetAt: div.scheduleResetAt,
              bracketId: workingBracket.id,
            })
          );
        } else {
          throw new Error(
            "This match is locked. The result is final and cannot be changed or replayed."
          );
        }
      } else if (patch.status === "live" && liveRowForCompletion) {
        target = liveRowForCompletion;
        targetId = liveRowForCompletion.id;
      } else {
        throw new Error(
          "This match is locked. The result is final and cannot be changed or replayed."
        );
      }
    }

    if (patch.status === "live" && target) {
      const sealedTarget = sealRoundRobinMatchRow(target);
      if (hasRecordedRoundRobinResult(sealedTarget)) {
        throw new Error(
          "This match already has a final result and cannot be reopened."
        );
      }
    }

    if (startingLive && target) {
      const pairingKey = roundRobinPairKey(target);
      if (
        pairingKey &&
        stabilizedBase.confirmedResults?.[pairingKey] &&
        isPermanentRoundRobinResult(stabilizedBase.confirmedResults[pairingKey])
      ) {
        throw new Error(
          "This pairing already has a locked final result and cannot be replayed."
        );
      }
      const alreadyPlayed = (stabilizedBase.matches ?? []).some(
        (m) =>
          roundRobinPairKey(m) === pairingKey &&
          isPermanentRoundRobinResult(m)
      );
      if (alreadyPlayed) {
        throw new Error(
          "This pairing already has a result. Pick a highlighted match from the schedule."
        );
      }
    }

    if (
      patch.status === "live" &&
      target &&
      stabilizedBase.confirmedResults?.[roundRobinPairKey(target)]
    ) {
      throw new Error(
        "This match is locked. The result is final and cannot be reopened."
      );
    }

    const matches = (stabilizedBase.matches ?? []).map((m) => {
      const permanent = resolvePermanentPairingRow(permanentIndex, m);
      if (m.id !== targetId) {
        if (permanent) return sealPermanentPairingRow(permanent);
        return preserveOtherMatchRow(m);
      }
      if (permanent && !(patch.status === "completed" && isMatchLive(m))) {
        return sealPermanentPairingRow(permanent);
      }

      let next = { ...m, ...patch };
      const scoreA =
        patch.scoreA !== undefined ? patch.scoreA : (m.scoreA ?? 0);
      const scoreB =
        patch.scoreB !== undefined ? patch.scoreB : (m.scoreB ?? 0);
      next.scoreA = scoreA;
      next.scoreB = scoreB;

      validateMatchBasePatch(m, pairById, patch);

      if (startingLive) {
        if (!isPermanentRoundRobinResult(m) && isVoidMatchResult(m)) {
          next = reopenMatchForRematch(m);
        }
        next = ensureTournamentMatchLayout(
          {
            ...next,
            status: "live",
            scoreA: 0,
            scoreB: 0,
            startedAt: Date.now(),
            scheduleGeneration: div.scheduleResetAt ?? next.scheduleGeneration,
          },
          pairById,
          divisionId,
          event
        );
      } else if (next.status === "live" && patchNeedsLayoutRefresh(patch)) {
        next = ensureTournamentMatchLayout(next, pairById, divisionId, event);
      }

      if (patch.status === "completed" && patch.forfeitWinnerPairId) {
        const forfeited = buildForfeitCompletedMatch(
          { ...m, ...next },
          patch.forfeitWinnerPairId
        );
        workingBracket = recordBracketConfirmedResult(workingBracket, forfeited);
        return forfeited;
      }

      let winnerPairId = patch.winnerPairId ?? m.winnerPairId;
      if (patch.status === "completed") {
        const sealedExisting = sealRoundRobinMatchRow(m);
        if (!isMatchLive(m) && hasRecordedRoundRobinResult(sealedExisting)) {
          return isRoundRobinMatchLocked(sealedExisting)
            ? lockRoundRobinMatchRow(sealedExisting)
            : completeAndLockRoundRobinRow(sealedExisting);
        }
        if (scoreA === scoreB && scoreA === 0) {
          return reopenMatchForRematch(m);
        }
        if (scoreA === scoreB) {
          throw new Error(
            "Scores are tied. Change the score so one pair wins, then end the match."
          );
        }
        if (scoreA > scoreB) winnerPairId = m.pairAId;
        else if (scoreB > scoreA) winnerPairId = m.pairBId;
        else winnerPairId = patch.winnerPairId ?? m.winnerPairId ?? null;
        const completedRow = completeAndLockRoundRobinRow({
          ...next,
          status: "completed",
          winnerPairId,
          scoreA,
          scoreB,
          playedAt: Date.now(),
          scheduleGeneration: div.scheduleResetAt ?? next.scheduleGeneration,
          completionType: undefined,
          forfeitLoserPairId: undefined,
        });
        workingBracket = recordBracketConfirmedResult(workingBracket, completedRow);
        return completedRow;
      } else if (patch.status === "live") {
        next.winnerPairId = null;
      }

      return next;
    });

    let withMatches = stabilizeBracketMatches(
      { ...workingBracket, scheduleResetAt, matches },
      { scheduleResetAt, bracketId: workingBracket.id }
    );
    for (const row of withMatches.matches ?? []) {
      if (isPermanentRoundRobinResult(row)) {
        withMatches = recordBracketConfirmedResult(withMatches, row);
      }
    }
    const refreshed = refreshBracketStandings(withMatches, pairById, {
      scheduleResetAt: div.scheduleResetAt,
    });
    const eventWithDivisions = { ...event, tournamentDivisions: divisions };
    return {
      ...syncBracketConfirmedResults(refreshed),
      matches: sealAllBracketMatchRows(
        (refreshed.matches ?? []).map((m) =>
          isMatchLive(m)
            ? resolveLiveMatchLayout(m, eventWithDivisions, divisionId)
            : m
        )
      ),
    };
  });

  divisions[divisionId] = enrichDivisionCompletion(
    refreshDivisionAdvancement({ ...div, brackets })
  );
  divisions[divisionId] = enrichDivisionCompletion(
    ensureDivisionKnockout(
      divisions[divisionId],
      courtsForDivision(event, divisionId),
      { ...event, tournamentDivisions: divisions },
      divisionId
    )
  );
  const anyKnockout = Object.values(divisions).some((d) => d.knockout?.initialized);
  return syncActiveDivision({
    ...event,
    tournamentDivisions: divisions,
    tournamentPhase: anyKnockout ? "knockout" : event.tournamentPhase,
  });
}
