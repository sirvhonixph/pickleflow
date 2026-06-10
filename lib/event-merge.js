/** Merge event arrays by id so concurrent saves cannot drop rows. */

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

/** Union pair/registration rows from a stale write with the latest blob snapshot. */
export function mergeConcurrentEventWrites(latest, next) {
  if (!next) return latest ?? null;
  if (!latest) return next;
  return {
    ...next,
    pairRegistrations: mergePairRegistrations(
      latest.pairRegistrations,
      next.pairRegistrations
    ),
    registrations: mergeRegistrations(
      latest.registrations,
      next.registrations
    ),
  };
}

/** Client-side: never drop pairs the UI already showed when applying a fetch. */
export function mergeEventSnapshots(local, remote) {
  if (!remote) return local ?? null;
  if (!local) return remote;
  return mergeConcurrentEventWrites(local, remote);
}

export function pairRegistrationIds(event) {
  return new Set((event?.pairRegistrations ?? []).map((p) => p.id).filter(Boolean));
}

export function eventHasAllPairIds(event, ids) {
  const have = pairRegistrationIds(event);
  for (const id of ids) {
    if (!have.has(id)) return false;
  }
  return true;
}
