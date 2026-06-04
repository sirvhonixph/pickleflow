import {
  alignTeamToScore,
  ensureTeamSides,
  getTeamHalf,
  initDoublesPositions,
} from "@/lib/court-positions";
import { getPairBasePlayerId, pairBasePlayerChosen } from "@/lib/tournament-pairs";
import { pairDisplayName, getDivisionById, divisionLabel } from "@/lib/tournament-divisions";
import {
  getCourtOccupyingDivisionId,
  isDivisionComplete,
} from "@/lib/tournament-division-schedule";
import { isKnockoutFullyComplete } from "@/lib/tournament-knockout-ui";
import { mergeRoundRobinSchedule } from "@/lib/tournament-brackets";
import {
  isForfeitMatch,
  isVoidMatchResult,
} from "@/lib/tournament-match-outcome";

export function pairToTeamPlayers(pair, skill = "novice") {
  return [
    { ...pair.player1, category: skill },
    { ...pair.player2, category: skill },
  ];
}

/** True when a live-match patch changes court layout (not score-only). */
export function patchNeedsLayoutRefresh(patch) {
  return (
    patch.teamA !== undefined ||
    patch.teamB !== undefined ||
    patch.basePlayerA !== undefined ||
    patch.basePlayerB !== undefined ||
    patch.sidesSwapped !== undefined
  );
}

export function matchPairBasesReady(match, pairById) {
  if (!match?.pairAId || !match?.pairBId) return false;
  return (
    pairBasePlayerChosen(pairById.get(match.pairAId)) &&
    pairBasePlayerChosen(pairById.get(match.pairBId))
  );
}

export function assertMatchPairBasesReady(match, pairById) {
  if (!matchPairBasesReady(match, pairById)) {
    throw new Error(
      "Set the base player for each pair in Edit pairs before starting this match."
    );
  }
}

function assertValidMatchBasePlayer(pair, playerId, label) {
  if (playerId == null || playerId === "") return;
  const allowed = [pair?.player1?.playerId, pair?.player2?.playerId].filter(Boolean);
  if (!allowed.includes(playerId)) {
    throw new Error(`${label} must be one of that pair's two partners.`);
  }
}

export function validateMatchBasePatch(match, pairById, patch) {
  if (patch.basePlayerA !== undefined) {
    assertValidMatchBasePlayer(
      pairById.get(match.pairAId),
      patch.basePlayerA,
      "Base player for pair A"
    );
  }
  if (patch.basePlayerB !== undefined) {
    assertValidMatchBasePlayer(
      pairById.get(match.pairBId),
      patch.basePlayerB,
      "Base player for pair B"
    );
  }
}

export function ensureTournamentMatchLayout(match, pairById, divisionId, event) {
  const pairA = pairById.get(match.pairAId);
  const pairB = pairById.get(match.pairBId);
  if (!pairA || !pairB) return match;

  const skill = getDivisionById(event, divisionId)?.skill ?? "novice";
  const teamA = pairToTeamPlayers(pairA, skill);
  const teamB = pairToTeamPlayers(pairB, skill);
  const pairBaseA = getPairBasePlayerId(pairA) ?? teamA[0]?.playerId ?? null;
  const pairBaseB = getPairBasePlayerId(pairB) ?? teamB[0]?.playerId ?? null;

  if (match.teamA?.length && match.teamB?.length) {
    const swapped = match.sidesSwapped ?? false;
    const scoreA = match.scoreA ?? 0;
    const scoreB = match.scoreB ?? 0;
    const baseA = match.basePlayerA ?? pairBaseA;
    const baseB = match.basePlayerB ?? pairBaseB;
    let teamA = ensureTeamSides(match.teamA);
    let teamB = ensureTeamSides(match.teamB);
    if (baseA) {
      teamA = alignTeamToScore(teamA, baseA, getTeamHalf("A", swapped), scoreA);
    }
    if (baseB) {
      teamB = alignTeamToScore(teamB, baseB, getTeamHalf("B", swapped), scoreB);
    }
    return {
      ...match,
      teamA,
      teamB,
      basePlayerA: baseA,
      basePlayerB: baseB,
      sidesSwapped: swapped,
    };
  }

  return {
    ...match,
    ...initDoublesPositions(teamA, teamB, pairBaseA, pairBaseB),
    basePlayerA: pairBaseA,
    basePlayerB: pairBaseB,
    startedAt: match.startedAt ?? Date.now(),
  };
}

export function winnerPairIdFromMatch(match) {
  if (!match) return null;
  if (match.winnerPairId) return match.winnerPairId;
  const scoreA = match.scoreA ?? 0;
  const scoreB = match.scoreB ?? 0;
  if (scoreA > scoreB) return match.pairAId;
  if (scoreB > scoreA) return match.pairBId;
  return null;
}

export function matchCountsForStandings(match) {
  if (!match || isVoidMatchResult(match)) return false;
  if (isForfeitMatch(match)) return true;
  return isMatchComplete(match) && winnerPairIdFromMatch(match) != null;
}

export function isMatchComplete(match) {
  if (!match) return false;
  if (isVoidMatchResult(match)) return false;
  if (match.status === "live") return false;
  if (isForfeitMatch(match)) return true;
  if (match.status === "completed" && match.winnerPairId) return true;
  if (match.playedAt != null && match.winnerPairId) return true;
  const scoreA = match.scoreA ?? 0;
  const scoreB = match.scoreB ?? 0;
  if (scoreA === 0 && scoreB === 0) return false;
  return (
    (match.status === "completed" || match.playedAt != null) &&
    !!winnerPairIdFromMatch(match)
  );
}

/** True if this pairing can be started (round robin = once per pair-up). */
export function isMatchPlayable(match) {
  if (!match?.pairAId || !match?.pairBId) return false;
  if (isMatchLive(match)) return false;
  if (isVoidMatchResult(match)) return true;
  if (matchCountsForStandings(match)) return false;
  return match.status === "scheduled";
}

export function isMatchLive(match) {
  return match.status === "live";
}

export function refreshPairNamesInLiveMatches(event, pairId) {
  if (!pairId || event.type !== "tournament") return event;

  const pairById = new Map(
    (event.pairRegistrations ?? []).map((p) => [p.id, p])
  );
  const divisions = { ...(event.tournamentDivisions ?? {}) };

  const syncMatch = (m, divisionId) => {
    if (m.pairAId !== pairId && m.pairBId !== pairId) return m;
    if (!m.teamA?.length || !m.teamB?.length) return m;

    const skill = getDivisionById(event, divisionId)?.skill ?? "novice";
    const pairA = pairById.get(m.pairAId);
    const pairB = pairById.get(m.pairBId);
    if (!pairA || !pairB) return m;

    const freshA = pairToTeamPlayers(pairA, skill);
    const freshB = pairToTeamPlayers(pairB, skill);

    const remapTeam = (team, fresh) =>
      team.map((slot) => {
        const updated = fresh.find((p) => p.playerId === slot.playerId);
        return updated
          ? { ...slot, name: updated.name, category: updated.category }
          : slot;
      });

    return {
      ...m,
      teamA: remapTeam(m.teamA, freshA),
      teamB: remapTeam(m.teamB, freshB),
    };
  };

  for (const [divisionId, div] of Object.entries(divisions)) {
    let next = { ...div };
    next.brackets = (div.brackets ?? []).map((b) => ({
      ...b,
      matches: (b.matches ?? []).map((m) => syncMatch(m, divisionId)),
    }));
    if (div.knockout?.rounds) {
      next = {
        ...next,
        knockout: {
          ...div.knockout,
          rounds: (div.knockout.rounds ?? []).map((round) => ({
            ...round,
            matches: (round.matches ?? []).map((m) => syncMatch(m, divisionId)),
          })),
        },
      };
    }
    divisions[divisionId] = next;
  }

  return { ...event, tournamentDivisions: divisions };
}

/** Live + bracket/knockout context for each physical court */
export function getCourtTournamentState(event, courtId) {
  let live = null;
  const scheduled = [];
  const activeDivisionId = getCourtOccupyingDivisionId(event, courtId);

  const pushMatch = (ctx) => {
    if (isMatchLive(ctx.match)) {
      if (!live || ctx.phase === "knockout") live = ctx;
    } else if (isMatchPlayable(ctx.match)) {
      scheduled.push(ctx);
    }
  };

  for (const [divisionId, divSetup] of Object.entries(
    event.tournamentDivisions ?? {}
  )) {
    if (isDivisionComplete(divSetup)) continue;
    if (activeDivisionId && divisionId !== activeDivisionId) continue;
    if (
      divSetup.knockout?.initialized &&
      isKnockoutFullyComplete(divSetup.knockout)
    ) {
      continue;
    }

    for (const round of divSetup.knockout?.rounds ?? []) {
      for (const match of round.matches ?? []) {
        if (match.courtId !== courtId) continue;
        pushMatch({
          divisionId,
          divisionName: divisionLabel(divisionId, event),
          bracketId: round.id,
          roundId: round.id,
          bracketLabel: `${round.label} · ${match.label}`,
          phase: "knockout",
          match,
        });
      }
    }

    for (const bracket of divSetup.brackets ?? []) {
      if (bracket.courtId !== courtId) continue;
      if (
        divSetup.knockout?.initialized &&
        !isKnockoutFullyComplete(divSetup.knockout)
      ) {
        continue;
      }

      const poolMatches = mergeRoundRobinSchedule(
        bracket.matches,
        bracket.pairIds,
        { scheduleResetAt: divSetup.scheduleResetAt }
      );
      for (const match of poolMatches) {
        pushMatch({
          divisionId,
          divisionName: divisionLabel(divisionId, event),
          bracketId: bracket.id,
          bracketLabel: bracket.label,
          phase: "pool",
          bracket,
          match,
        });
      }
    }
  }

  scheduled.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase === "knockout" ? -1 : 1;
    if (a.bracket?.matches) {
      const ai = a.bracket.matches.indexOf(a.match);
      const bi = b.bracket.matches.indexOf(b.match);
      return ai - bi;
    }
    return 0;
  });

  return { live, scheduled, next: scheduled[0] ?? null };
}

/** Keep host's in-progress scores in shared event state (avoids poll/save resetting to 0). */
export function mergeLiveScoresIntoEvent(
  event,
  { courtId, divisionId, bracketId, matchId, scoreA, scoreB, localMatch }
) {
  if (!event || event.type !== "tournament" || !matchId) return event;

  const patchLive = (m) => {
    if (m.id !== matchId || m.status !== "live") return m;
    return {
      ...m,
      scoreA: scoreA ?? 0,
      scoreB: scoreB ?? 0,
      teamA: localMatch?.teamA?.length ? localMatch.teamA : m.teamA,
      teamB: localMatch?.teamB?.length ? localMatch.teamB : m.teamB,
      basePlayerA: localMatch?.basePlayerA ?? m.basePlayerA,
      basePlayerB: localMatch?.basePlayerB ?? m.basePlayerB,
      sidesSwapped: localMatch?.sidesSwapped ?? m.sidesSwapped,
    };
  };

  const divisions = { ...(event.tournamentDivisions ?? {}) };

  for (const [divId, div] of Object.entries(divisions)) {
    if (divisionId && divId !== divisionId) continue;
    let next = { ...div };

    next.brackets = (next.brackets ?? []).map((b) => {
      if (bracketId && b.id !== bracketId) return b;
      if (!bracketId && b.courtId !== courtId) return b;
      return {
        ...b,
        matches: (b.matches ?? []).map(patchLive),
      };
    });

    if (next.knockout?.rounds) {
      next = {
        ...next,
        knockout: {
          ...next.knockout,
          rounds: next.knockout.rounds.map((round) => ({
            ...round,
            matches: (round.matches ?? []).map((m) => {
              if (m.courtId !== courtId) return m;
              return patchLive(m);
            }),
          })),
        },
      };
    }

    divisions[divId] = next;
  }

  return { ...event, tournamentDivisions: divisions };
}

export function getAllLiveTournamentMatches(event) {
  const out = [];
  for (const court of event.courts ?? []) {
    const { live } = getCourtTournamentState(event, court.id);
    if (live) out.push({ court, ...live });
  }
  return out;
}
