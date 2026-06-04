import {
  getEventDivisions,
  pairsInDivision,
  divisionLabel,
} from "@/lib/tournament-divisions";

export const DEFAULT_DIVISION_PAIR_LIMIT = 20;

export function getDivisionPairLimit(event) {
  const n = Number(event?.divisionPairLimit);
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : DEFAULT_DIVISION_PAIR_LIMIT;
}

/** Milliseconds when registration closes; defaults to day before event at 11:59 PM. */
export function resolveRegistrationClosesMs(event) {
  if (event?.registrationClosesAt) {
    const ms = new Date(event.registrationClosesAt).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (!event?.date) return null;
  const d = new Date(`${event.date}T12:00:00`);
  d.setDate(d.getDate() - 1);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function isRegistrationClosed(event, now = Date.now()) {
  if (event?.status === "ended") return true;
  if (event?.type === "tournament") {
    const phase = event.tournamentPhase ?? "registration";
    if (phase !== "registration") return true;
  }
  const closes = resolveRegistrationClosesMs(event);
  if (!closes) return false;
  return now >= closes;
}

export function formatRegistrationCountdown(ms) {
  if (ms <= 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (days === 0) {
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    if (days === 0 && hours < 1) parts.push(`${seconds}s`);
  }
  return parts.join(" ");
}

export function getDivisionSlotStatus(event, divisionId) {
  const limit = getDivisionPairLimit(event);
  const registered = pairsInDivision(event, divisionId).length;
  const remaining = Math.max(0, limit - registered);
  return {
    registered,
    limit,
    remaining,
    isFull: registered >= limit,
  };
}

export function getAllDivisionSlotStatuses(event) {
  return getEventDivisions(event).map((d) => ({
    divisionId: d.id,
    label: divisionLabel(d.id, event),
    skill: d.skill,
    format: d.format,
    ...getDivisionSlotStatus(event, d.id),
  }));
}
