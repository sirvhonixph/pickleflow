import {
  divisionLabel,
  getDivisionById,
  pairDisplayName,
  pairsInDivision,
} from "@/lib/tournament-divisions";
import {
  getDivisionPairLimit,
  isRegistrationClosed,
} from "@/lib/tournament-registration";
import { validateTournamentRegistration } from "@/lib/tournament-payment";
import {
  assertTournamentNameCategoryRules,
  skillFromDivisionId,
} from "@/lib/tournament-name-rules";
import { refreshPairNamesInLiveMatches } from "@/lib/tournament-live";
import { refreshTournamentStandings } from "@/lib/tournament-setup";

function slugEmail(name, prefix) {
  return `${prefix}-${name.toLowerCase().replace(/\s+/g, "-")}@tournament.local`;
}

function assertPairCanBeAdded(event, divisionId, { allowClosed = false } = {}) {
  if (!allowClosed) {
    if (isRegistrationClosed(event)) {
      throw new Error("Registration is closed.");
    }
    if (
      event.tournamentPhase === "pool_play" ||
      event.tournamentPhase === "knockout"
    ) {
      throw new Error("Registration closed — tournament in progress.");
    }
  }

  if (!getDivisionById(event, divisionId)) {
    throw new Error("Select a valid division.");
  }

  const limit = getDivisionPairLimit(event);
  if (pairsInDivision(event, divisionId).length >= limit) {
    throw new Error("This division is full.");
  }

  if (event.tournamentDivisions?.[divisionId]) {
    throw new Error("Brackets already set for this division.");
  }
}

export function isPlayerInAnyPair(event, playerId) {
  return (event.pairRegistrations ?? []).some(
    (p) =>
      p.player1?.playerId === playerId ||
      p.player2?.playerId === playerId ||
      p.sourceRegistrationId === playerId
  );
}

function buildPairRecord({
  divisionId,
  player1Id,
  player1Name,
  player2Id,
  player2Name,
  teamName,
  clubName,
  sourceRegistrationId,
}) {
  return {
    id: `pair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    divisionId,
    player1: {
      playerId: player1Id,
      name: player1Name,
      email: player1Id,
    },
    player2: {
      playerId: player2Id,
      name: player2Name,
      email: player2Id,
    },
    teamName: teamName?.trim() || "",
    clubName: clubName?.trim() || "",
    basePlayerId: null,
    registeredAt: Date.now(),
    sourceRegistrationId: sourceRegistrationId ?? null,
  };
}

export function getPairBasePlayerId(pair) {
  if (!pair?.basePlayerId) return null;
  const p1 = pair.player1?.playerId;
  const p2 = pair.player2?.playerId;
  if ([p1, p2].includes(pair.basePlayerId)) {
    return pair.basePlayerId;
  }
  return null;
}

export function pairBasePlayerChosen(pair) {
  return !!getPairBasePlayerId(pair);
}

function appendPair(event, pair) {
  return {
    ...event,
    pairRegistrations: [...(event.pairRegistrations ?? []), pair],
  };
}

function buildTournamentEntry(event, reg, pairId) {
  return {
    pairName: reg.pairName,
    partnerName: reg.partnerName,
    clubName: reg.clubName,
    divisionId: reg.divisionId,
    divisionLabel: divisionLabel(reg.divisionId, event),
    paymentMethod: reg.paymentMethod,
    paymentProofDataUrl: reg.paymentProofDataUrl,
    status: "paid",
    pairId,
    submittedAt: Date.now(),
    approvedAt: Date.now(),
  };
}

export function addPairRegistration(event, body) {
  assertPairCanBeAdded(event, body.divisionId);

  const p1Name = body.player1Name?.trim();
  const p2Name = body.player2Name?.trim();
  if (!p1Name || !p2Name) {
    throw new Error("Both player names are required.");
  }

  const existing = (event.pairRegistrations ?? []).find(
    (pair) =>
      pair.divisionId === body.divisionId &&
      pair.player1?.name === p1Name &&
      pair.player2?.name === p2Name
  );
  if (existing) {
    return event;
  }

  const category = skillFromDivisionId(body.divisionId, event);
  assertTournamentNameCategoryRules(event, {
    registrantName: p1Name,
    partnerName: p2Name,
    category,
  });

  const player1Id = body.player1Email?.trim() || slugEmail(p1Name, "p1");
  const player2Id = body.player2Email?.trim() || slugEmail(p2Name, "p2");

  const pair = buildPairRecord({
    divisionId: body.divisionId,
    player1Id,
    player1Name: p1Name,
    player2Id,
    player2Name: p2Name,
    teamName: body.teamName,
  });

  return appendPair(event, pair);
}

/** Add pair for a registration that has payment proof but no pair yet. */
export function addPairForExistingRegistration(
  event,
  registration,
  { allowClosed = false } = {}
) {
  const entry = registration.tournamentEntry;
  if (!entry?.paymentProofDataUrl) {
    return event;
  }
  if (entry.pairId) {
    return event;
  }

  assertPairCanBeAdded(event, entry.divisionId, { allowClosed });

  const pair = buildPairRecord({
    divisionId: entry.divisionId,
    player1Id: registration.playerId,
    player1Name: registration.name ?? registration.email ?? "Player",
    player2Id: slugEmail(entry.partnerName, "p2"),
    player2Name: entry.partnerName,
    teamName: entry.pairName,
    clubName: entry.clubName,
    sourceRegistrationId: registration.playerId,
  });

  const regKey = registration.registrationId ?? registration.playerId;
  const registrations = event.registrations.map((r) =>
    (r.registrationId ?? r.playerId) === regKey
      ? {
          ...r,
          tournamentEntry: {
            ...entry,
            status: "paid",
            pairId: pair.id,
            approvedAt: Date.now(),
          },
        }
      : r
  );

  return appendPair({ ...event, registrations }, pair);
}

/** Backfill pairs for paid registrations that were not auto-added yet. */
export function syncTournamentRegistrationPairs(event) {
  if (event.type !== "tournament") return event;

  let next = event;
  for (const reg of event.registrations ?? []) {
    try {
      next = addPairForExistingRegistration(next, reg, { allowClosed: true });
    } catch {
      /* division full or brackets set — skip */
    }
  }
  return next;
}

/** Player self-registration with payment — adds registration and pair in one step. */
export function applyTournamentPlayerRegistration(event, player) {
  const playerId = (player.playerId ?? player.email ?? "").trim();
  const reg = validateTournamentRegistration(event, player);
  assertPairCanBeAdded(event, reg.divisionId);

  const pair = buildPairRecord({
    divisionId: reg.divisionId,
    player1Id: playerId,
    player1Name: player.name ?? player.email ?? "Player",
    player2Id: slugEmail(reg.partnerName, "p2"),
    player2Name: reg.partnerName,
    teamName: reg.pairName,
    clubName: reg.clubName,
    sourceRegistrationId: playerId,
  });

  const registrationId = `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const registrationRecord = {
    registrationId,
    playerId,
    name: player.name ?? player.email ?? "Player",
    email: player.email ?? playerId,
    category: reg.category,
    joinedAt: Date.now(),
    tournamentEntry: buildTournamentEntry(event, reg, pair.id),
  };

  return appendPair(
    {
      ...event,
      registrations: [...(event.registrations ?? []), registrationRecord],
    },
    pair
  );
}

export function enrichPair(pair) {
  return {
    ...pair,
    displayName: pairDisplayName(pair),
  };
}

function syncRegistrationForPair(event, pair) {
  return {
    ...event,
    registrations: (event.registrations ?? []).map((r) => {
      const entry = r.tournamentEntry;
      if (!entry) return r;

      const linked =
        (pair.sourceRegistrationId &&
          ((r.registrationId ?? r.playerId) === pair.sourceRegistrationId ||
            r.playerId === pair.sourceRegistrationId)) ||
        entry.pairId === pair.id;

      if (!linked) return r;

      return {
        ...r,
        name: pair.player1?.name ?? r.name,
        tournamentEntry: {
          ...entry,
          pairName: pair.teamName?.trim() || pair.player1?.name,
          partnerName: pair.player2?.name,
          pairId: pair.id,
        },
      };
    }),
  };
}

/** Host edits player or team names on a registered pair. */
export function updatePairRegistration(event, pairId, body) {
  const pair = (event.pairRegistrations ?? []).find((p) => p.id === pairId);
  if (!pair) {
    throw new Error("Pair not found.");
  }
  if (event.status === "ended") {
    throw new Error("Tournament has ended.");
  }

  const player1Name = body.player1Name?.trim();
  const player2Name = body.player2Name?.trim();
  if (!player1Name || !player2Name) {
    throw new Error("Both player names are required.");
  }

  const category = skillFromDivisionId(pair.divisionId, event);
  assertTournamentNameCategoryRules(event, {
    registrantName: player1Name,
    partnerName: player2Name,
    category,
    excludePairId: pairId,
  });

  const teamName = body.teamName?.trim() ?? pair.teamName ?? "";

  const updatedPair = {
    ...pair,
    player1: { ...pair.player1, name: player1Name },
    player2: { ...pair.player2, name: player2Name },
    teamName,
  };

  let next = {
    ...event,
    pairRegistrations: (event.pairRegistrations ?? []).map((p) =>
      p.id === pairId ? updatedPair : p
    ),
  };

  next = syncRegistrationForPair(next, updatedPair);
  next = refreshPairNamesInLiveMatches(next, pairId);
  next = refreshTournamentStandings(next);

  return next;
}

/** Host picks which partner starts as the base (baseline) player for this pair. */
export function updatePairBasePlayer(event, pairId, basePlayerId) {
  const pair = (event.pairRegistrations ?? []).find((p) => p.id === pairId);
  if (!pair) {
    throw new Error("Pair not found.");
  }
  if (event.status === "ended") {
    throw new Error("Tournament has ended.");
  }

  const allowed = [pair.player1?.playerId, pair.player2?.playerId].filter(Boolean);
  if (!allowed.includes(basePlayerId)) {
    throw new Error("Base player must be one of the two partners.");
  }

  const updatedPair = { ...pair, basePlayerId };
  let next = {
    ...event,
    pairRegistrations: (event.pairRegistrations ?? []).map((p) =>
      p.id === pairId ? updatedPair : p
    ),
  };

  next = refreshPairNamesInLiveMatches(next, pairId);
  return refreshTournamentStandings(next);
}
