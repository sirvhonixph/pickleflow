import { isMatchLive, winnerPairIdFromMatch } from "@/lib/tournament-live";
import {
  completeAndLockRoundRobinRow,
  hasRecordedRoundRobinResult,
  inferWinnerPairId,
  isPermanentRoundRobinResult,
  isRoundRobinMatchLocked,
  isVoidMatchResult,
  lockRoundRobinMatchRow,
  reopenMatchForRematch,
  sealAllBracketMatchRows,
  sealPermanentPairingRow,
  sealRoundRobinMatchRow,
} from "@/lib/tournament-match-outcome";

export { hasRecordedRoundRobinResult };

/** Split N items across K buckets as evenly as possible (e.g. 20 pairs → 4 courts → [5,5,5,5]). */
export function distributeEvenly(total, bucketCount) {
  if (bucketCount < 1) return [];
  const base = Math.floor(total / bucketCount);
  const remainder = total % bucketCount;
  return Array.from({ length: bucketCount }, (_, i) =>
    i < remainder ? base + 1 : base
  );
}

/**
 * Plan brackets: pairs per bracket = ceil(pairCount / courtCount).
 * Example: 20 pairs, 4 courts → 5 per bracket → 4 brackets (A–D).
 */
export function planBracketDistribution(pairCount, courtCount) {
  if (courtCount < 1) {
    throw new Error("Add at least one court before running the calculator.");
  }
  if (pairCount < 2) {
    throw new Error("Need at least 2 pairs in this division.");
  }

  const distribution = distributeEvenly(pairCount, courtCount);
  const pairsPerBracket = Math.max(...distribution);
  const bracketCount = distribution.length;

  return {
    pairCount,
    courtCount,
    bracketCount,
    pairsPerBracket,
    distribution,
    formulaText: `${pairCount} ÷ ${courtCount} = ${pairsPerBracket} pairs per bracket (${bracketCount} brackets)`,
  };
}

const BRACKET_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function bracketLabel(index) {
  return `Bracket ${BRACKET_LETTERS[index] ?? index + 1}`;
}

/** n pairs → each plays (n−1) games; bracket has n×(n−1)/2 total matches. */
export function expectedRoundRobinMatchCount(pairCount) {
  if (pairCount < 2) return 0;
  return (pairCount * (pairCount - 1)) / 2;
}

export function matchesPerPairInRoundRobin(pairCount) {
  return Math.max(0, pairCount - 1);
}

export function roundRobinPairKey(match) {
  if (!match?.pairAId || !match?.pairBId) return "";
  return [match.pairAId, match.pairBId].sort().join("|");
}

/** One canonical row per pairing (merged saved results + schedule). */
export function getBracketRoundRobinMatches(bracket, options = {}) {
  const scheduleResetAt =
    options.scheduleResetAt ?? bracket?.scheduleResetAt ?? null;
  return mergeRoundRobinSchedule(bracket?.matches, bracket?.pairIds, {
    scheduleResetAt,
    bracketId: bracket?.id ?? null,
    confirmedResults: bracket?.confirmedResults,
  });
}

/** Persist final rows by pairing — survives live ghosts and court release. */
export function recordBracketConfirmedResult(bracket, row) {
  if (!isPermanentRoundRobinResult(row)) return bracket;
  const key = roundRobinPairKey(row);
  if (!key) return bracket;
  const sealed = sealPermanentPairingRow(row);
  const prev = bracket?.confirmedResults?.[key];
  const next = prev ? pickPreferredRoundRobinRow(prev, sealed) : sealed;
  return {
    ...bracket,
    confirmedResults: {
      ...(bracket?.confirmedResults ?? {}),
      [key]: next,
    },
  };
}

export function syncBracketConfirmedResults(bracket) {
  let next = {
    ...bracket,
    confirmedResults: { ...(bracket?.confirmedResults ?? {}) },
  };
  for (const row of bracket?.matches ?? []) {
    if (isPermanentRoundRobinResult(row)) {
      next = recordBracketConfirmedResult(next, row);
    }
  }
  return next;
}

/** Overlay confirmed finals onto stored rows before merge/stabilize. */
export function applyConfirmedResultsToStoredMatches(bracket) {
  const synced = syncBracketConfirmedResults(bracket);
  const { confirmedResults } = synced;
  if (!confirmedResults || Object.keys(confirmedResults).length === 0) {
    return synced;
  }
  const matches = (synced.matches ?? []).map((m) => {
    const key = roundRobinPairKey(m);
    const confirmed = key ? confirmedResults[key] : null;
    if (confirmed && isPermanentRoundRobinResult(confirmed)) {
      return {
        ...sealPermanentPairingRow(confirmed),
        id: m.id ?? confirmed.id,
        scheduleOrder: m.scheduleOrder ?? confirmed.scheduleOrder,
      };
    }
    return m;
  });
  return { ...synced, matches };
}

function alignMatchToTemplatePairOrder(row, template) {
  if (!row || !template) return row;
  if (row.pairAId === template.pairAId && row.pairBId === template.pairBId) {
    return row;
  }
  if (row.pairAId === template.pairBId && row.pairBId === template.pairAId) {
    return {
      ...row,
      pairAId: template.pairAId,
      pairBId: template.pairBId,
      scoreA: row.scoreB ?? 0,
      scoreB: row.scoreA ?? 0,
      basePlayerA: row.basePlayerB,
      basePlayerB: row.basePlayerA,
      teamA: row.teamB,
      teamB: row.teamA,
    };
  }
  return row;
}

function roundRobinRowRank(m, { fromConfirmed = false } = {}) {
  if (fromConfirmed) return 20;
  if (isRoundRobinMatchLocked(m)) return 12;
  if (hasRecordedRoundRobinResult(m)) return 10;
  if (isMatchLive(m)) return 5;
  if (isVoidMatchResult(m)) return 2;
  if ((m.scoreA ?? 0) > 0 || (m.scoreB ?? 0) > 0 || m.playedAt) return 1;
  return 0;
}

function roundRobinRowRecency(m) {
  return Math.max(m.playedAt ?? 0, m.startedAt ?? 0, 0);
}

function isCanonicalRoundRobinId(id) {
  return typeof id === "string" && id.startsWith("rr-");
}

/** Pick the single row to keep when two rows share the same pairing. */
export function pickPreferredRoundRobinRow(prev, next, options = {}) {
  const rp = roundRobinRowRank(prev, { fromConfirmed: options.prevConfirmed });
  const rn = roundRobinRowRank(next, {
    fromConfirmed: options.nextConfirmed ?? options.fromConfirmed,
  });
  if (rn > rp) return next;
  if (rn < rp) return prev;
  const tp = roundRobinRowRecency(prev);
  const tn = roundRobinRowRecency(next);
  if (tn !== tp) return tn > tp ? next : prev;
  if (isCanonicalRoundRobinId(prev.id) && !isCanonicalRoundRobinId(next.id)) {
    return prev;
  }
  if (!isCanonicalRoundRobinId(prev.id) && isCanonicalRoundRobinId(next.id)) {
    return next;
  }
  return prev;
}

/** Best locked/finished row per pairing — survives duplicate live ghosts. */
export function buildPermanentPairingIndex(matches, confirmedResults = null) {
  const index = new Map();
  const ingest = (row, fromConfirmed = false) => {
    if (!isPermanentRoundRobinResult(row)) return;
    const key = roundRobinPairKey(row);
    if (!key) return;
    const prev = index.get(key);
    index.set(
      key,
      prev
        ? pickPreferredRoundRobinRow(prev, row, { nextConfirmed: fromConfirmed })
        : row
    );
  };
  for (const row of Object.values(confirmedResults ?? {})) {
    ingest(row, true);
  }
  for (const row of matches ?? []) ingest(row);
  return index;
}

export function resolvePermanentPairingRow(index, match) {
  const key = roundRobinPairKey(match);
  if (!key || !index) return null;
  return index.get(key) ?? null;
}

/** One row per pairing — never downgrade locked / finished rows to scheduled. */
export function stabilizeBracketMatches(bracket, options = {}) {
  const scheduleResetAt =
    options.scheduleResetAt ?? bracket?.scheduleResetAt ?? null;
  const synced = applyConfirmedResultsToStoredMatches({
    ...bracket,
    scheduleResetAt,
  });
  const permanentIndex = buildPermanentPairingIndex(
    synced.matches,
    synced.confirmedResults
  );
  const merged = getBracketRoundRobinMatches(synced, {
    scheduleResetAt,
    bracketId: bracket?.id ?? null,
  });
  const byKey = new Map();
  const ingest = (row, fromConfirmed = false) => {
    if (!row?.pairAId || !row?.pairBId) return;
    const key = roundRobinPairKey(row);
    const prev = byKey.get(key);
    byKey.set(
      key,
      prev ? pickPreferredRoundRobinRow(prev, row, { nextConfirmed: fromConfirmed }) : row
    );
  };
  for (const row of Object.values(synced.confirmedResults ?? {})) {
    ingest(sealPermanentPairingRow(row), true);
  }
  for (const row of synced.matches ?? []) ingest(row);
  for (const row of merged) ingest(row);

  const stable = [...byKey.values()]
    .map((m) => {
      const permanent = resolvePermanentPairingRow(permanentIndex, m);
      if (permanent) return sealPermanentPairingRow(permanent);
      if (isRoundRobinMatchLocked(m)) return lockRoundRobinMatchRow(m);
      if (isMatchLive(m)) return m;
      const sealed = sealRoundRobinMatchRow(m);
      if (isPermanentRoundRobinResult(sealed)) {
        return sealPermanentPairingRow(sealed);
      }
      if (isVoidMatchResult(sealed)) return reopenMatchForRematch(sealed);
      return sealed;
    })
    .filter((m) => {
      if (!isMatchLive(m)) return true;
      return !resolvePermanentPairingRow(permanentIndex, m);
    });

  stable.sort(
    (a, b) =>
      (a.scheduleOrder ?? 9999) - (b.scheduleOrder ?? 9999) ||
      roundRobinPairKey(a).localeCompare(roundRobinPairKey(b))
  );

  let next = {
    ...synced,
    scheduleResetAt,
    matches: sealAllBracketMatchRows(stable),
  };
  for (const row of stable) {
    if (isPermanentRoundRobinResult(row)) {
      next = recordBracketConfirmedResult(next, row);
    }
  }
  return next;
}

/** Keep one row per pair-up; prefer completed/live over empty duplicates. */
export function dedupeRoundRobinMatches(matches) {
  const byKey = new Map();

  for (const m of matches ?? []) {
    if (!m.pairAId || !m.pairBId) continue;
    const key = roundRobinPairKey(m);
    if (!key) continue;
    const prev = byKey.get(key);
    byKey.set(key, prev ? pickPreferredRoundRobinRow(prev, m) : m);
  }
  return [...byKey.values()];
}

/** True when the schedule lists the same pairing more than once. */
export function findDuplicateRoundRobinPairings(matches, pairIds) {
  const allowed = new Set((pairIds ?? []).filter(Boolean));
  const seen = new Map();
  const dupes = [];

  for (const m of matches ?? []) {
    if (!m.pairAId || !m.pairBId) continue;
    if (allowed.size && (!allowed.has(m.pairAId) || !allowed.has(m.pairBId))) {
      continue;
    }
    const key = roundRobinPairKey(m);
    if (!key) continue;
    if (seen.has(key)) {
      dupes.push({ key, ids: [seen.get(key), m.id] });
    } else {
      seen.set(key, m.id);
    }
  }
  return dupes;
}

/**
 * Circle / Berger play order: each team plays every other once.
 * 5 teams → 10 matches (2 per round, one team rests). Order is fixed 1…N.
 */
export function buildCircleRoundRobinPairings(pairIds) {
  const players = [...new Set(pairIds.filter(Boolean))];
  if (players.length < 2) return [];

  const roster = [...players];
  if (roster.length % 2 === 1) {
    roster.push(null);
  }

  const n = roster.length;
  const half = n / 2;
  const rounds = n - 1;
  const pairings = [];

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = roster[i];
      const away = roster[n - 1 - i];
      if (home && away) {
        pairings.push([home, away]);
      }
    }
    const fixed = roster[0];
    const rest = roster.slice(1);
    rest.unshift(rest.pop());
    roster.splice(0, roster.length, fixed, ...rest);
  }

  return pairings;
}

/** Rotate so match 1 is team A vs team B (first two pairIds in the bracket). */
function rotateScheduleToLeadPair(pairings, leadA, leadB) {
  if (!leadA || !leadB || pairings.length < 2) return pairings;
  const idx = pairings.findIndex(
    ([a, b]) =>
      (a === leadA && b === leadB) || (a === leadB && b === leadA)
  );
  if (idx <= 0) return pairings;
  return [...pairings.slice(idx), ...pairings.slice(0, idx)];
}

/** Round-robin: each pair plays every other pair exactly once (per bracket). */
export function generateRoundRobinMatches(pairIds, bracketId = null) {
  const uniqueIds = [...new Set(pairIds.filter(Boolean))];
  const idPrefix = bracketId ? `rr-${bracketId}` : "rr";
  let pairings = buildCircleRoundRobinPairings(uniqueIds);
  if (uniqueIds.length >= 2) {
    pairings = rotateScheduleToLeadPair(
      pairings,
      uniqueIds[0],
      uniqueIds[1]
    );
  }
  const seen = new Set();
  const matches = [];

  pairings.forEach(([pairAId, pairBId], index) => {
    const key = [pairAId, pairBId].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);

    const [idA, idB] = [pairAId, pairBId].sort();
    matches.push({
      id: `${idPrefix}-${idA}-${idB}`,
      pairAId,
      pairBId,
      scheduleOrder: index + 1,
      scoreA: 0,
      scoreB: 0,
      winnerPairId: null,
      status: "scheduled",
      playedAt: null,
    });
  });

  return matches;
}

export function assertDisjointBracketPairIds(brackets) {
  const seen = new Set();
  for (const bracket of brackets ?? []) {
    for (const id of bracket.pairIds ?? []) {
      if (seen.has(id)) {
        throw new Error(
          `${bracket.label ?? "A bracket"} shares pairs with another bracket. Regenerate the division.`
        );
      }
      seen.add(id);
    }
  }
}

/** After regenerate: fresh schedules only, tagged with the new reset generation. */
export function buildRegeneratedBrackets(brackets, scheduleResetAt) {
  if (scheduleResetAt == null) return brackets ?? [];
  return tagBracketMatchesAfterReset(
    (brackets ?? []).map((bracket) => ({
      ...bracket,
      scheduleResetAt,
      confirmedResults: {},
      matches: generateRoundRobinMatches(bracket.pairIds, bracket.id),
      standings: [],
      advancedPairIds: [],
      poolComplete: false,
    })),
    scheduleResetAt
  ).map((bracket) => ({
    ...bracket,
    scheduleResetAt,
  }));
}

/** Promote scored games to completed so standings count them. */
export function normalizeStoredMatch(m) {
  if (!m?.pairAId || !m.pairBId) return m;
  if (isRoundRobinMatchLocked(m)) return lockRoundRobinMatchRow(m);
  const sealed = sealRoundRobinMatchRow(m);
  if (hasRecordedRoundRobinResult(sealed)) return sealed;

  const scoreA = m.scoreA ?? 0;
  const scoreB = m.scoreB ?? 0;
  const hasScore = scoreA > 0 || scoreB > 0;
  const winner = winnerPairIdFromMatch(m);

  if (winner && m.status !== "live") {
    return {
      ...m,
      status: "completed",
      winnerPairId: winner,
      playedAt: m.playedAt ?? Date.now(),
    };
  }

  if (hasScore && m.playedAt != null && winner) {
    return {
      ...m,
      status: "completed",
      winnerPairId: winner,
    };
  }

  return m;
}

/** Ignore rows from before the latest division regenerate (scheduleResetAt). */
function isStaleMatchResult(m, scheduleResetAt) {
  if (scheduleResetAt == null) return false;
  if (m.scheduleGeneration === scheduleResetAt) return false;
  if (isMatchLive(m)) return false;
  if (hasRecordedRoundRobinResult(m)) return false;
  const anchor = Math.max(m.startedAt ?? 0, m.playedAt ?? 0);
  if (anchor >= scheduleResetAt) return false;
  return true;
}

function reopenVoidMatchOnly(m) {
  if (isPermanentRoundRobinResult(m)) {
    if (isRoundRobinMatchLocked(m)) return lockRoundRobinMatchRow(m);
    return sealRoundRobinMatchRow(m);
  }
  const sealed = sealRoundRobinMatchRow(m);
  if (isVoidMatchResult(sealed)) return reopenMatchForRematch(sealed);
  return sealed;
}

export function tagBracketMatchesAfterReset(brackets, scheduleResetAt) {
  if (scheduleResetAt == null) return brackets;
  return (brackets ?? []).map((bracket) => ({
    ...bracket,
    confirmedResults: {},
    matches: (bracket.matches ?? []).map((m) => ({
      ...m,
      scheduleGeneration: scheduleResetAt,
      scoreA: 0,
      scoreB: 0,
      winnerPairId: null,
      status: "scheduled",
      playedAt: null,
      startedAt: undefined,
    })),
  }));
}

/** Full RR schedule merged with saved results (never drop unplayed pairings). */
export function mergeRoundRobinSchedule(
  existingMatches,
  pairIds,
  options = {}
) {
  const ids = [...new Set((pairIds ?? []).filter(Boolean))];
  const {
    resetScores = false,
    scheduleResetAt,
    bracketId = null,
    confirmedResults = null,
  } = options;
  const canonical = generateRoundRobinMatches(ids, bracketId);

  if (resetScores) return canonical;

  const allowed = new Set(ids);
  const byKey = new Map();
  for (const row of Object.values(confirmedResults ?? {})) {
    if (!row?.pairAId || !row?.pairBId) continue;
    if (!allowed.has(row.pairAId) || !allowed.has(row.pairBId)) continue;
    const key = roundRobinPairKey(row);
    byKey.set(key, sealPermanentPairingRow(row));
  }
  for (const m of dedupeRoundRobinMatches(existingMatches ?? [])) {
    if (!allowed.has(m.pairAId) || !allowed.has(m.pairBId)) continue;
    const key = roundRobinPairKey(m);
    if (isRoundRobinMatchLocked(m)) {
      const locked = lockRoundRobinMatchRow(m);
      const prev = byKey.get(key);
      byKey.set(key, prev ? pickPreferredRoundRobinRow(prev, locked) : locked);
      continue;
    }
    if (isMatchLive(m)) {
      const prev = byKey.get(key);
      byKey.set(key, prev ? pickPreferredRoundRobinRow(prev, m) : m);
      continue;
    }
    let saved = sealRoundRobinMatchRow(normalizeStoredMatch(m));
    if (isStaleMatchResult(saved, scheduleResetAt)) continue;
    saved = reopenVoidMatchOnly(saved);
    const prev = byKey.get(key);
    byKey.set(key, prev ? pickPreferredRoundRobinRow(prev, saved) : saved);
  }
  const merged = canonical.map((template) => {
    const key = roundRobinPairKey(template);
    const confirmed = confirmedResults?.[key];
    if (confirmed && isPermanentRoundRobinResult(confirmed)) {
      const row = sealPermanentPairingRow(confirmed);
      return {
        ...alignMatchToTemplatePairOrder(row, template),
        id: template.id,
        pairAId: template.pairAId,
        pairBId: template.pairBId,
        scheduleOrder: template.scheduleOrder ?? row.scheduleOrder,
        status: "completed",
        resultLocked: true,
        lockedAt: row.lockedAt,
      };
    }
    const saved = byKey.get(key);
    if (!saved) return template;

    if (isRoundRobinMatchLocked(saved)) {
      const row = lockRoundRobinMatchRow(saved);
      return {
        ...alignMatchToTemplatePairOrder(row, template),
        id: template.id,
        pairAId: template.pairAId,
        pairBId: template.pairBId,
        scheduleOrder: template.scheduleOrder ?? row.scheduleOrder,
        status: "completed",
        resultLocked: true,
        lockedAt: row.lockedAt,
      };
    }
    if (isMatchLive(saved)) {
      return {
        ...saved,
        id: template.id,
        pairAId: template.pairAId,
        pairBId: template.pairBId,
        scheduleOrder: template.scheduleOrder ?? saved.scheduleOrder,
        status: "live",
      };
    }

    let row = sealRoundRobinMatchRow(normalizeStoredMatch(saved));
    if (hasRecordedRoundRobinResult(row)) {
      row = alignMatchToTemplatePairOrder(row, template);
      return {
        ...row,
        id: template.id,
        pairAId: template.pairAId,
        pairBId: template.pairBId,
        winnerPairId: row.winnerPairId ?? inferWinnerPairId(row),
        scheduleOrder: template.scheduleOrder ?? row.scheduleOrder,
        status: "completed",
        playedAt: row.playedAt ?? Date.now(),
        resultLocked: row.resultLocked === true,
        lockedAt: row.lockedAt,
      };
    }
    if (!isPermanentRoundRobinResult(row) && isVoidMatchResult(row)) {
      row = reopenMatchForRematch({
        ...row,
        ...template,
        id: template.id,
        scheduleOrder: template.scheduleOrder ?? row.scheduleOrder,
      });
    } else if (
      !isCanonicalRoundRobinId(row.id) &&
      isCanonicalRoundRobinId(template.id)
    ) {
      row = {
        ...row,
        id: template.id,
        scheduleOrder: template.scheduleOrder ?? row.scheduleOrder,
      };
    } else {
      row = {
        ...row,
        scheduleOrder: template.scheduleOrder ?? row.scheduleOrder,
      };
    }
    return row;
  });
  const out = sealAllBracketMatchRows(dedupeRoundRobinMatches(merged));
  out.sort(
    (a, b) =>
      (a.scheduleOrder ?? 9999) - (b.scheduleOrder ?? 9999) ||
      roundRobinPairKey(a).localeCompare(roundRobinPairKey(b))
  );
  return out;
}

export function assignPairsToBrackets(pairs, courts, distribution, divisionId) {
  const sorted = [...pairs].sort(
    (a, b) => (a.registeredAt ?? 0) - (b.registeredAt ?? 0)
  );
  const brackets = [];
  let offset = 0;

  for (let i = 0; i < distribution.length; i++) {
    const size = distribution[i];
    const chunk = sorted.slice(offset, offset + size);
    offset += size;
    const court = courts[i];
    if (!court) continue;

    const pairIds = [
      ...new Set(chunk.map((p) => p.id).filter(Boolean)),
    ];
    const bracketId = `bracket-${divisionId}-${court.id}-${i}`;
    const matches = generateRoundRobinMatches(pairIds, bracketId);
    brackets.push({
      id: bracketId,
      label: bracketLabel(i),
      courtId: court.id,
      courtName: court.name,
      pairIds,
      pairs: chunk.map((p) => ({
        id: p.id,
        name: p.displayName ?? p.teamName,
      })),
      matches,
      roundRobinMeta: {
        pairCount: pairIds.length,
        matchCount: matches.length,
        matchesPerPair: matchesPerPairInRoundRobin(pairIds.length),
      },
      standings: [],
      advancedPairIds: [],
    });
  }

  return brackets;
}
