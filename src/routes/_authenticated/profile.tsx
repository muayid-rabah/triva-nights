import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Camera, Gift, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "حسابي | لمّة جيم" },
      { name: "description", content: "عدّل بياناتك الشخصية وتابع رصيد ألعابك." },
      { property: "og:title", content: "حسابي في لمّة جيم" },
      { property: "og:description", content: "بياناتك، رصيدك، وألعابك في مكان واحد." },
    ],
  }),
  component: ProfilePage,
});

const COUNTRIES = [
  { code: "+965", label: "الكويت (+965)" },
  { code: "+966", label: "السعودية (+966)" },
  { code: "+971", label: "الإمارات (+971)" },
  { code: "+974", label: "قطر (+974)" },
  { code: "+973", label: "البحرين (+973)" },
  { code: "+968", label: "عُمان (+968)" },
  { code: "+962", label: "الأردن (+962)" },
];

function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    country_code: "+965",
    phone: "",
    birth_date: "",
    avatar_url: "",
  });
  const [pw, setPw] = useState({ current: "", next: "" });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return { ...data, email: auth.user.email, id: auth.user.id };
    },
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      country_code: profile.country_code ?? "+965",
      phone: profile.phone ?? "",
      birth_date: profile.birth_date ?? "",
      avatar_url: profile.avatar_url ?? "",
    });
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.id) return;
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: profile.id, ...form, birth_date: form.birth_date || null });
    if (error) return toast.error("ما انحفظت البيانات", { description: error.message });
    toast.success("تم حفظ التغييرات");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({
      password: pw.next,
      // @ts-expect-error current_password is supported by Lovable Cloud auth
      current_password: pw.current,
    });
    if (error) return toast.error("ما تغيرت كلمة المرور", { description: error.message });
    toast.success("تم تغيير كلمة المرور");
    setPw({ current: "", next: "" });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const fullName = `${form.first_name} ${form.last_name}`.trim() || "مستخدم جديد";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl text-primary">حسابي</h1>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/packages">
                <Plus className="ms-1 h-4 w-4" /> اشتر لعبة جديدة
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/gifts">
                <Gift className="ms-1 h-4 w-4" /> قسم الهدايا
              </Link>
            </Button>
            <span className="rounded-full bg-surface-2 px-4 py-2 text-sm font-bold text-gold">
              الرصيد: {profile?.balance ?? 0} د.ك
            </span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[300px_1fr]">
          <aside className="rounded-3xl border border-border bg-card p-6 text-center">
            <div className="relative mx-auto h-28 w-28">
              <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-surface-2 text-4xl">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt={fullName} className="h-full w-full object-cover" />
                ) : (
                  "🙂"
                )}
              </div>
              <label className="absolute bottom-1 end-1 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setForm((f) => ({ ...f, avatar_url: String(reader.result) }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
            <p className="mt-4 font-display text-lg">{fullName}</p>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              ألعاب متبقية: <span className="font-bold text-foreground">{profile?.games_left ?? 0}</span>
            </p>
            <Button variant="outline" className="mt-5 w-full text-destructive" onClick={signOut}>
              <LogOut className="ms-1 h-4 w-4" /> تسجيل خروج
            </Button>
          </aside>

          <section className="rounded-3xl border border-border bg-card p-6">
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">حسابي التعريفي</TabsTrigger>
                <TabsTrigger value="pw">تغيير كلمة المرور</TabsTrigger>
              </TabsList>

              <TabsContent value="info">
                <form className="mt-5 space-y-4" onSubmit={save}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="fn">الاسم الأول</Label>
                      <Input id="fn" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="ln">اسم العائلة</Label>
                      <Input id="ln" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                    <div>
                      <Label htmlFor="cc">رمز الدولة</Label>
                      <select
                        id="cc"
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={form.country_code}
                        onChange={(e) => setForm({ ...form, country_code: e.target.value })}
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="ph">رقم الهاتف</Label>
                      <Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="em">البريد الإلكتروني</Label>
                    <Input id="em" value={profile?.email ?? ""} readOnly />
                  </div>
                  <div>
                    <Label htmlFor="bd">تاريخ الميلاد</Label>
                    <Input id="bd" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
                  </div>
                  <Button type="submit">حفظ التغييرات</Button>
                </form>
              </TabsContent>

              <TabsContent value="pw">
                <form className="mt-5 max-w-sm space-y-4" onSubmit={changePassword}>
                  <div>
                    <Label htmlFor="cpw">كلمة المرور الحالية</Label>
                    <Input id="cpw" type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="npw">كلمة المرور الجديدة</Label>
                    <Input id="npw" type="password" required minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
                  </div>
                  <Button type="submit">تحديث كلمة المرور</Button>
                </form>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
