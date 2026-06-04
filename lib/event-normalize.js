import { normalizePaymentConfig } from "@/lib/tournament-payment";

export function normalizeEvent(event) {
  const status = event.status === "ended" ? "ended" : "active";
  const isTournament = event.type === "tournament";

  return {
    registrations: [],
    courts: [],
    matchHistory: [],
    pairRegistrations: [],
    tournamentDivisions: {},
    extraTournamentDivisions: [],
    tournamentPhase: "registration",
    activeDivisionId: null,
    liveStreamUrl: "",
    liveStreamEnabled: false,
    registrationClosesAt: null,
    divisionPairLimit: 20,
    offeredDivisionIds: [],
    paymentConfig: {
      entryFee: "",
      gcash: { enabled: false, number: "" },
      bankQr: { enabled: false, imageDataUrl: "" },
    },
    status: "active",
    endedAt: null,
    ...event,
    hostId: event.hostId
      ? String(event.hostId).trim().toLowerCase()
      : event.hostId ?? "",
    status,
    endedAt: status === "ended" ? event.endedAt ?? null : null,
    registrations: event.registrations ?? [],
    pairRegistrations: event.pairRegistrations ?? [],
    tournamentDivisions: event.tournamentDivisions ?? {},
    extraTournamentDivisions: isTournament
      ? event.extraTournamentDivisions ?? []
      : event.extraTournamentDivisions,
    tournamentPhase: isTournament
      ? event.tournamentPhase ?? "registration"
      : event.tournamentPhase,
    registrationClosesAt: isTournament
      ? event.registrationClosesAt ?? null
      : event.registrationClosesAt,
    divisionPairLimit: isTournament
      ? event.divisionPairLimit ?? 20
      : event.divisionPairLimit,
    offeredDivisionIds: isTournament
      ? Array.isArray(event.offeredDivisionIds)
        ? event.offeredDivisionIds
        : []
      : event.offeredDivisionIds,
    tierDivisionOrder: isTournament
      ? event.tierDivisionOrder ?? {}
      : event.tierDivisionOrder,
    paymentConfig: normalizePaymentConfig(event.paymentConfig),
    matchHistory: event.matchHistory ?? [],
    courts: (event.courts ?? []).map((c) => ({
      autoMatch: true,
      aiAnnounce: true,
      lastMatch: false,
      liveVideoUrl: "",
      liveVideoEnabled: false,
      status: "idle",
      currentMatch: null,
      pendingMatch: null,
      queue: [],
      ...c,
      autoMatch: c.autoMatch ?? true,
      aiAnnounce: c.aiAnnounce ?? true,
      lastMatch: c.lastMatch === true,
      pendingMatch: c.pendingMatch ?? null,
      queue: Array.isArray(c.queue) ? c.queue : [],
    })),
  };
}
