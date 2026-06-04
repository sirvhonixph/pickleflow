import { getDivisionById } from "@/lib/tournament-divisions";
import { categoryLabel } from "@/lib/categories";

export const MAX_ENTRIES_PER_NAME_PER_CATEGORY = 2;

export function normalizeTournamentPlayerName(name) {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function skillFromDivisionId(divisionId, event) {
  const div = getDivisionById(event, divisionId);
  if (div?.skill) return div.skill;
  return divisionId?.split("_")[0] ?? null;
}

/** Names already in the tournament grouped by skill category. */
export function buildTournamentNameIndex(event, { excludePairId } = {}) {
  /** @type {Map<string, { displayName: string, byCategory: Map<string, Set<string>> }>} */
  const index = new Map();

  const add = (rawName, category, entryKey) => {
    const normalized = normalizeTournamentPlayerName(rawName);
    if (!normalized || !category) return;
    if (!index.has(normalized)) {
      index.set(normalized, {
        displayName: rawName.trim(),
        byCategory: new Map(),
      });
    }
    const row = index.get(normalized);
    if (!row.byCategory.has(category)) {
      row.byCategory.set(category, new Set());
    }
    row.byCategory.get(category).add(entryKey);
  };

  for (const pair of event.pairRegistrations ?? []) {
    if (excludePairId && pair.id === excludePairId) continue;
    const category = skillFromDivisionId(pair.divisionId, event);
    for (const n of [pair.player1?.name, pair.player2?.name]) {
      add(n, category, `pair:${pair.id}`);
    }
  }

  for (const reg of event.registrations ?? []) {
    const te = reg.tournamentEntry;
    if (!te?.paymentProofDataUrl) continue;
    if (
      te.pairId &&
      (event.pairRegistrations ?? []).some((p) => p.id === te.pairId)
    ) {
      continue;
    }
    const category = te.category ?? skillFromDivisionId(te.divisionId, event);
    const key = `reg:${reg.registrationId ?? reg.playerId}`;
    add(reg.name, category, key);
    add(te.partnerName, category, key);
  }

  return index;
}

export function getLockedCategoryForName(event, rawName) {
  const normalized = normalizeTournamentPlayerName(rawName);
  if (!normalized) return null;
  const row = buildTournamentNameIndex(event).get(normalized);
  if (!row) return null;
  const categories = [...row.byCategory.keys()];
  return categories.length === 1 ? categories[0] : categories[0] ?? null;
}

export function countNameEntriesInCategory(event, rawName, category) {
  const normalized = normalizeTournamentPlayerName(rawName);
  if (!normalized || !category) return 0;
  const row = buildTournamentNameIndex(event).get(normalized);
  return row?.byCategory.get(category)?.size ?? 0;
}

export function assertTournamentNameCategoryRules(
  event,
  { registrantName, partnerName, category, excludePairId }
) {
  const index = buildTournamentNameIndex(event, { excludePairId });

  for (const { name, label } of [
    { name: registrantName, label: "Player" },
    { name: partnerName, label: "Partner" },
  ]) {
    if (!name?.trim()) continue;

    const normalized = normalizeTournamentPlayerName(name);
    const display = name.trim();
    const row = index.get(normalized);
    if (!row) continue;

    for (const [existingCategory, entryKeys] of row.byCategory) {
      if (existingCategory !== category) {
        throw new Error(
          `${display} is already registered in ${categoryLabel(existingCategory)}. Each player can only compete in one skill category — choose ${categoryLabel(existingCategory)} for every entry.`
        );
      }
      if (entryKeys.size >= MAX_ENTRIES_PER_NAME_PER_CATEGORY) {
        throw new Error(
          `${display} already has the maximum of ${MAX_ENTRIES_PER_NAME_PER_CATEGORY} entries in ${categoryLabel(category)}.`
        );
      }
    }
  }
}

export function countAccountPairsInCategory(event, playerId, category) {
  if (!playerId || !category) return 0;
  return (event.pairRegistrations ?? []).filter((pair) => {
    if (skillFromDivisionId(pair.divisionId, event) !== category) return false;
    return (
      pair.player1?.playerId === playerId ||
      pair.sourceRegistrationId === playerId
    );
  }).length;
}

export function getTournamentPairCountForPlayer(event, playerId) {
  if (!playerId) return 0;
  return (event.pairRegistrations ?? []).filter(
    (pair) =>
      pair.player1?.playerId === playerId ||
      pair.sourceRegistrationId === playerId
  ).length;
}

export function canRegisterAnotherTournamentEntry(event, playerId, playerName) {
  if (event.type !== "tournament" || !playerId) return false;
  const locked = getLockedCategoryForName(event, playerName);
  if (!locked) return getTournamentPairCountForPlayer(event, playerId) === 0;
  return (
    countAccountPairsInCategory(event, playerId, locked) <
    MAX_ENTRIES_PER_NAME_PER_CATEGORY
  );
}
