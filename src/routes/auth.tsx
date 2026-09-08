import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | لمّة جيم" },
      { name: "description", content: "سجل دخولك أو أنشئ حساب جديد وابدأ لعبتك المجانية." },
      { property: "og:title", content: "الدخول إلى لمّة جيم" },
      { property: "og:description", content: "حساب واحد يكفي لكل ألعابك وباقاتك." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/profile", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("ما قدرنا ندخلك", { description: error.message });
      return;
    }
    toast.success("أهلاً فيك!");
    navigate({ to: "/create-game" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { first_name: firstName, last_name: lastName },
      },
    });
    setLoading(false);
    if (error) {
      toast.error("ما قدرنا نسجلك", { description: error.message });
      return;
    }
    if (!data.session) {
      toast.success("تم إنشاء الحساب", { description: "افحص بريدك وأكد الحساب عشان تدخل." });
      return;
    }
    navigate({ to: "/create-game" });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("تعذر الدخول عبر Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/create-game" });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-center text-3xl text-primary">حسابك في لمّة جيم</h1>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
              <TabsTrigger value="signup">حساب جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="mt-4 space-y-4" onSubmit={signIn}>
                <div>
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  دخول
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="mt-4 space-y-4" onSubmit={signUp}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="fn">الاسم الأول</Label>
                    <Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="ln">اسم العائلة</Label>
                    <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email2">البريد الإلكتروني</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="password2">كلمة المرور</Label>
                  <Input id="password2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  إنشاء الحساب
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> أو <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="secondary" className="w-full" onClick={google}>
            المتابعة عبر Google
          </Button>
        </div>
      </main>
    </div>
  );
}
