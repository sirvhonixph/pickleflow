import { findPlayerOnCourt } from "@/lib/event-players";
import { divisionHasMatchProgress } from "@/lib/tournament-division-schedule";

function findRegistration(event, playerId, registrationId) {
  if (registrationId) {
    return (
      event.registrations?.find((r) => r.registrationId === registrationId) ??
      null
    );
  }
  return event.registrations?.find((r) => r.playerId === playerId) ?? null;
}

function findTournamentPairForRegistration(event, registration) {
  const pairId = registration?.tournamentEntry?.pairId;
  if (pairId) {
    return event.pairRegistrations?.find((p) => p.id === pairId) ?? null;
  }
  return null;
}

/** Host removes a player registration (e.g. fraudulent payment). */
export function removeHostRegistration(event, playerId, { registrationId } = {}) {
  if (event.status === "ended") {
    throw new Error("This event has ended.");
  }

  const reg = findRegistration(event, playerId, registrationId);
  if (!reg) {
    throw new Error("Registration not found.");
  }

  if (event.hostId === reg.playerId) {
    throw new Error("The host registration cannot be removed.");
  }

  const onCourt = findPlayerOnCourt(event, reg.playerId);
  if (onCourt) {
    throw new Error(
      `Cannot remove — player is live on ${onCourt}. End that match first.`
    );
  }

  let pairRegistrations = event.pairRegistrations ?? [];
  const regKey = reg.registrationId ?? reg.playerId;

  if (event.type === "tournament") {
    const pair = findTournamentPairForRegistration(event, reg);
    if (pair) {
      const divSetup = event.tournamentDivisions?.[pair.divisionId];
      if (divSetup && divisionHasMatchProgress(divSetup)) {
        throw new Error(
          "Cannot remove — this pair has already started bracket play."
        );
      }
      pairRegistrations = pairRegistrations.filter((p) => p.id !== pair.id);
    }
  }

  return {
    ...event,
    registrations: event.registrations.filter(
      (r) => (r.registrationId ?? r.playerId) !== regKey
    ),
    pairRegistrations,
    courts: (event.courts ?? []).map((c) => ({
      ...c,
      queue: (c.queue ?? []).filter((q) => q.playerId !== reg.playerId),
    })),
  };
}

export function hasRemovableRegistration(event, playerId, registrationId) {
  if (event.status === "ended") return false;
  const reg = findRegistration(event, playerId, registrationId);
  if (!reg || event.hostId === reg.playerId) return false;
  if (event.type === "tournament") {
    return Boolean(reg.tournamentEntry?.paymentProofDataUrl);
  }
  return Boolean(reg.paymentEntry?.paymentProofDataUrl);
}
