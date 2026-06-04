import { categoryBadgeClass, categoryLabel } from "@/lib/categories";

export default function CategoryBadge({ category }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded ${categoryBadgeClass(category)}`}
    >
      {categoryLabel(category)}
    </span>
  );
}
