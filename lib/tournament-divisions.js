import { CATEGORY_ORDER, categoryLabel } from "@/lib/categories";

export const DIVISION_FORMATS = [
  { value: "mens", label: "Men's Doubles" },
  { value: "womens", label: "Women's Doubles" },
  { value: "mixed", label: "Mixed Doubles" },
];

/** Fixed tournament divisions — always included */
export const TOURNAMENT_DIVISIONS = [
  { id: "novice_mens_doubles", skill: "novice", format: "mens" },
  { id: "novice_womens_doubles", skill: "novice", format: "womens" },
  { id: "novice_mixed_doubles", skill: "novice", format: "mixed" },
  { id: "intermediate_mens_doubles", skill: "intermediate", format: "mens" },
  { id: "intermediate_womens_doubles", skill: "intermediate", format: "womens" },
  { id: "intermediate_mixed_doubles", skill: "intermediate", format: "mixed" },
];

export const DEFAULT_TOURNAMENT_DIVISIONS = TOURNAMENT_DIVISIONS;

const DEFAULT_IDS = new Set(TOURNAMENT_DIVISIONS.map((d) => d.id));

const FORMAT_LABELS = Object.fromEntries(
  DIVISION_FORMATS.map((f) => [f.value, f.label])
);

export function buildDivisionId(skill, format) {
  return `${skill}_${format}_doubles`;
}

export function buildDivisionLabel(skill, format) {
  const fmt = FORMAT_LABELS[format] ?? format;
  return `${categoryLabel(skill)} ${fmt}`;
}

export function normalizeDivisionEntry(entry) {
  if (!entry?.id) return null;
  return {
    id: entry.id,
    skill: entry.skill ?? "novice",
    format: entry.format ?? "mixed",
    label: entry.label?.trim() || buildDivisionLabel(entry.skill, entry.format),
    extra: !!entry.extra,
  };
}

function defaultDivisionEntries() {
  return TOURNAMENT_DIVISIONS.map((d) =>
    normalizeDivisionEntry({
      ...d,
      label: buildDivisionLabel(d.skill, d.format),
      extra: false,
    })
  );
}

/** Host-added divisions beyond the default six */
export function getExtraDivisions(event) {
  const raw = event?.extraTournamentDivisions;
  if (Array.isArray(raw)) {
    return raw.map(normalizeDivisionEntry).filter(Boolean);
  }
  // Migrate from earlier full-list storage
  const legacy = event?.tournamentDivisionList;
  if (Array.isArray(legacy)) {
    return legacy
      .filter((d) => d?.id && !DEFAULT_IDS.has(d.id))
      .map((d) => normalizeDivisionEntry({ ...d, extra: true }));
  }
  return [];
}

export function getEventDivisions(event) {
  return [...defaultDivisionEntries(), ...getExtraDivisions(event)];
}

export function getDivisionById(event, divisionId) {
  return getEventDivisions(event).find((d) => d.id === divisionId);
}

/** Divisions the host opened for registration (defaults to all). */
export function getOfferedDivisions(event) {
  const all = getEventDivisions(event);
  const offered = event?.offeredDivisionIds;
  if (!Array.isArray(offered) || offered.length === 0) return all;
  const set = new Set(offered);
  return all.filter((d) => set.has(d.id));
}

export function getOfferedDivisionById(event, divisionId) {
  return getOfferedDivisions(event).find((d) => d.id === divisionId);
}

export function divisionLabel(divisionId, event = null) {
  if (event) {
    const d = getDivisionById(event, divisionId);
    if (d) return d.label;
  }
  const d = TOURNAMENT_DIVISIONS.find((x) => x.id === divisionId);
  if (d) return buildDivisionLabel(d.skill, d.format);
  return divisionId;
}

export function pairsInDivision(event, divisionId) {
  return (event.pairRegistrations ?? []).filter(
    (p) => p.divisionId === divisionId
  );
}

export function pairDisplayName(pair) {
  const a = pair.player1?.name ?? "Player 1";
  const b = pair.player2?.name ?? "Player 2";
  return pair.teamName?.trim() || `${a} / ${b}`;
}

export function addDivisionToEvent(event, { skill, format }) {
  if (!skill || !format) {
    throw new Error("Choose a skill level and format.");
  }
  if (!CATEGORY_ORDER.includes(skill)) {
    throw new Error("Invalid skill level.");
  }
  if (!FORMAT_LABELS[format]) {
    throw new Error("Invalid format.");
  }

  const id = buildDivisionId(skill, format);
  if (getEventDivisions(event).some((d) => d.id === id)) {
    throw new Error("This division already exists.");
  }

  const entry = normalizeDivisionEntry({
    id,
    skill,
    format,
    label: buildDivisionLabel(skill, format),
    extra: true,
  });

  return {
    ...event,
    extraTournamentDivisions: [...getExtraDivisions(event), entry],
  };
}
