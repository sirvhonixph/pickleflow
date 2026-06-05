function normalizeHostId(id) {
  return (id ?? "").trim().toLowerCase();
}

/** @param {string | undefined} hostId @param {{ hostId?: string }} event */
export function isRequestFromHost(hostId, event) {
  const a = normalizeHostId(hostId);
  const b = normalizeHostId(event?.hostId);
  return !!a && !!b && a === b;
}

export function assertRequestHost(hostId, event) {
  if (!isRequestFromHost(hostId, event)) {
    throw new Error("Only the event host can perform this action.");
  }
}

export function stripActingHostId(body) {
  if (!body || typeof body !== "object") return body;
  const { _actingHostId, ...rest } = body;
  return rest;
}

export function courtsPayloadChanged(before, after) {
  return JSON.stringify(before?.courts ?? []) !== JSON.stringify(after?.courts ?? []);
}

export function tournamentPayloadChanged(before, after) {
  return (
    JSON.stringify(before?.tournamentDivisions ?? {}) !==
      JSON.stringify(after?.tournamentDivisions ?? {}) ||
    JSON.stringify(before?.pairRegistrations ?? []) !==
      JSON.stringify(after?.pairRegistrations ?? []) ||
    JSON.stringify(before?.offeredDivisionIds ?? []) !==
      JSON.stringify(after?.offeredDivisionIds ?? []) ||
    JSON.stringify(before?.tierDivisionOrder ?? {}) !==
      JSON.stringify(after?.tierDivisionOrder ?? {})
  );
}

export function streamPayloadChanged(before, after) {
  return (
    (before?.liveStreamUrl ?? "") !== (after?.liveStreamUrl ?? "") ||
    Boolean(before?.liveStreamEnabled) !== Boolean(after?.liveStreamEnabled)
  );
}
