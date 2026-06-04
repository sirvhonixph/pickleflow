/** @param {string | undefined} hostId @param {{ hostId?: string }} event */
export function isRequestFromHost(hostId, event) {
  return !!hostId && !!event?.hostId && hostId === event.hostId;
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
