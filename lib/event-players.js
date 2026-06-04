import { removeHostRegistration } from "@/lib/event-registration-remove";

export function findPlayerOnCourt(event, playerId) {
  for (const court of event.courts ?? []) {
    if (court.status === "live" && court.currentMatch) {
      const onCourt = [
        ...(court.currentMatch.teamA ?? []),
        ...(court.currentMatch.teamB ?? []),
      ].some((p) => p.playerId === playerId);
      if (onCourt) return court.name;
    }
    if (court.status === "pending" && court.pendingMatch) {
      const onPending = [
        ...(court.pendingMatch.teamA ?? []),
        ...(court.pendingMatch.teamB ?? []),
      ].some((p) => p.playerId === playerId);
      if (onPending) return court.name;
    }
  }
  return null;
}

export function removePlayerFromEvent(event, playerId) {
  return removeHostRegistration(event, playerId);
}

export function addWalkInPlayer(event, { name, category, email }) {
  const trimmedName = name?.trim();
  if (!trimmedName) throw new Error("Player name is required.");
  if (!category) throw new Error("Skill category is required.");

  const playerId =
    email?.trim() ||
    `walkin-${trimmedName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}@event.local`;

  if (event.registrations?.some((r) => r.playerId === playerId)) {
    throw new Error("This player is already registered.");
  }

  return {
    ...event,
    registrations: [
      ...(event.registrations ?? []),
      {
        playerId,
        name: trimmedName,
        email: playerId,
        category,
        joinedAt: Date.now(),
      },
    ],
  };
}
