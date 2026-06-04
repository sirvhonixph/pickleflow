export const SKILL_CATEGORIES = [
  { value: "beginner", label: "Beginner" },
  { value: "novice", label: "Novice" },
  { value: "intermediate", label: "Intermediate" },
  { value: "pro", label: "Pro" },
];

export const CATEGORY_ORDER = SKILL_CATEGORIES.map((c) => c.value);

export function categoryLabel(value) {
  return SKILL_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function categoryBadgeClass(value) {
  switch (value) {
    case "beginner":
      return "bg-green-500/20 text-green-300";
    case "novice":
      return "bg-cyan-500/20 text-cyan-300";
    case "intermediate":
      return "bg-amber-500/20 text-amber-300";
    case "pro":
      return "bg-purple-500/20 text-purple-300";
    default:
      return "bg-slate-700 text-slate-300";
  }
}
