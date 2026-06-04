import { CATEGORY_ORDER, categoryLabel } from "@/lib/categories";
import {
  getOfferedDivisions,
  getDivisionById,
} from "@/lib/tournament-divisions";

/** Skill levels that have at least one offered division for this event. */
export function getSkillsWithOfferedDivisions(event) {
  const skills = new Set();
  for (const d of getOfferedDivisions(event)) {
    if (d.skill) skills.add(d.skill);
  }
  return CATEGORY_ORDER.filter((s) => skills.has(s));
}

/**
 * Split physical courts evenly across skill tiers (e.g. 8 courts → 4 novice + 4 intermediate).
 */
export function buildSkillCourtPools(event) {
  const courts = event.courts ?? [];
  const skills = getSkillsWithOfferedDivisions(event);

  if (courts.length === 0) return {};
  if (skills.length <= 1) {
    const skill = skills[0] ?? "all";
    return { [skill]: courts };
  }

  const pools = {};
  let offset = 0;
  const base = Math.floor(courts.length / skills.length);
  const extra = courts.length % skills.length;

  for (let i = 0; i < skills.length; i++) {
    const count = base + (i < extra ? 1 : 0);
    pools[skills[i]] = courts.slice(offset, offset + count);
    offset += count;
  }

  return pools;
}

export function courtsForDivision(event, divisionId) {
  const div = getDivisionById(event, divisionId);
  if (!div?.skill) return event.courts ?? [];

  const pools = buildSkillCourtPools(event);
  return pools[div.skill] ?? event.courts ?? [];
}

export function skillForCourt(event, courtId) {
  const pools = buildSkillCourtPools(event);
  for (const [skill, courts] of Object.entries(pools)) {
    if (courts.some((c) => c.id === courtId)) return skill;
  }
  return null;
}

export function describeCourtPools(event) {
  return getSkillsWithOfferedDivisions(event).map((skill) => {
    const courts = buildSkillCourtPools(event)[skill] ?? [];
    return {
      skill,
      label: categoryLabel(skill),
      courts,
      courtNames: courts.map((c) => c.name).join(", "),
      courtCount: courts.length,
    };
  });
}
