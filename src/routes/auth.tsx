import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizePhone, phoneError } from "@/lib/phone";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | طقّها" },
      { name: "description", content: "سجل دخولك أو أنشئ حساب جديد وابدأ لعبتك المجانية." },
      { property: "og:title", content: "الدخول إلى طقّها" },
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
  const [countryCode, setCountryCode] = useState("+962");
  const [phone, setPhone] = useState("");

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
    const normalizedPhone = normalizePhone(countryCode, phone);
    const invalidPhone = phoneError(countryCode, phone);
    if (invalidPhone) {
      toast.error("رقم التلفون مش صحيح", { description: invalidPhone });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { first_name: firstName, last_name: lastName, country_code: countryCode, phone: normalizedPhone },
      },
    });
    setLoading(false);
    if (error) {
      const phoneLimit = error.message.includes("PHONE_ACCOUNT_LIMIT");
      const weakPassword = /weak|easy to guess/i.test(error.message);
      toast.error(phoneLimit ? "وصلت الحد المسموح لهالرقم" : "ما قدرنا نسجلك", {
        description: phoneLimit ? "نفس رقم التلفون مسموح له بحسابين فقط." : weakPassword ? "كلمة المرور سهلة كثير. اختار كلمة أطول وأقوى." : error.message,
      });
      return;
    }
    if (!data.session) {
      toast.success("تم إنشاء الحساب", { description: "افحص بريدك وأكد الحساب عشان تدخل." });
      return;
    }
    navigate({ to: "/create-game" });
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error("تعذر الدخول عبر Google");
      return;
    }
    // OAuth redirects away from the page. Social accounts claim a phone from
    // their profile before they can begin a game.
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-center text-3xl text-primary">حسابك بطقّها</h1>

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
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <div>
                    <Label htmlFor="country">رمز الدولة</Label>
                    <select
                      id="country"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="+962">الأردن +962</option>
                      <option value="+970">فلسطين +970</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="phone">رقم التلفون</Label>
                    <Input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" required value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ""))} placeholder={countryCode === "+970" ? "0591234567" : "0791234567"} />
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">للحفاظ على عدالة اللعب، نفس الرقم بقدر يعمل حسابين كحد أقصى.</p>
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
