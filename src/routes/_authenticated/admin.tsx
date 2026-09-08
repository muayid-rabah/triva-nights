import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchCategories, fetchGroups } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة | لمّة جيم" },
      { name: "description", content: "إدارة الفئات والأسئلة داخل المنصة." },
      { property: "og:title", content: "لوحة إدارة لمّة جيم" },
      { property: "og:description", content: "إضافة وتعديل الفئات والأسئلة." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [newCat, setNewCat] = useState({ name: "", group_id: "", emoji: "❓" });
  const [q, setQ] = useState({ points: 100, text: "", answer: "", choices: "" });

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("role", "admin")
        .maybeSingle();
      return Boolean(data);
    },
  });

  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: fetchGroups });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: questions = [] } = useQuery({
    queryKey: ["admin-questions", categoryId],
    enabled: Boolean(categoryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, points, text, answer")
        .eq("category_id", categoryId)
        .order("points");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (roleLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p className="p-10 text-center text-muted-foreground">جاري التحقق…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-3xl text-primary">لوحة الإدارة</h1>
          <p className="mt-3 text-muted-foreground">
            هذي الصفحة للمشرفين فقط. إذا تبي صلاحية إشراف تواصل معنا.
          </p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const slug = `cat-${Date.now()}`;
    const { error } = await supabase.from("categories").insert({
      name: newCat.name,
      group_id: newCat.group_id,
      emoji: newCat.emoji,
      slug,
    });
    if (error) {
      toast.error("ما انضافت الفئة", { description: error.message });
      return;
    }
    toast.success("انضافت الفئة");
    setNewCat({ name: "", group_id: "", emoji: "❓" });
    qc.invalidateQueries({ queryKey: ["categories"] });
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    const choices = q.choices.trim()
      ? q.choices.split("|").map((c) => c.trim())
      : null;
    const { error } = await supabase.from("questions").insert({
      category_id: categoryId,
      points: q.points,
      text: q.text,
      answer: q.answer,
      kind: choices ? "mcq" : "open",
      choices,
    });
    if (error) {
      toast.error("ما انضاف السؤال", { description: error.message });
      return;
    }
    toast.success("انضاف السؤال");
    setQ({ points: 100, text: "", answer: "", choices: "" });
    qc.invalidateQueries({ queryKey: ["admin-questions", categoryId] });
  }

  async function removeQuestion(id: string) {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) {
      toast.error("ما انحذف السؤال");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-questions", categoryId] });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl text-primary">لوحة الإدارة</h1>

        <section className="mt-8 rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl">إضافة فئة جديدة</h2>
          <form className="mt-4 grid gap-4 sm:grid-cols-4" onSubmit={addCategory}>
            <div className="sm:col-span-2">
              <Label htmlFor="cname">اسم الفئة</Label>
              <Input id="cname" required value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="cgroup">المجموعة</Label>
              <select
                id="cgroup"
                required
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={newCat.group_id}
                onChange={(e) => setNewCat({ ...newCat, group_id: e.target.value })}
              >
                <option value="">اختر</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cemoji">الأيقونة</Label>
              <Input id="cemoji" value={newCat.emoji} onChange={(e) => setNewCat({ ...newCat, emoji: e.target.value })} />
            </div>
            <Button type="submit" className="sm:col-span-4 sm:w-40">
              <Plus className="ms-1 h-4 w-4" /> إضافة الفئة
            </Button>
          </form>
        </section>

        <section className="mt-8 rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl">إدارة الأسئلة</h2>
          <div className="mt-4">
            <Label htmlFor="cat">اختر الفئة</Label>
            <select
              id="cat"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-72"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">اختر فئة</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {categoryId && (
            <>
              <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={addQuestion}>
                <div>
                  <Label htmlFor="pts">النقاط</Label>
                  <Input id="pts" type="number" step={100} min={100} max={600} value={q.points} onChange={(e) => setQ({ ...q, points: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="ans">الجواب</Label>
                  <Input id="ans" required value={q.answer} onChange={(e) => setQ({ ...q, answer: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="txt">نص السؤال</Label>
                  <Input id="txt" required value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="ch">الخيارات (افصل بينها بعلامة | واتركها فارغة للسؤال المفتوح)</Label>
                  <Input id="ch" value={q.choices} onChange={(e) => setQ({ ...q, choices: e.target.value })} />
                </div>
                <Button type="submit" className="sm:w-40">
                  <Plus className="ms-1 h-4 w-4" /> إضافة السؤال
                </Button>
              </form>

              <ul className="mt-6 space-y-2">
                {questions.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="me-2 font-bold text-gold">{item.points}</span>
                      {item.text}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => removeQuestion(item.id)} aria-label="حذف">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
