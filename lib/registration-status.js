import {
  canRegisterAnotherTournamentEntry,
  getTournamentPairCountForPlayer,
  MAX_ENTRIES_PER_NAME_PER_CATEGORY,
} from "@/lib/tournament-name-rules";

/** Player has completed registration with payment proof attached. */
export function isPlayerRegistered(event, playerId) {
  if (!playerId) return false;
  if (event.type === "tournament") {
    return (event.registrations ?? []).some(
      (r) =>
        r.playerId === playerId &&
        Boolean(r.tournamentEntry?.paymentProofDataUrl)
    );
  }
  const reg = event.registrations?.find((r) => r.playerId === playerId);
  return Boolean(reg?.paymentEntry?.paymentProofDataUrl);
}

export function getTournamentRegistrationCount(event, playerId) {
  return getTournamentPairCountForPlayer(event, playerId);
}

export function canPlayerRegisterForTournament(event, playerId, playerName) {
  if (event.type !== "tournament") return false;
  return canRegisterAnotherTournamentEntry(event, playerId, playerName);
}

export function tournamentRegistrationLimitLabel() {
  return MAX_ENTRIES_PER_NAME_PER_CATEGORY;
}
