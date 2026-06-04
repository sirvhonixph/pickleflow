import { CATEGORY_ORDER } from "@/lib/categories";

export function isValidCategory(value) {
  return CATEGORY_ORDER.includes(value);
}

export function resolveCategoryFromEvents(events, playerId) {
  if (!playerId) return null;
  const counts = new Map();

  for (const event of events ?? []) {
    for (const reg of event.registrations ?? []) {
      if (reg.playerId === playerId && isValidCategory(reg.category)) {
        counts.set(reg.category, (counts.get(reg.category) ?? 0) + 1);
      }
    }
    for (const h of event.matchHistory ?? []) {
      for (const p of [...(h.teamA ?? []), ...(h.teamB ?? [])]) {
        if (p.playerId === playerId && isValidCategory(p.category)) {
          counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
        }
      }
    }
  }

  let best = null;
  let bestCount = 0;
  for (const [cat, count] of counts) {
    if (count > bestCount) {
      best = cat;
      bestCount = count;
    }
  }
  return best;
}

export function resolvePlayerCategory({
  playerId,
  userCategory,
  storeCategory,
  events,
}) {
  if (isValidCategory(userCategory)) return userCategory;
  if (isValidCategory(storeCategory)) return storeCategory;
  return resolveCategoryFromEvents(events, playerId);
}
