import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية | قدّ التحدي" },
      { name: "description", content: "سياسة خصوصية تطبيق وموقع قدّ التحدي من NextAura Studios." },
    ],
  }),
  component: PrivacyPage,
});

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-border bg-card p-5 sm:p-7"><h2 className="text-xl text-primary">{title}</h2><div className="mt-3 space-y-3 leading-8 text-muted-foreground">{children}</div></section>;
}

function PrivacyPage() {
  return <div className="min-h-screen"><SiteHeader /><main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
    <div className="text-center"><ShieldCheck className="mx-auto h-12 w-12 text-primary" /><h1 className="mt-4 text-4xl text-primary">سياسة الخصوصية</h1><p className="mt-3 text-muted-foreground">قدّ التحدي · NextAura Studios · آخر تحديث: 18 سبتمبر 2026</p></div>
    <div className="mt-9 grid gap-5">
      <PolicySection title="نظرة عامة"><p>نحترم خصوصيتك. تشرح هذه السياسة البيانات التي قد يجمعها موقع وتطبيق قدّ التحدي، ولماذا نستخدمها، والخيارات المتاحة لك.</p></PolicySection>
      <PolicySection title="البيانات التي قد نجمعها"><ul className="list-inside list-disc space-y-1"><li>بيانات الحساب التي تدخلها أنت، مثل الاسم والبريد الإلكتروني والصورة الشخصية.</li><li>رقم الهاتف ورمز الدولة عند توثيقهما، لحماية المحاولات المجانية ومنع إساءة الاستخدام.</li><li>بيانات اللعب الضرورية لتشغيل الجولات، مثل الفئات المختارة والنتائج والتفضيلات المحلية.</li><li>الرسائل أو التعليقات التي ترسلها داخل الخدمة.</li></ul></PolicySection>
      <PolicySection title="كيف نستخدم البيانات"><ul className="list-inside list-disc space-y-1"><li>إنشاء حسابك وحمايته وإدارة رصيد الألعاب.</li><li>تشغيل اللعبة وحفظ تفضيلاتك وتحسين الاستقرار.</li><li>الرد على طلبات الدعم، ومنع الاحتيال أو الاستخدام المخالف.</li></ul><p>لا نبيع بياناتك الشخصية أو نؤجرها لأطراف أخرى.</p></PolicySection>
      <PolicySection title="التخزين والخدمات الخارجية"><p>تُدار بيانات الحساب والخدمة عبر Supabase، ويُستضاف الموقع عبر Vercel. قد تظهر وسائط من مزودين خارجيين داخل بعض الأسئلة، مثل YouTube لمقاطع الفيديو وFlagCDN للأعلام. تخضع هذه الخدمات لسياسات الخصوصية الخاصة بها.</p><p>قد نستخدم التخزين المحلي على جهازك لحفظ حالة اللعبة ومنع تكرار الأسئلة؛ يمكنك مسحه من إعدادات المتصفح أو التطبيق.</p></PolicySection>
      <PolicySection title="الإعلانات والمشتريات"><p>التطبيق مجاني. إذا أُضيفت الإعلانات أو المشتريات داخل التطبيق مستقبلاً، فسيتم تحديث هذه السياسة قبل تفعيلها، وستتم المدفوعات الرقمية على Android عبر Google Play Billing وفق سياسات Google Play.</p></PolicySection>
      <PolicySection title="الأطفال"><p>لا نجمع عن قصد بيانات حساسة من الأطفال. إذا كان المستخدم دون السن المطلوب في بلده، فيجب استخدام الخدمة بإشراف ولي الأمر. يمكن لولي الأمر التواصل معنا لطلب مراجعة أو حذف بيانات الطفل.</p></PolicySection>
      <PolicySection title="الحماية والاحتفاظ"><p>نستخدم ضوابط وصول وقواعد أمان مناسبة لحماية البيانات. نحتفظ بالبيانات فقط بالمدة اللازمة لتشغيل الخدمة، الامتثال للالتزامات القانونية، وتسوية النزاعات أو منع الإساءة.</p></PolicySection>
      <PolicySection title="حذف الحساب والبيانات الشخصية (Google Play Compliance)">
        <p>
          نلتزم بتمكين المستخدمين من ممارسة حقهم في حذف حساباتهم وبياناتهم بالكامل. يمكنك طلب حذف حسابك وبياناتك الشخصية بشكل فوري من داخل التطبيق (عبر صفحة الحساب) أو عبر الرابط العام للويب دون الحاجة لتثبيت التطبيق:
        </p>
        <p className="mt-2">
          <Link to="/delete-account" className="inline-flex items-center gap-1 font-bold text-destructive hover:underline">
            <span>الانتقال إلى صفحة حذف الحساب والبيانات (/delete-account)</span>
          </Link>
        </p>
        <ul className="list-inside list-disc space-y-1 mt-2">
          <li><strong>البيانات التي تُحذف نهائياً:</strong> معلومات الملف الشخصي (الاسم، البريد الإلكتروني، الصورة)، أرقام الهواتف الموثقة ومطالباتها، رصيد الألعاب، وسجل الجولات والغرف التنافسية.</li>
          <li><strong>الاحتفاظ القانوني:</strong> قد نحتفظ بسجلات المعاملات المالية المكتملة دون أي بيانات تعريفية شخصية، وفقط بالقدر اللازم للامتثال للمتطلبات الضريبية والمحاسبية ومكافحة الاحتيال.</li>
          <li><strong>الاشتراكات المتكررة:</strong> حذف الحساب لا يلغي تلقائياً الاشتراكات عبر متجر Google Play. يجب على المستخدم إلغاء اشتراكه مباشرة عبر إدارة اشتراكات Google Play لتجنب تكرار الرسوم.</li>
        </ul>
      </PolicySection>
      <PolicySection title="حقوقك والتواصل"><p>يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها من خلال <Link to="/contact" className="font-bold text-primary hover:underline">صفحة التواصل</Link>. وسنحدّث هذه الصفحة عند إجراء تغيير جوهري على طريقة التعامل مع البيانات.</p></PolicySection>
    </div>
  </main><SiteFooter /></div>;
}
