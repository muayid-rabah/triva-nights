import { supabase } from "@/integrations/supabase/client";
import type { CategoryRow, QuestionRow } from "./game-types";

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
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, image_key, emoji, group_id, sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

export async function fetchQuestionsFor(categoryIds: string[]): Promise<QuestionRow[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, category_id, points, kind, text, choices, answer")
    .in("category_id", categoryIds)
    .order("points");
  if (error) throw error;
  return (data ?? []).map((q) => ({
    ...q,
    choices: Array.isArray(q.choices) ? (q.choices as string[]) : null,
  })) as QuestionRow[];
}

export async function fetchPackages() {
  const { data, error } = await supabase
    .from("packages")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}
