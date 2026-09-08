import general from "@/assets/cat-general.jpg";
import geo from "@/assets/cat-geo.jpg";
import sport from "@/assets/cat-sport.jpg";
import islam from "@/assets/cat-islam.jpg";

export const CATEGORY_IMAGES: Record<string, string> = {
  general,
  geo,
  sport,
  islam,
};

export function categoryImage(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORY_IMAGES[key] ?? null;
}
