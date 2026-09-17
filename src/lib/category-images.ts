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
  if (CATEGORY_IMAGES[key]) return CATEGORY_IMAGES[key];
  const slug = key.toLowerCase();
  if (/(kits-and-crests|national-kit|country-shirt)/.test(slug)) return "/assets/category-national-kits-v1.png";
  if (/(football|cup|league|player|kit|stadium|sport|nba|ufc|tennis|formula)/.test(slug)) return "/assets/category-football-quiz-v1.png";
  if (/(series|cinema|film|screen|animation|anime|gaming|game|disney|pixar)/.test(slug)) return "/assets/category-screen-quiz-v1.png";
  if (/(islam|prophet|religion|quran|arabic-literature)/.test(slug)) return "/assets/category-islam-quiz-v1.png";
  if (/(world|geo|city|capital|country|flag|jordan|palestine|history|travel)/.test(slug)) return "/assets/category-world-quiz-v1.png";
  return "/assets/category-culture-quiz-v1.png";
}
