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
  // Built-in groups use stable string IDs that match the bundled categories.
  // Supabase group IDs are UUIDs, so replacing these rows with remote ones
  // hides local categories on a fresh deployment.  The local catalogue is the
  // canonical board definition and remains available even while offline.
  return libraryGroups;
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  // Keep the full curated catalogue visible on web, Vercel, and Android.  Its
  // question packs are bundled with the app; remote database categories are
  // intentionally not mixed in here because their UUID group IDs do not map
  // to the game's stable board groups.
  return libraryCategories;
}

export async function fetchQuestionsFor(categoryIds: string[]): Promise<QuestionRow[]> {
  const localIds = new Set(libraryCategories.map((category) => category.id));
  const localSelected = categoryIds.filter((id) => localIds.has(id));
  const remoteSelected = categoryIds.filter((id) => !localIds.has(id));
  const localQuestions = drawLibraryQuestions(localSelected);
  if (!remoteSelected.length) return localQuestions;
  const { data, error } = await supabase
    .from("questions")
    .select("id, category_id, points, kind, text, choices, answer, image_url, audio_url, audio_text, video_url")
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
