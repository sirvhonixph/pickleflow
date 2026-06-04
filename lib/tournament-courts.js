import { divisionLabel } from "@/lib/tournament-divisions";
import {
  divisionHasMatchProgress,
  isDivisionComplete,
} from "@/lib/tournament-division-schedule";
import { isMatchComplete, isMatchLive } from "@/lib/tournament-live";

export function getCourtBracketAssignment(event, courtId) {
  for (const [divisionId, div] of Object.entries(
    event.tournamentDivisions ?? {}
  )) {
    for (const bracket of div.brackets ?? []) {
      if (bracket.courtId === courtId) {
        return { divisionId, bracket, divSetup: div };
      }
    }
  }
  return null;
}

export function assertCanRemoveTournamentCourt(event, courtId) {
  const courts = event.courts ?? [];
  if (courts.length <= 1) {
    throw new Error("Keep at least one court.");
  }

  const court = courts.find((c) => c.id === courtId);
  if (!court) {
    throw new Error("Court not found.");
  }

  if (court.status === "live") {
    throw new Error("End the live match before removing this court.");
  }
  if (court.status === "pending") {
    throw new Error("Cancel or confirm the pending match before removing this court.");
  }

  const assignment = getCourtBracketAssignment(event, courtId);
  if (assignment) {
    const { divisionId, bracket, divSetup } = assignment;
    if (divisionHasMatchProgress(divSetup) && !isDivisionComplete(divSetup)) {
      throw new Error(
        `Cannot remove ${court.name} — ${divisionLabel(divisionId, event)} has matches on this court.`
      );
    }
    throw new Error(
      `${court.name} is assigned to ${bracket.label} in ${divisionLabel(divisionId, event)}. Finish or clear that division's brackets before removing this court.`
    );
  }

  for (const [divisionId, div] of Object.entries(
    event.tournamentDivisions ?? {}
  )) {
    for (const round of div.knockout?.rounds ?? []) {
      for (const match of round.matches ?? []) {
        if (match.courtId !== courtId) continue;
        if (isMatchLive(match) || isMatchComplete(match)) {
          throw new Error(
            `Cannot remove ${court.name} — knockout matches are scheduled or in progress on this court (${divisionLabel(divisionId, event)}).`
          );
        }
      }
    }
  }
}
