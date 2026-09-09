import type { CategoryRow } from "@/lib/game-types";

export function CategoryArtwork({ category, compact = false }: { category: CategoryRow; compact?: boolean }) {
  return (
    <span className={`category-artwork ${compact ? "category-artwork-compact" : ""}`} aria-hidden="true">
      <span className="category-artwork-ornament" />
      <span className="category-emoji">{category.emoji ?? "✦"}</span>
    </span>
  );
}
