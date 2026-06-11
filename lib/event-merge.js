/** Merge event arrays by id so concurrent saves cannot drop rows. */

import {
  pickPreferredRoundRobinRow,
  mergePreferredRoundRobinRow,
  roundRobinPairKey,
  sanitizeBracketCourtLiveMatches,
  isStaleScheduleGeneration,
} from "@/lib/tournament-brackets";

function remoteMatchesLookRegenerated(remoteMatches, scheduleResetAt) {
  if (scheduleResetAt == null) return false;
  const rows = remoteMatches ?? [];
  if (rows.length === 0) return false;
  return rows.every(
    (m) =>
      m?.scheduleGeneration === scheduleResetAt &&
      m.status === "scheduled" &&
      (m.scoreA ?? 0) === 0 &&
      (m.scoreB ?? 0) === 0 &&
      !m.resultLocked
  );
}

function isStaleLocalRow(row, scheduleResetAt) {
  if (scheduleResetAt == null) return false;
  if (row?.scheduleGeneration == null) return true;
  return row.scheduleGeneration !== scheduleResetAt;
}

function mergeConfirmedResults(
  local = {},
  remote = {},
  scheduleResetAt = null,
  remoteMatches = []
) {
  const out = { ...remote };
  const dropStaleLocal =
    scheduleResetAt != null &&
    remoteMatchesLookRegenerated(remoteMatches, scheduleResetAt);
  for (const [key, localRow] of Object.entries(local ?? {})) {
    if (!localRow?.pairAId || !localRow?.pairBId) continue;
    if (isStaleScheduleGeneration(localRow, scheduleResetAt)) continue;
    if (isStaleLocalRow(localRow, scheduleResetAt)) continue;
    if (
      dropStaleLocal &&
      localRow.scheduleGeneration !== scheduleResetAt
    ) {
      continue;
    }
    const remoteRow = out[key];
    if (remoteRow && isStaleScheduleGeneration(remoteRow, scheduleResetAt)) {
      out[key] = localRow;
      continue;
    }
    out[key] = remoteRow
      ? pickPreferredRoundRobinRow(remoteRow, localRow)
      : localRow;
  }
  for (const [key, row] of Object.entries(out)) {
    if (isStaleScheduleGeneration(row, scheduleResetAt)) {
      delete out[key];
    }
  }
  return out;
}

function mergeBracketMatches(
  local = [],
  remote = [],
  confirmed = {},
  scheduleResetAt = null
) {
  const byKey = new Map();
  const dropStaleLocal =
    scheduleResetAt != null &&
    remoteMatchesLookRegenerated(remote, scheduleResetAt);
  const ingest = (row, fromLocal = false) => {
    if (!row?.pairAId || !row?.pairBId) return;
    if (isStaleScheduleGeneration(row, scheduleResetAt)) return;
    if (fromLocal && isStaleLocalRow(row, scheduleResetAt)) return;
    if (
      dropStaleLocal &&
      fromLocal &&
      row.scheduleGeneration !== scheduleResetAt
    ) {
      return;
    }
    const key = roundRobinPairKey(row);
    if (!key) return;
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergePreferredRoundRobinRow(prev, row) : row);
  };
  for (const row of remote ?? []) ingest(row);
  for (const row of local ?? []) ingest(row, true);
  for (const row of Object.values(confirmed ?? {})) ingest(row);
  return [...byKey.values()];
}

function mergeBracket(local, remote) {
  if (!remote) return local ?? null;
  if (!local) return remote;
  const scheduleResetAt = remote.scheduleResetAt ?? local.scheduleResetAt ?? null;
  const confirmedResults = mergeConfirmedResults(
    local.confirmedResults,
    remote.confirmedResults,
    scheduleResetAt,
    remote.matches
  );
  const matches = mergeBracketMatches(
    local.matches,
    remote.matches,
    confirmedResults,
    scheduleResetAt
  );
  return sanitizeBracketCourtLiveMatches({
    ...remote,
    confirmedResults,
    matches,
    scheduleResetAt: remote.scheduleResetAt ?? local.scheduleResetAt,
  });
}

function mergeDivisionSetup(local, remote) {
  if (!remote) return local ?? null;
  if (!local) return remote;

  const localReset = local.scheduleResetAt ?? 0;
  const remoteReset = remote.scheduleResetAt ?? 0;
  if (remoteReset > localReset) {
    return remote;
  }
  if (localReset > remoteReset) {
    return local;
  }

  const localBrackets = local.brackets ?? [];
  const remoteBrackets = remote.brackets ?? [];
  const byId = new Map(remoteBrackets.map((b) => [b.id, b]));
  for (const localBracket of localBrackets) {
    const remoteBracket = byId.get(localBracket.id);
    byId.set(
      localBracket.id,
      remoteBracket
        ? mergeBracket(localBracket, remoteBracket)
        : localBracket
    );
  }
  return {
    ...remote,
    scheduleResetAt: remote.scheduleResetAt ?? local.scheduleResetAt,
    brackets: [...byId.values()],
  };
}

export function mergeTournamentDivisions(local, remote) {
  if (!remote?.tournamentDivisions) return local?.tournamentDivisions ?? null;
  if (!local?.tournamentDivisions) return remote.tournamentDivisions;
  const out = { ...remote.tournamentDivisions };
  for (const [divId, localDiv] of Object.entries(local.tournamentDivisions)) {
    const remoteDiv = out[divId];
    out[divId] = remoteDiv
      ? mergeDivisionSetup(localDiv, remoteDiv)
      : localDiv;
  }
  return out;
}

export function mergeCourts(existing = [], incoming = []) {
  const byId = new Map();
  const order = [];
  for (const court of existing ?? []) {
    if (court?.id && !byId.has(court.id)) {
      byId.set(court.id, court);
      order.push(court.id);
    }
  }
  for (const court of incoming ?? []) {
    if (!court?.id) continue;
    if (!byId.has(court.id)) order.push(court.id);
    byId.set(court.id, court);
  }
  return order.map((id) => byId.get(id)).filter(Boolean);
}

export function mergePairRegistrations(existing = [], incoming = []) {
  const byId = new Map();
  for (const pair of existing ?? []) {
    if (pair?.id) byId.set(pair.id, pair);
  }
  for (const pair of incoming ?? []) {
    if (pair?.id) byId.set(pair.id, pair);
  }
  return [...byId.values()].sort(
    (a, b) => (a.registeredAt ?? 0) - (b.registeredAt ?? 0)
  );
}

export function mergeRegistrations(existing = [], incoming = []) {
  const byKey = new Map();
  for (const row of existing ?? []) {
    const key = row.registrationId ?? row.playerId;
    if (key) byKey.set(key, row);
  }
  for (const row of incoming ?? []) {
    const key = row.registrationId ?? row.playerId;
    if (key) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/** Union rows from a stale write with the latest blob snapshot. */
export function mergeConcurrentEventWrites(latest, next) {
  if (!next) return latest ?? null;
  if (!latest) return next;
  const mergedDivisions = mergeTournamentDivisions(latest, next);
  return {
    ...next,
    courts: mergeCourts(latest.courts, next.courts),
    pairRegistrations: mergePairRegistrations(
      latest.pairRegistrations,
      next.pairRegistrations
    ),
    registrations: mergeRegistrations(
      latest.registrations,
      next.registrations
    ),
    tournamentDivisions: mergedDivisions,
  };
}

/** Client-side: never drop rows the UI already showed when applying a fetch. */
export function mergeEventSnapshots(local, remote) {
  if (!remote) return local ?? null;
  if (!local) return remote;
  return mergeConcurrentEventWrites(local, remote);
}

export function courtIds(event) {
  return new Set((event?.courts ?? []).map((c) => c.id).filter(Boolean));
}

export function pairRegistrationIds(event) {
  return new Set((event?.pairRegistrations ?? []).map((p) => p.id).filter(Boolean));
}

export function eventHasAllCourtIds(event, ids) {
  const have = courtIds(event);
  for (const id of ids) {
    if (!have.has(id)) return false;
  }
  return true;
}

export function eventHasAllPairIds(event, ids) {
  const have = pairRegistrationIds(event);
  for (const id of ids) {
    if (!have.has(id)) return false;
  }
  return true;
}

/** Court ids present in `next` but not in `before`. */
export function newCourtIds(before, next) {
  const beforeIds = courtIds(before);
  return [...courtIds(next)].filter((id) => !beforeIds.has(id));
}

/** Pair ids present in `next` but not in `before`. */
export function newPairRegistrationIds(before, next) {
  const beforeIds = pairRegistrationIds(before);
  return [...pairRegistrationIds(next)].filter((id) => !beforeIds.has(id));
}

function fetchLooksStale(local, remote) {
  const localPairIds = pairRegistrationIds(local);
  const remotePairIds = pairRegistrationIds(remote);
  const localCourtIds = courtIds(local);
  const remoteCourtIds = courtIds(remote);
  const pairsStale = [...localPairIds].some((id) => !remotePairIds.has(id));
  const courtsStale = [...localCourtIds].some((id) => !remoteCourtIds.has(id));
  return pairsStale || courtsStale;
}

/**
 * Apply a polled/fetched event without dropping pairs/courts from a stale read.
 * Host remove responses should still call setEvent(remote) directly.
 */
export function applyEventFetch(local, remote) {
  if (!remote) return local ?? null;
  if (!local) return remote;
  const mergedDivisions = mergeTournamentDivisions(local, remote);
  if (!fetchLooksStale(local, remote)) {
    return {
      ...remote,
      tournamentDivisions: mergedDivisions,
    };
  }
  return mergeEventSnapshots(local, remote);
}
