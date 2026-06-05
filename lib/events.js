import { getPlayerId, getCurrentUser } from "@/lib/session";
import { normalizeEvent } from "@/lib/event-normalize";
import { getPlayerCourtStatus } from "@/lib/matchmaking";
import { assertCanRemoveTournamentCourt } from "@/lib/tournament-courts";

const LEGACY_STORAGE_KEY = "pickleflow_events";
const MIGRATED_KEY = "pickleflow_events_migrated";

async function parseJson(res) {
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      "Server returned an error page instead of data. Refresh the page; if it persists, restart the dev server (npm run dev)."
    );
  }
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export async function migrateLocalStorageEvents() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATED_KEY)) return;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const events = JSON.parse(raw);
      if (Array.isArray(events) && events.length > 0) {
        await fetch("/api/events/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events }),
        });
      }
    }
  } catch {
    /* ignore migration errors */
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.setItem(MIGRATED_KEY, "1");
}

export async function registerPlayerProfile(user) {
  const { upsertPlayerProfile } = await import("@/lib/players");
  return upsertPlayerProfile({
    email: user.email,
    name: user.name ?? user.email,
    category: user.category ?? "",
    dupr: user.dupr ?? "",
    registeredAt: Date.now(),
  });
}

export async function fetchEvents() {
  const data = await parseJson(await fetch("/api/events", { cache: "no-store" }));
  return (data.events ?? []).map(normalizeEvent);
}

export async function clearEndedEvents({ scope = "all" } = {}) {
  const actorId = getPlayerId(getCurrentUser());
  if (!actorId) throw new Error("Login required.");

  const data = await parseJson(
    await fetch("/api/events/ended", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorId, scope }),
    })
  );
  return (data.events ?? []).map(normalizeEvent);
}

export async function deleteEndedEvent(eventId) {
  const hostId = getPlayerId(getCurrentUser());
  if (!hostId) throw new Error("Login required.");

  await parseJson(
    await fetch(`/api/events/${eventId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostId }),
    })
  );
}

export async function fetchEventById(id) {
  const data = await parseJson(
    await fetch(`/api/events/${id}`, { cache: "no-store" })
  );
  return data.event ? normalizeEvent(data.event) : null;
}

/** @deprecated use fetchEvents */
export function getEvents() {
  return [];
}

/** @deprecated use fetchEventById */
export function getEventById() {
  return null;
}

async function updateEventById(id, updater, { requireHost = false } = {}) {
  const current = await fetchEventById(id);
  if (!current) return null;
  const next = normalizeEvent(
    typeof updater === "function" ? updater(current) : { ...current, ...updater }
  );
  const body = { ...next };
  if (requireHost) {
    const hostId = getPlayerId(getCurrentUser());
    if (!hostId) throw new Error("Host login required.");
    body._actingHostId = hostId;
  }
  const data = await parseJson(
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return normalizeEvent(data.event);
}

export async function saveEvent(event, hostUser) {
  const hostId = hostUser ? getPlayerId(hostUser) : "";
  const hostRegistration =
    hostId && hostUser
      ? [
          {
            playerId: hostId,
            name: hostUser.name ?? hostUser.email ?? "Host",
            email: hostUser.email ?? hostId,
            category: hostUser.category ?? "beginner",
            joinedAt: Date.now(),
          },
        ]
      : [];

  const data = await parseJson(
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hostId,
        hostName: hostUser?.name ?? hostUser?.email ?? "Host",
        registrations: hostRegistration,
        courts: [],
        pairRegistrations: [],
        tournamentDivisions: {},
        extraTournamentDivisions: [],
        tournamentPhase: "registration",
        liveStreamUrl: "",
        liveStreamEnabled: false,
        ...event,
      }),
    })
  );
  return normalizeEvent(data.event);
}

async function announceNewMatches(newMatches) {
  if (typeof window === "undefined" || !newMatches?.length) return;
  const { announceCourtMatch } = await import("@/lib/announce");
  for (const m of newMatches) {
    if (m.aiAnnounce) {
      announceCourtMatch(m.courtName ?? "Court", m.teamA, m.teamB);
    }
  }
}

export async function registerForEvent(eventId, player, tournamentEntry = null) {
  const playerId = getPlayerId(player);
  const body = {
    playerId,
    name: player.name ?? player.email,
    email: player.email,
    category: player.category ?? "beginner",
    ...(tournamentEntry ?? {}),
  };
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  await announceNewMatches(data.newMatches);
  return normalizeEvent(data.event);
}

export async function updateEventPaymentConfig(eventId, paymentConfig) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentConfig,
        _actingHostId: hostId,
      }),
    })
  );
  return normalizeEvent(data.event);
}

export async function updateEventOfferedDivisions(eventId, offeredDivisionIds) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offeredDivisionIds,
        _actingHostId: hostId,
      }),
    })
  );
  return normalizeEvent(data.event);
}

export async function updateTierDivisionOrder(eventId, skill, orderedDivisionIds) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/tournament/tier-order`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skill,
        order: orderedDivisionIds,
        hostId,
      }),
    })
  );
  return normalizeEvent(data.event);
}

export async function processEventAutomation(eventId) {
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/process`, { method: "POST" })
  );
  return normalizeEvent(data.event);
}

async function patchEventJson(eventId, path, body) {
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return normalizeEvent(data.event);
}

export async function endEvent(eventId) {
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/end`, { method: "POST" })
  );
  return normalizeEvent(data.event);
}

export async function reloadEvent(eventId, { runAutomation = false } = {}) {
  const ev = await fetchEventById(eventId);
  if (!ev || ev.status === "ended") {
    return ev;
  }
  if (runAutomation && ev.type === "open_play") {
    return processEventAutomation(eventId);
  }
  return ev;
}

export async function resolvePendingMatch(
  eventId,
  { courtId, action, teamA, teamB, callPlayers }
) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/pending-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtId,
        action,
        teamA,
        teamB,
        callPlayers,
        hostId,
      }),
    })
  );
  await announceNewMatches(data.newMatches);
  return normalizeEvent(data.event);
}

export async function addCourt(eventId, label) {
  await updateEventById(
    eventId,
    (event) => {
      const num = event.courts.length + 1;
      return {
        ...event,
        courts: [
          ...event.courts,
          {
            id: `court-${Date.now()}`,
            name: label?.trim() || `Court ${num}`,
            autoMatch: true,
            lastMatch: false,
            aiAnnounce: true,
            liveVideoUrl: "",
            liveVideoEnabled: false,
            status: "idle",
            currentMatch: null,
            queue: [],
          },
        ],
      };
    },
    { requireHost: true }
  );
  const ev = await fetchEventById(eventId);
  if (ev?.type === "tournament") return ev;
  return processEventAutomation(eventId);
}

export async function registerPair(eventId, pair, hostId) {
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/pairs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pair, hostId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function updateTournamentPair(eventId, pairId, names) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/pairs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairId, hostId, ...names }),
    })
  );
  return normalizeEvent(data.event);
}

export async function updateTournamentPairBase(eventId, pairId, basePlayerId) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/pairs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairId, hostId, basePlayerId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function addTournamentDivision(eventId, payload, hostId) {
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/tournament/divisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, hostId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function runBracketSetup(
  eventId,
  { divisionId, all = false, regenerate = false, force = false } = {}
) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/tournament/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId, all, regenerate, force, hostId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function patchTournamentMatch(eventId, payload) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/tournament/match`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, hostId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function startQuarterfinals(eventId, divisionId) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/tournament/knockout/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId, hostId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function saveTournamentMatch(
  eventId,
  { divisionId, bracketId, matchId, scoreA, scoreB }
) {
  return patchTournamentMatch(eventId, {
    divisionId,
    bracketId,
    matchId,
    scoreA,
    scoreB,
    status: "completed",
  });
}

export async function fetchTournamentEvent(eventId) {
  return fetchEventById(eventId);
}

export async function removeCourt(eventId, courtId) {
  const current = await fetchEventById(eventId);
  const court = current?.courts?.find((c) => c.id === courtId);
  if (!court) return null;

  if (current?.type === "tournament") {
    assertCanRemoveTournamentCourt(current, courtId);
  } else {
    if ((current.courts?.length ?? 0) <= 1) {
      throw new Error("Keep at least one court.");
    }
    if (court.status === "live") {
      throw new Error("End the live match before removing this court.");
    }
    if (court.status === "pending") {
      throw new Error("Cancel or confirm the pending match before removing this court.");
    }
  }

  await updateEventById(
    eventId,
    (event) => ({
      ...event,
      courts: event.courts.filter((c) => c.id !== courtId),
    }),
    { requireHost: true }
  );
  const ev = await fetchEventById(eventId);
  if (ev?.type === "tournament") return ev;
  return processEventAutomation(eventId);
}

export async function updateCourt(eventId, courtId, patch) {
  const hostId = getPlayerId(getCurrentUser());
  return patchEventJson(eventId, "court", { courtId, patch, hostId });
}

function queueEntryFromRegistration(reg) {
  return {
    playerId: reg.playerId,
    name: reg.name,
    email: reg.email,
    category: reg.category ?? "beginner",
    queuedAt: Date.now(),
  };
}

export async function hostAddPlayerToQueue(eventId, courtId, registration) {
  const playerId = registration.playerId;
  return updateEventById(
    eventId,
    (event) => {
    const busy = getPlayerCourtStatus(event, playerId);
    if (busy && busy.courtId !== courtId) return event;

    return {
      ...event,
      courts: event.courts.map((c) => {
        if (c.id !== courtId) return c;
        if (c.status === "live" || c.status === "pending") return c;
        const queue = Array.isArray(c.queue) ? c.queue : [];
        if (queue.some((q) => q.playerId === playerId)) return c;
        return {
          ...c,
          queue: [...queue, queueEntryFromRegistration(registration)],
        };
      }),
    };
  },
    { requireHost: true }
  );
}

export async function hostRemoveFromQueue(eventId, courtId, playerId) {
  return updateEventById(
    eventId,
    (event) => ({
      ...event,
      courts: event.courts.map((c) => {
        const queue = Array.isArray(c.queue) ? c.queue : [];
        return c.id === courtId
          ? { ...c, queue: queue.filter((q) => q.playerId !== playerId) }
          : c;
      }),
    }),
    { requireHost: true }
  );
}

export async function updateLiveMatch(eventId, courtId, patch) {
  const hostId = getPlayerId(getCurrentUser());
  return patchEventJson(eventId, "live-match", { courtId, patch, hostId });
}

export async function runCourtAutoMatch(eventId, courtId) {
  return processEventAutomation(eventId);
}

export async function fillAllAutoCourts(eventId) {
  return processEventAutomation(eventId);
}

export async function updateMatchScore(eventId, courtId, scoreA, scoreB) {
  return updateLiveMatch(eventId, courtId, { scoreA, scoreB });
}

export async function endCourtMatch(eventId, courtId) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/end-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courtId, hostId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function updateEventStream(eventId, patch) {
  const hostId = getPlayerId(getCurrentUser());
  if (!hostId) throw new Error("Host login required.");
  const body = { _actingHostId: hostId };
  if (patch.liveStreamUrl !== undefined) {
    body.liveStreamUrl = patch.liveStreamUrl;
  }
  if (patch.liveStreamEnabled !== undefined) {
    body.liveStreamEnabled = patch.liveStreamEnabled;
  }
  const data = await parseJson(
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return normalizeEvent(data.event);
}

export async function seedSamplePlayers(eventId) {
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/seed-sample-players`, {
      method: "POST",
    })
  );
  return { event: normalizeEvent(data.event), added: data.added ?? 0 };
}

export async function hostAddWalkInPlayer(eventId, { name, category, email }) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, email, hostId }),
    })
  );
  return normalizeEvent(data.event);
}

export async function hostRemoveRegistration(eventId, playerId, registrationId) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/register`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, hostId, registrationId }),
    })
  );
  await announceNewMatches(data.newMatches);
  return normalizeEvent(data.event);
}

export async function hostRemovePlayer(eventId, playerId) {
  const hostId = getPlayerId(getCurrentUser());
  const data = await parseJson(
    await fetch(`/api/events/${eventId}/players`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, hostId }),
    })
  );
  return normalizeEvent(data.event);
}
