import {
  planBracketDistribution,
  assignPairsToBrackets,
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
  assertCanBracketDivision,
  assertCanUseCourtsForDivision,
  enrichDivisionCompletion,
  getCourtOccupyingDivisionId,
  syncActiveDivision,
  isDivisionComplete,
  divisionHasMatchProgress,
} from "@/lib/tournament-division-schedule";

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

export function buildDivisionSetup(event, divisionId) {
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
  brackets = brackets.map((b) => refreshBracketStandings(b, pairById));

  return refreshDivisionAdvancement({
    divisionId,
    plan,
    brackets,
    updatedAt: Date.now(),
  });
}

export function applyDivisionSetup(event, divisionId, options = {}) {
  assertCanBracketDivision(event, divisionId, options);

  const setup = buildDivisionSetup(event, divisionId);
  const divisions = { ...(event.tournamentDivisions ?? {}) };
  divisions[divisionId] = setup;

  const occupying = getCourtOccupyingDivisionId(event);
  const activeDivisionId = occupying ?? divisionId;

  return syncActiveDivision({
    ...event,
    tournamentDivisions: divisions,
    activeDivisionId,
    tournamentPhase:
      event.tournamentPhase === "ended" ? "ended" : "pool_play",
  });
}

export function regenerateDivisionSetup(event, divisionId, { force = false } = {}) {
  return applyDivisionSetup(event, divisionId, { regenerate: true, force });
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
      return refreshBracketStandings(withNames, pairById);
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
      assertCanBracketDivision(next, division.id, { regenerate, force });
      const setup = buildDivisionSetup(next, division.id);
      next = {
        ...next,
        tournamentDivisions: {
          ...(next.tournamentDivisions ?? {}),
          [division.id]: setup,
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
  const divisions = { ...(event.tournamentDivisions ?? {}) };
  const div = divisions[divisionId];
  if (!div) return event;

  const pairById = new Map(
    (event.pairRegistrations ?? []).map((p) => [p.id, p])
  );

  if (patch.status === "live") {
    assertCanUseCourtsForDivision(event, divisionId);
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
  if (patch.status === "live" && bracketMeta?.courtId) {
    assertCourtAvailableForLive(
      event,
      bracketMeta.courtId,
      divisionId,
      bracketId,
      matchId
    );
  }

  const brackets = (div.brackets ?? []).map((bracket) => {
    if (bracket.id !== bracketId) return bracket;

    const matches = (bracket.matches ?? []).map((m) => {
      if (m.id !== matchId) return m;

      let next = { ...m, ...patch };
      const scoreA =
        patch.scoreA !== undefined ? patch.scoreA : (m.scoreA ?? 0);
      const scoreB =
        patch.scoreB !== undefined ? patch.scoreB : (m.scoreB ?? 0);
      next.scoreA = scoreA;
      next.scoreB = scoreB;

      validateMatchBasePatch(m, pairById, patch);

      if (patch.status === "live" && m.status !== "live") {
        next = ensureTournamentMatchLayout(
          { ...next, status: "live", scoreA: 0, scoreB: 0 },
          pairById,
          divisionId,
          event
        );
      } else if (next.status === "live" && patchNeedsLayoutRefresh(patch)) {
        next = ensureTournamentMatchLayout(next, pairById, divisionId, event);
      }

      let winnerPairId = patch.winnerPairId ?? m.winnerPairId;
      if (patch.status === "completed") {
        if (scoreA > scoreB) winnerPairId = m.pairAId;
        else if (scoreB > scoreA) winnerPairId = m.pairBId;
        else winnerPairId = null;
        next = {
          ...next,
          status: "completed",
          winnerPairId,
          playedAt: Date.now(),
        };
      } else if (patch.status === "live") {
        next.winnerPairId = null;
      }

      return next;
    });

    return refreshBracketStandings({ ...bracket, matches }, pairById);
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
