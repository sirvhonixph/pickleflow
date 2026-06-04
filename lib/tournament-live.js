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

export function pairToTeamPlayers(pair, skill = "novice") {
  return [
    { ...pair.player1, category: skill },
    { ...pair.player2, category: skill },
  ];
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

export function isMatchComplete(match) {
  return match.status === "completed" || !!match.winnerPairId;
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
        return updated ? { ...slot, name: updated.name, category: updated.category } : slot;
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
    } else if (!isMatchComplete(ctx.match) && ctx.match.pairAId && ctx.match.pairBId) {
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

      for (const match of bracket.matches ?? []) {
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

export function getAllLiveTournamentMatches(event) {
  const out = [];
  for (const court of event.courts ?? []) {
    const { live } = getCourtTournamentState(event, court.id);
    if (live) out.push({ court, ...live });
  }
  return out;
}
