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
  if (error || !data?.length) return libraryGroups;
  const remote = new Set(data.map((group) => group.slug));
  return [...data, ...libraryGroups.filter((group) => !remote.has(group.slug))]
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, image_key, emoji, group_id, sort_order")
    .eq("catalogue_version", 2)
    .order("sort_order");
  if (error || !data?.length) return libraryCategories;
  // A partially seeded Supabase project must never hide the richer built-in
  // catalogue. Remote-only categories are preserved; duplicate slugs use the
  // stable local id so their local question pack remains playable.
  const localSlugs = new Set(libraryCategories.map((category) => category.slug));
  return [...libraryCategories, ...data.filter((category) => !localSlugs.has(category.slug))]
    .sort((a, b) => a.group_id.localeCompare(b.group_id) || a.sort_order - b.sort_order);
}

export async function fetchQuestionsFor(categoryIds: string[]): Promise<QuestionRow[]> {
  const localIds = new Set(libraryCategories.map((category) => category.id));
  const localSelected = categoryIds.filter((id) => localIds.has(id));
  const remoteSelected = categoryIds.filter((id) => !localIds.has(id));
  const localQuestions = drawLibraryQuestions(localSelected);
  if (!remoteSelected.length) return localQuestions;
  const { data, error } = await supabase
    .from("questions")
    .select("id, category_id, points, kind, text, choices, answer")
    .in("category_id", remoteSelected);
  if (!error && data?.length) return [...localQuestions, ...(data as QuestionRow[])];

  // Until the content pipeline imports the next batch into questions, map the
  // Supabase UUIDs back to their stable slugs and keep every game playable.
  const { data: categories } = await supabase
    .from("categories")
    .select("id, slug")
    .in("id", remoteSelected);
  const selectedSlugs = categories?.length
    ? remoteSelected.map((id) => categories.find((category) => category.id === id)?.slug ?? id)
    : remoteSelected;
  return [...localQuestions, ...drawLibraryQuestions(selectedSlugs)];
}

export async function fetchPackages() {
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}
