import { Check } from "lucide-react";
import type { CategoryRow } from "@/lib/game-types";
import { categoryImage } from "@/lib/category-images";
import { cn } from "@/lib/utils";

export function CategoryCard({
  category,
  selected,
  disabled,
  onToggle,
}: {
  category: CategoryRow;
  selected?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  const img = categoryImage(category.image_key);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !selected}
      className={cn(
        "card-hover group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-card p-2 text-center disabled:opacity-40",
        selected ? "border-primary glow-primary" : "border-border",
      )}
    >
      <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-surface-2">
        {img ? (
          <img
            src={img}
            alt={category.name}
            loading="lazy"
            width={512}
            height={512}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-5xl">{category.emoji ?? "❓"}</span>
        )}
      </div>
      <span className="mt-2 truncate px-1 pb-1 text-sm font-bold">{category.name}</span>
      {selected && (
        <span className="absolute end-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-4 w-4" />
        </span>
      )}
    </button>
  );
}
