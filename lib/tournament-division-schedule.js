import {
  divisionLabel,
  getEventDivisions,
  getOfferedDivisions,
  getDivisionById,
} from "@/lib/tournament-divisions";
import { skillForCourt } from "@/lib/tournament-court-pools";
import {
  getKnockoutChampionPairId,
  hasPendingBronzeMatch,
  isKnockoutFullyComplete,
} from "@/lib/tournament-knockout-ui";
import { isMatchComplete, isMatchLive } from "@/lib/tournament-live";

export function getDivisionChampionPairId(divSetup) {
  if (!divSetup) return null;
  if (divSetup.championPairId) return divSetup.championPairId;
  return getKnockoutChampionPairId(divSetup.knockout);
}

export function divisionHasMatchProgress(divSetup) {
  if (!divSetup) return false;

  for (const bracket of divSetup.brackets ?? []) {
    for (const match of bracket.matches ?? []) {
      if (isMatchLive(match) || isMatchComplete(match)) return true;
    }
  }

  for (const round of divSetup.knockout?.rounds ?? []) {
    for (const match of round.matches ?? []) {
      if (isMatchLive(match) || isMatchComplete(match)) return true;
    }
  }

  return false;
}

export function isDivisionComplete(divSetup) {
  if (!divSetup) return false;
  if (divSetup.knockout?.initialized) {
    return isKnockoutFullyComplete(divSetup.knockout);
  }
  if (hasPendingBronzeMatch(divSetup.knockout)) return false;
  if (divSetup.divisionComplete === true) return true;
  return false;
}

export function enrichDivisionCompletion(divSetup) {
  if (!divSetup) return divSetup;
  if (hasPendingBronzeMatch(divSetup.knockout)) {
    return {
      ...divSetup,
      divisionComplete: false,
      knockout: divSetup.knockout
        ? {
            ...divSetup.knockout,
            phase:
              divSetup.knockout.phase === "complete"
                ? "final"
                : divSetup.knockout.phase,
          }
        : divSetup.knockout,
    };
  }
  const champion = getKnockoutChampionPairId(divSetup.knockout);
  if (
    divSetup.knockout?.initialized
      ? isKnockoutFullyComplete(divSetup.knockout)
      : (champion || divSetup.knockout?.phase === "complete") &&
        !hasPendingBronzeMatch(divSetup.knockout)
  ) {
    return {
      ...divSetup,
      divisionComplete: true,
      championPairId: champion ?? divSetup.championPairId ?? null,
    };
  }
  return divSetup;
}

/** Host-defined play order within a skill tier (defaults to offered division order). */
export function getTierDivisionOrder(event, skill) {
  const offered = getOfferedDivisions(event).filter((d) => d.skill === skill);
  const custom = event.tierDivisionOrder?.[skill];
  if (Array.isArray(custom) && custom.length) {
    const ids = new Set(offered.map((d) => d.id));
    const ordered = custom.filter((id) => ids.has(id));
    for (const d of offered) {
      if (!ordered.includes(d.id)) ordered.push(d.id);
    }
    return ordered;
  }
  return offered.map((d) => d.id);
}

/**
 * First in-progress division within a skill tier (host order, then offered list).
 */
export function resolveActiveDivisionIdForSkill(event, skill) {
  if (!skill) return null;
  const divs = event.tournamentDivisions ?? {};

  for (const divisionId of getTierDivisionOrder(event, skill)) {
    const setup = divs[divisionId];
    if (!setup) continue;
    if (isDivisionComplete(setup)) continue;
    if (setup.brackets?.length || setup.knockout?.initialized) {
      return divisionId;
    }
  }

  return null;
}

export function getActiveDivisionForDivision(event, divisionId) {
  const skill = getDivisionById(event, divisionId)?.skill;
  return skill ? resolveActiveDivisionIdForSkill(event, skill) : null;
}

/**
 * @deprecated Prefer getCourtOccupyingDivisionId(event, courtId) or getActiveDivisionForDivision.
 */
export function resolveActiveDivisionId(event) {
  for (const division of getEventDivisions(event)) {
    const active = resolveActiveDivisionIdForSkill(event, division.skill);
    if (active) return active;
  }
  return null;
}

/** Active division for a court's skill pool (or first active if courtId omitted). */
export function getCourtOccupyingDivisionId(event, courtId = null) {
  if (courtId) {
    const skill = skillForCourt(event, courtId);
    if (skill) return resolveActiveDivisionIdForSkill(event, skill);
  }
  return resolveActiveDivisionId(event);
}

export function assertCanBracketDivision(
  event,
  divisionId,
  { regenerate = false, force = false } = {}
) {
  const divs = event.tournamentDivisions ?? {};
  const existing = divs[divisionId];

  if (existing && isDivisionComplete(existing) && !(regenerate && force)) {
    throw new Error(
      `${divisionLabel(divisionId, event)} is finished. Regenerate with erase to start this division over.`
    );
  }

  if (
    existing &&
    divisionHasMatchProgress(existing) &&
    !isDivisionComplete(existing) &&
    !regenerate &&
    !force
  ) {
    throw new Error(
      `${divisionLabel(divisionId, event)} already has match results. Regenerate this division to erase scores and rebuild brackets.`
    );
  }

  if (
    existing?.brackets?.length &&
    !divisionHasMatchProgress(existing) &&
    !regenerate
  ) {
    throw new Error(
      `${divisionLabel(divisionId, event)} is already bracketed. Use regenerate to rebuild brackets.`
    );
  }

}

export function assertCanUseCourtsForDivision(event, divisionId) {
  if (isDivisionComplete(event.tournamentDivisions?.[divisionId])) {
    throw new Error(
      `${divisionLabel(divisionId, event)} is finished. Courts belong to the next division in this tier.`
    );
  }

  const activeInPool = getActiveDivisionForDivision(event, divisionId);
  if (activeInPool && activeInPool !== divisionId) {
    throw new Error(
      `Courts are reserved for ${divisionLabel(activeInPool, event)} in this skill tier. View other divisions in the tabs — their history is still here.`
    );
  }
}

export function syncActiveDivision(event) {
  const activeDivisionId = resolveActiveDivisionId(event);
  return { ...event, activeDivisionId };
}
