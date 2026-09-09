import { supabase } from "@/integrations/supabase/client";
import type { CategoryRow, QuestionRow } from "./game-types";
import { drawLibraryQuestions, libraryCategories, libraryGroups } from "./category-library";

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
}

export async function fetchGroups(): Promise<GroupRow[]> {
  const { data, error } = await supabase
    .from("category_groups")
    .select("id, slug, name, sort_order")
    .in("slug", libraryGroups.map((group) => group.slug))
    .order("sort_order");
  return error || !data?.length ? libraryGroups : data;
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, image_key, emoji, group_id, sort_order")
    .eq("catalogue_version", 2)
    .order("sort_order");
  return error || !data?.length ? libraryCategories : data;
}

export async function fetchQuestionsFor(categoryIds: string[]): Promise<QuestionRow[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, category_id, points, kind, text, choices, answer")
    .in("category_id", categoryIds);
  if (!error && data?.length) return data as QuestionRow[];

  // Until the content pipeline imports the next batch into questions, map the
  // Supabase UUIDs back to their stable slugs and keep every game playable.
  const { data: categories } = await supabase
    .from("categories")
    .select("id, slug")
    .in("id", categoryIds);
  const selectedSlugs = categories?.length
    ? categoryIds.map((id) => categories.find((category) => category.id === id)?.slug ?? id)
    : categoryIds;
  return drawLibraryQuestions(selectedSlugs);
}

export async function fetchPackages() {
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}
