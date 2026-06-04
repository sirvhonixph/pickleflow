import {
  expectedRoundRobinMatchCount,
  planBracketDistribution,
  assignPairsToBrackets,
  mergeRoundRobinSchedule,
  tagBracketMatchesAfterReset,
  getBracketRoundRobinMatches,
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
  validateMatchBasePatch,
} from "@/lib/tournament-live";
import {
  buildForfeitCompletedMatch,
  isVoidMatchResult,
  reopenMatchForRematch,
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

/** Close a stuck live match, or reopen if there is no valid winner (e.g. 0–0). */
function finalizeStuckLiveMatch(m) {
  const scoreA = m.scoreA ?? 0;
  const scoreB = m.scoreB ?? 0;

  if (scoreA > scoreB && m.pairAId) {
    return {
      ...m,
      status: "completed",
      winnerPairId: m.pairAId,
      scoreA,
      scoreB,
      playedAt: m.playedAt ?? Date.now(),
    };
  }
  if (scoreB > scoreA && m.pairBId) {
    return {
      ...m,
      status: "completed",
      winnerPairId: m.pairBId,
      scoreA,
      scoreB,
      playedAt: m.playedAt ?? Date.now(),
    };
  }
  return reopenMatchForRematch(m);
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

  for (const [divId, divSetup] of Object.entries(divisions)) {
    let nextDiv = { ...divSetup };

    if (!poolBracketsHiddenByKnockout(nextDiv)) {
      nextDiv = {
        ...nextDiv,
        brackets: (nextDiv.brackets ?? []).map((bracket) => {
          if (bracket.courtId !== courtId) return bracket;
          return {
            ...bracket,
            matches: (bracket.matches ?? []).map((m) => {
              if (!isMatchLive(m)) return m;
              if (
                divId === divisionId &&
                bracket.id === bracketOrRoundId &&
                m.id === matchId
              ) {
                return m;
              }
              return finalizeStuckLiveMatch(m);
            }),
          };
        }),
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
              if (
                divId === divisionId &&
                round.id === rid &&
                m.id === matchId
              ) {
                return m;
              }
              return finalizeStuckLiveMatch(m);
            }),
          })),
        },
      };
    }

    divisions[divId] = nextDiv;
  }

  return { ...event, tournamentDivisions: divisions };
}

/** Merge schedule and drop pre-reset ghosts so starts are not blocked after regenerate. */
function reconcileBracketMatches(bracket, divisionSetup) {
  const scheduleResetAt = divisionSetup?.scheduleResetAt;
  const matches = getBracketRoundRobinMatches(
    { ...bracket, scheduleResetAt },
    { scheduleResetAt }
  ).map((m) => (isVoidMatchResult(m) ? reopenMatchForRematch(m) : m));
  return { ...bracket, matches };
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
  const brackets =
    scheduleResetAt != null
      ? tagBracketMatchesAfterReset(setup.brackets, scheduleResetAt)
      : setup.brackets;
  const divisions = { ...(event.tournamentDivisions ?? {}) };
  divisions[divisionId] = {
    ...setup,
    brackets,
    ...(scheduleResetAt != null ? { scheduleResetAt } : {}),
  };

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
        { ...withNames, scheduleResetAt: div.scheduleResetAt },
        div
      );
      return refreshBracketStandings(reconciled, pairById);
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
    if (existing && isDivisionComplete(existing)) continue;
    if (existing && divisionHasMatchProgress(existing) && !force) continue;
    if (regenerate) {
      if (!existing?.brackets?.length) continue;
    } else {
      if (existing && divisionHasMatchProgress(existing)) continue;
      if (existing?.brackets?.length) continue;
    }

    if (pairsInDivision(next, division.id).length < 2) continue;

    try {
      assertCanBracketDivision(next, division.id, {
        regenerate,
        force: regenerate ? true : force,
      });
      const scheduleResetAt = regenerate ? Date.now() : undefined;
      const setup = buildDivisionSetup(next, division.id, {
        resetScores: regenerate,
      });
      const brackets =
        scheduleResetAt != null
          ? tagBracketMatchesAfterReset(setup.brackets, scheduleResetAt)
          : setup.brackets;
      next = {
        ...next,
        tournamentDivisions: {
          ...(next.tournamentDivisions ?? {}),
          [division.id]: {
            ...setup,
            brackets,
            ...(scheduleResetAt != null ? { scheduleResetAt } : {}),
          },
        },
      };
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

    let courtId = null;
    const isKnockoutPath =
      roundId || div.knockout?.rounds?.some((r) => r.id === bracketId);
    if (isKnockoutPath) {
      const rid = roundId ?? bracketId;
      const round = div.knockout?.rounds?.find((r) => r.id === rid);
      courtId = round?.matches?.find((m) => m.id === matchId)?.courtId ?? null;
    } else {
      courtId =
        (div.brackets ?? []).find((b) => b.id === bracketId)?.courtId ?? null;
    }
    if (courtId) {
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

  const brackets = (div.brackets ?? []).map((bracket) => {
    if (bracket.id !== bracketId) return bracket;

    const existing = (bracket.matches ?? []).find((m) => m.id === matchId);
    const startingLive =
      patch.status === "live" && existing?.status !== "live";
    const reconciled = startingLive
      ? reconcileBracketMatches(bracket, div)
      : bracket;

    const matches = (reconciled.matches ?? []).map((m) => {
      if (m.id !== matchId) return m;

      let next = { ...m, ...patch };
      const scoreA =
        patch.scoreA !== undefined ? patch.scoreA : (m.scoreA ?? 0);
      const scoreB =
        patch.scoreB !== undefined ? patch.scoreB : (m.scoreB ?? 0);
      next.scoreA = scoreA;
      next.scoreB = scoreB;

      validateMatchBasePatch(m, pairById, patch);

      if (startingLive) {
        if (isVoidMatchResult(m)) {
          next = reopenMatchForRematch(m);
        }
        next = ensureTournamentMatchLayout(
          {
            ...next,
            status: "live",
            scoreA: 0,
            scoreB: 0,
            startedAt: Date.now(),
          },
          pairById,
          divisionId,
          event
        );
      } else if (next.status === "live" && patchNeedsLayoutRefresh(patch)) {
        next = ensureTournamentMatchLayout(next, pairById, divisionId, event);
      }

      if (patch.status === "completed" && patch.forfeitWinnerPairId) {
        return buildForfeitCompletedMatch(
          { ...m, ...next },
          patch.forfeitWinnerPairId
        );
      }

      let winnerPairId = patch.winnerPairId ?? m.winnerPairId;
      if (patch.status === "completed") {
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
        next = {
          ...next,
          status: "completed",
          winnerPairId,
          scoreA,
          scoreB,
          playedAt: Date.now(),
          completionType: undefined,
          forfeitLoserPairId: undefined,
        };
      } else if (patch.status === "live") {
        next.winnerPairId = null;
      }

      return next;
    });

    const withMatches = {
      ...bracket,
      scheduleResetAt: div.scheduleResetAt ?? bracket.scheduleResetAt,
      matches,
    };
    const scoreOnlyLive =
      patch.status === "live" && !startingLive && !patchNeedsLayoutRefresh(patch);
    return scoreOnlyLive
      ? withMatches
      : refreshBracketStandings(withMatches, pairById);
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
