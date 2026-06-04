import { compareStandings } from "@/lib/tournament-standings";
import { getCourtOccupyingDivisionId, isDivisionComplete } from "@/lib/tournament-division-schedule";
import { courtsForDivision } from "@/lib/tournament-court-pools";
import {
  ensureTournamentMatchLayout,
  isMatchComplete,
  isMatchLive,
  patchNeedsLayoutRefresh,
  validateMatchBasePatch,
} from "@/lib/tournament-live";

function makeMatch({
  id,
  roundId,
  label,
  pairAId,
  pairBId,
  courtId,
  courtName,
  feedsMatchId,
  feedsSlot,
  feedsLoserMatchId,
  feedsLoserSlot,
  feederIds = [],
}) {
  return {
    id,
    roundId,
    label,
    pairAId: pairAId ?? null,
    pairBId: pairBId ?? null,
    courtId: courtId ?? null,
    courtName: courtName ?? null,
    status: "scheduled",
    scoreA: 0,
    scoreB: 0,
    winnerPairId: null,
    playedAt: null,
    feedsMatchId: feedsMatchId ?? null,
    feedsSlot: feedsSlot ?? null,
    feedsLoserMatchId: feedsLoserMatchId ?? null,
    feedsLoserSlot: feedsLoserSlot ?? null,
    feederIds,
    elimination: true,
  };
}

function buildQuarterfinalPairings(advancement) {
  if (advancement.bracketCount === 4 && advancement.quarterfinals?.length) {
    return advancement.quarterfinals.map((q) => ({
      id: q.id,
      label: q.label,
      pairAId: q.pairA?.pairId,
      pairBId: q.pairB?.pairId,
    }));
  }

  const seeded = [...(advancement.allQualified ?? [])].sort(compareStandings);
  const slots = [
    [0, 7, "#1 vs #8"],
    [1, 6, "#2 vs #7"],
    [2, 5, "#3 vs #6"],
    [3, 4, "#4 vs #5"],
  ];

  return slots
    .map(([a, b, label], i) => ({
      id: `qf-${i + 1}`,
      label,
      pairAId: seeded[a]?.pairId,
      pairBId: seeded[b]?.pairId,
    }))
    .filter((m) => m.pairAId && m.pairBId);
}

export function buildKnockoutBracket(advancement, courts) {
  const courtList = courts ?? [];
  const qfPairings = buildQuarterfinalPairings(advancement);

  const qfMatches = qfPairings.map((q, i) => {
    const court = courtList[i % Math.max(courtList.length, 1)] ?? {};
    return makeMatch({
      id: q.id,
      roundId: "qf",
      label: q.label,
      pairAId: q.pairAId,
      pairBId: q.pairBId,
      courtId: court.id,
      courtName: court.name,
      feedsMatchId: i < 2 ? "sf-1" : "sf-2",
      feedsSlot: i % 2 === 0 ? "pairAId" : "pairBId",
    });
  });

  const sfMatches = [
    makeMatch({
      id: "sf-1",
      roundId: "sf",
      label: "Semifinal 1",
      pairAId: null,
      pairBId: null,
      courtId: courtList[0]?.id,
      courtName: courtList[0]?.name,
      feedsMatchId: "final-1",
      feedsSlot: "pairAId",
      feedsLoserMatchId: "bronze-1",
      feedsLoserSlot: "pairAId",
      feederIds: [qfMatches[0]?.id, qfMatches[1]?.id].filter(Boolean),
    }),
    makeMatch({
      id: "sf-2",
      roundId: "sf",
      label: "Semifinal 2",
      pairAId: null,
      pairBId: null,
      courtId: courtList[1 % Math.max(courtList.length, 1)]?.id,
      courtName: courtList[1 % Math.max(courtList.length, 1)]?.name,
      feedsMatchId: "final-1",
      feedsSlot: "pairBId",
      feedsLoserMatchId: "bronze-1",
      feedsLoserSlot: "pairBId",
      feederIds: [qfMatches[2]?.id, qfMatches[3]?.id].filter(Boolean),
    }),
  ];

  const goldMatch = makeMatch({
    id: "final-1",
    roundId: "final",
    label: "Gold medal match",
    pairAId: null,
    pairBId: null,
    courtId: courtList[0]?.id,
    courtName: courtList[0]?.name,
    feederIds: ["sf-1", "sf-2"],
  });

  const bronzeMatch = makeMatch({
    id: "bronze-1",
    roundId: "bronze",
    label: "Bronze medal match",
    pairAId: null,
    pairBId: null,
    courtId: courtList[2 % Math.max(courtList.length, 1)]?.id,
    courtName: courtList[2 % Math.max(courtList.length, 1)]?.name,
    feederIds: ["sf-1", "sf-2"],
  });

  return {
    initialized: true,
    phase: "quarterfinals",
    rounds: [
      { id: "qf", label: "Quarterfinals", matches: qfMatches },
      { id: "sf", label: "Semifinals", matches: sfMatches },
      { id: "final", label: "Gold medal match", matches: [goldMatch] },
      { id: "bronze", label: "Bronze medal match", matches: [bronzeMatch] },
    ],
  };
}

export function getKnockoutMatch(knockout, roundId, matchId) {
  const round = knockout?.rounds?.find((r) => r.id === roundId);
  const match = round?.matches?.find((m) => m.id === matchId);
  return { round, match };
}

export function allRoundMatchesComplete(round) {
  const playable = (round?.matches ?? []).filter((m) => m.pairAId && m.pairBId);
  if (playable.length === 0) return false;
  return playable.every(isMatchComplete);
}

export function roundHasPlayableMatch(round) {
  return (round?.matches ?? []).some(
    (m) => m.pairAId && m.pairBId && !isMatchComplete(m)
  );
}

function mergeKnockoutIntoEvent(event, divisionId, knockout) {
  const divisions = { ...(event.tournamentDivisions ?? {}) };
  divisions[divisionId] = { ...divisions[divisionId], knockout };
  return { ...event, tournamentDivisions: divisions };
}

function resolveCourtForMatch(match, event, divisionId, roundId) {
  const courts = courtsForDivision(event, divisionId);
  if (
    match.courtId &&
    !isCourtBusyForKnockout(event, match.courtId, divisionId, roundId, match.id)
  ) {
    const court = courts.find((c) => c.id === match.courtId);
    return { courtId: match.courtId, courtName: court?.name ?? match.courtName };
  }

  const free = courts.find(
    (c) => !isCourtBusyForKnockout(event, c.id, divisionId, roundId, match.id)
  );
  if (!free) return null;
  return { courtId: free.id, courtName: free.name };
}

function updateKnockoutPhase(knockout) {
  const sf = knockout.rounds.find((r) => r.id === "sf");
  const fin = knockout.rounds.find((r) => r.id === "final");
  const bronze = knockout.rounds.find((r) => r.id === "bronze");
  const finalMatch = fin?.matches?.[0];
  const bronzeMatch = bronze?.matches?.[0];

  if (finalMatch && isMatchComplete(finalMatch)) {
    const bronzePending =
      bronzeMatch?.pairAId &&
      bronzeMatch?.pairBId &&
      !isMatchComplete(bronzeMatch);
    if (bronzePending) {
      return { ...knockout, phase: "final" };
    }
    return { ...knockout, phase: "complete" };
  }

  const medalRoundActive =
    (finalMatch?.pairAId &&
      finalMatch?.pairBId &&
      (isMatchLive(finalMatch) || !isMatchComplete(finalMatch))) ||
    (bronzeMatch?.pairAId &&
      bronzeMatch?.pairBId &&
      (isMatchLive(bronzeMatch) || !isMatchComplete(bronzeMatch)));

  if (medalRoundActive) {
    return { ...knockout, phase: "final" };
  }

  const sfActive =
    roundHasPlayableMatch(sf) ||
    (sf?.matches ?? []).some((m) => isMatchLive(m) || isMatchComplete(m));

  if (sfActive) {
    return { ...knockout, phase: "semifinals" };
  }

  return { ...knockout, phase: "quarterfinals" };
}

function normalizeFeedSlot(slot) {
  if (slot === "pairA") return "pairAId";
  if (slot === "pairB") return "pairBId";
  return slot;
}

function migrateMatchPairIds(match) {
  const pairAId =
    match.pairAId ??
    (typeof match.pairA === "string" ? match.pairA : match.pairA?.pairId) ??
    null;
  const pairBId =
    match.pairBId ??
    (typeof match.pairB === "string" ? match.pairB : match.pairB?.pairId) ??
    null;
  return { ...match, pairAId, pairBId };
}

function cleanLegacyPairFields(match) {
  const { pairA, pairB, ...rest } = migrateMatchPairIds(match);
  return rest;
}

function normalizeMatchCompletion(match) {
  if (match.winnerPairId && match.status !== "completed") {
    return {
      ...match,
      status: "completed",
      playedAt: match.playedAt ?? Date.now(),
    };
  }
  return match;
}

/** Drop stale live gold final matches once the division is crowned. */
function settleMedalMatchesAfterCrown(knockout) {
  const fin = knockout.rounds.find((r) => r.id === "final");
  const finalMatch = fin?.matches?.[0];
  if (!finalMatch || !isMatchComplete(finalMatch)) return knockout;

  const next = {
    ...knockout,
    rounds: knockout.rounds.map((round) => {
      if (round.id !== "final") return round;
      return {
        ...round,
        matches: round.matches.map((m) => {
          const normalized = normalizeMatchCompletion(m);
          if (isMatchComplete(normalized)) return normalized;
          if (normalized.status === "live") {
            return {
              ...cleanLegacyPairFields(normalized),
              status: "scheduled",
              scoreA: 0,
              scoreB: 0,
              winnerPairId: null,
              teamA: undefined,
              teamB: undefined,
              basePlayerA: undefined,
              basePlayerB: undefined,
              sidesSwapped: undefined,
              startedAt: undefined,
            };
          }
          return normalized;
        }),
      };
    }),
  };
  return updateKnockoutPhase(next);
}

/** Add bronze match + SF loser feeds to brackets created before this feature. */
function ensureBronzeMatch(knockout) {
  if (!knockout?.initialized) return knockout;
  if (knockout.rounds.some((r) => r.id === "bronze")) return knockout;

  const sfRound = knockout.rounds.find((r) => r.id === "sf");
  const finalRound = knockout.rounds.find((r) => r.id === "final");
  const finalMatch = finalRound?.matches?.[0];
  if (!sfRound || !finalRound) return knockout;

  // Division already crowned — do not inject a new bronze match onto courts
  if (finalMatch && isMatchComplete(finalMatch)) return knockout;

  const sfMatches = sfRound.matches ?? [];
  const sf1 = sfMatches.find((m) => m.id === "sf-1");
  const sf2 = sfMatches.find((m) => m.id === "sf-2");
  const courtFromSf = sf2?.courtId ? sf2 : sf1;

  const bronzeMatch = makeMatch({
    id: "bronze-1",
    roundId: "bronze",
    label: "Bronze medal match",
    pairAId: null,
    pairBId: null,
    courtId: courtFromSf?.courtId ?? null,
    courtName: courtFromSf?.courtName ?? null,
    feederIds: ["sf-1", "sf-2"],
  });

  const rounds = knockout.rounds.map((round) => {
    if (round.id === "sf") {
      return {
        ...round,
        matches: round.matches.map((m) => {
          if (m.id === "sf-1") {
            return {
              ...m,
              feedsLoserMatchId: "bronze-1",
              feedsLoserSlot: "pairAId",
            };
          }
          if (m.id === "sf-2") {
            return {
              ...m,
              feedsLoserMatchId: "bronze-1",
              feedsLoserSlot: "pairBId",
            };
          }
          return m;
        }),
      };
    }
    if (round.id === "final") {
      return {
        ...round,
        label: "Gold medal match",
        matches: round.matches.map((m) => ({
          ...m,
          label: "Gold medal match",
        })),
      };
    }
    return round;
  });

  return {
    ...knockout,
    rounds: [
      ...rounds,
      { id: "bronze", label: "Bronze medal match", matches: [bronzeMatch] },
    ],
  };
}

/** Re-apply feeder winners/losers and migrate legacy pairA/pairB fields. */
export function repairKnockoutBracket(knockout) {
  if (!knockout?.initialized) return knockout;

  let next = ensureBronzeMatch({
    ...knockout,
    rounds: knockout.rounds.map((round) => ({
      ...round,
      matches: (round.matches ?? []).map((m) =>
        normalizeMatchCompletion(cleanLegacyPairFields(m))
      ),
    })),
  });

  next = settleMedalMatchesAfterCrown(next);

  for (const roundId of ["qf", "sf", "final", "bronze"]) {
    const round = next.rounds.find((r) => r.id === roundId);
    if (!round) continue;
    for (const m of round.matches) {
      if (!isMatchComplete(m) || !m.winnerPairId) continue;
      const loserPairId =
        m.pairAId && m.pairBId
          ? m.winnerPairId === m.pairAId
            ? m.pairBId
            : m.pairAId
          : null;
      next = propagateMatchResults(next, m, m.winnerPairId, loserPairId);
    }
  }

  return next;
}

function propagateSlot(knockout, targetMatchId, slot, pairId) {
  if (!targetMatchId || !slot || !pairId) return knockout;

  const rounds = knockout.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((m) => {
      if (m.id !== targetMatchId) return m;
      return cleanLegacyPairFields({ ...m, [slot]: pairId });
    }),
  }));

  return { ...knockout, rounds };
}

function propagateMatchResults(knockout, completedMatch, winnerPairId, loserPairId) {
  let next = knockout;

  if (completedMatch.feedsMatchId && completedMatch.feedsSlot) {
    next = propagateSlot(
      next,
      completedMatch.feedsMatchId,
      normalizeFeedSlot(completedMatch.feedsSlot),
      winnerPairId
    );
  }

  if (completedMatch.feedsLoserMatchId && completedMatch.feedsLoserSlot && loserPairId) {
    next = propagateSlot(
      next,
      completedMatch.feedsLoserMatchId,
      normalizeFeedSlot(completedMatch.feedsLoserSlot),
      loserPairId
    );
  }

  return updateKnockoutPhase(next);
}

export function isCourtBusyForKnockout(event, courtId, divisionId, roundId, matchId) {
  const activeId = getCourtOccupyingDivisionId(event, courtId);

  for (const [divId, divSetup] of Object.entries(event.tournamentDivisions ?? {})) {
    if (activeId && divId !== activeId) continue;
    for (const round of divSetup.knockout?.rounds ?? []) {
      for (const m of round.matches ?? []) {
        if (m.courtId !== courtId) continue;
        if (
          isMatchLive(m) &&
          !(divId === divisionId && round.id === roundId && m.id === matchId)
        ) {
          return true;
        }
      }
    }

    for (const bracket of divSetup.brackets ?? []) {
      if (bracket.courtId !== courtId) continue;
      for (const m of bracket.matches ?? []) {
        if (isMatchLive(m)) return true;
      }
    }
  }
  return false;
}

export function autoStartKnockoutMatches(knockout, event, divisionId, pairById) {
  if (!knockout?.initialized) return knockout;
  // Host chooses base players and starts each match from the live court card.
  return updateKnockoutPhase(knockout);
}

export function ensureDivisionKnockout(divisionSetup, courts, event, divisionId) {
  const divId = divisionId ?? divisionSetup.divisionId;
  if (!divisionSetup.advancement?.ready) return divisionSetup;
  if (divisionSetup.knockout?.initialized) {
    const pairById = new Map(
      (event.pairRegistrations ?? []).map((p) => [p.id, p])
    );
    let knockout = repairKnockoutBracket(divisionSetup.knockout);
    const setupWithKnockout = { ...divisionSetup, knockout };
    const eventSnap = mergeKnockoutIntoEvent(event, divId, setupWithKnockout);

    if (
      knockout.phase !== "complete" &&
      !isDivisionComplete(setupWithKnockout)
    ) {
      knockout = autoStartKnockoutMatches(
        knockout,
        eventSnap,
        divId,
        pairById
      );
    }
    return { ...divisionSetup, divisionId: divId, knockout };
  }

  const knockout = buildKnockoutBracket(divisionSetup.advancement, courts);
  const pairById = new Map((event.pairRegistrations ?? []).map((p) => [p.id, p]));
  const started = autoStartKnockoutMatches(knockout, event, divId, pairById);

  return { ...divisionSetup, divisionId: divId, knockout: started };
}

/** Start all quarterfinal matches that can occupy idle courts. */
export function startQuarterfinalMatches(knockout, event, divisionId, pairById) {
  if (!knockout) return knockout;
  return autoStartKnockoutMatches(
    { ...knockout, phase: "quarterfinals" },
    event,
    divisionId,
    pairById
  );
}

export function quarterfinalsHaveStarted(knockout) {
  const qf = knockout?.rounds?.find((r) => r.id === "qf");
  return (qf?.matches ?? []).some(
    (m) => m.status === "live" || m.status === "completed"
  );
}

export function applyKnockoutMatchPatch(
  knockout,
  roundId,
  matchId,
  patch,
  pairById,
  divisionId,
  event
) {
  const { match: existing } = getKnockoutMatch(knockout, roundId, matchId);
  if (!existing) return knockout;

  if (patch.status === "live" && existing.courtId) {
    if (isCourtBusyForKnockout(event, existing.courtId, divisionId, roundId, matchId)) {
      throw new Error("Another match is already live on this court.");
    }
  }

  let completedMatch = null;
  let winnerPairId = null;

  const rounds = knockout.rounds.map((round) => {
    if (round.id !== roundId) return round;

    const matches = round.matches.map((m) => {
      if (m.id !== matchId) return m;

      let next = { ...m, ...patch };
      const scoreA = patch.scoreA ?? m.scoreA ?? 0;
      const scoreB = patch.scoreB ?? m.scoreB ?? 0;
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

      winnerPairId = patch.winnerPairId ?? m.winnerPairId;
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
        completedMatch = next;
      } else if (patch.status === "live") {
        next.winnerPairId = null;
      }

      return next;
    });

    return { ...round, matches };
  });

  let next = updateKnockoutPhase({ ...knockout, rounds });
  if (completedMatch && winnerPairId) {
    const loserPairId =
      existing.pairAId && existing.pairBId
        ? winnerPairId === existing.pairAId
          ? existing.pairBId
          : existing.pairAId
        : null;
    next = propagateMatchResults(next, completedMatch, winnerPairId, loserPairId);
    const eventSnap = mergeKnockoutIntoEvent(event, divisionId, {
      ...(event.tournamentDivisions?.[divisionId] ?? {}),
      knockout: next,
    });
    next = autoStartKnockoutMatches(next, eventSnap, divisionId, pairById);
  }

  return next;
}

export function getActiveKnockoutRoundLabel(knockout) {
  switch (knockout?.phase) {
    case "semifinals":
      return "Semifinals";
    case "final":
      return "Gold & bronze medal matches";
    case "complete":
      return "Champion crowned";
    default:
      return "Quarterfinals";
  }
}
