# قد التحدي على Android

نسخة Android مبنية بـ Capacitor 8 فوق نفس تطبيق React/TanStack Start. لا يوجد خادم مضمّن في الهاتف: أمر البناء الخاص بـ Android يشغّل وضع SPA رسميًا من TanStack وينتج `index.html` ثابتًا داخل `.output/public`، بينما يبقى `npm run build` هو بناء SSR الخاص بـ Vercel.

## المتطلبات

- Node.js 22 أو أحدث.
- Android Studio مع Android SDK Platform 36 وBuild Tools المتوافقة.
- JDK 17.
- جهاز أو محاكي Android API 24+.

لا يحتاج التطبيق إلى كاميرا أو ميكروفون أو موقع. الصلاحية الوحيدة الحالية هي `INTERNET` لاستخدام Supabase، الخطوط، الوسائط المضمنة، ومقاطع YouTube.

## التشغيل والتحديث

```bash
npm install
npm run android:sync
npm run android:open
```

يفتح الأمر الأخير مجلد `android/` في Android Studio. اختَر جهازًا أو محاكيًا ثم اضغط Run. من الطرفية يمكن بعد تثبيت SDK وتشغيل جهاز استخدام:

```bash
npx cap run android
```

كل تغيير في الويب يحتاج هذه الدورة قبل اختبار Android:

```bash
npm run android:sync
```

## المصادقة وSupabase

يجب إضافة روابط العودة التالية في **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** قبل اختبار التسجيل عبر Google أو تأكيد البريد:

```text
com.nextaurastudios.qadaltahaddi://auth/callback
https://localhost
```

يستخدم تسجيل Google المتصفح النظامي على Android ثم يعيد الجلسة عبر الرابط الأول. لا تضف `SUPABASE_SERVICE_ROLE_KEY` أو أي مفتاح سري إلى `VITE_*` أو إلى تطبيق Android. يحتاج بناء Android فقط إلى قيمتي `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY` الموجودتين محليًا وقت البناء.

## الإصدار إلى Google Play

1. حدّث `versionCode` و`versionName` في `android/app/build.gradle` لكل إصدار جديد.
2. أنشئ keystore إصدار احتياطيًا واحفظه خارج Git. الملفات `*.jks` و`keystore.properties` مستثناة من المستودع.
3. أضف إعداد signing محليًا في Gradle أو عبر Android Studio، ثم أنشئ Android App Bundle موقّعًا:

   ```bash
   cd android
   .\gradlew.bat bundleRelease
   ```

4. ارفع ملف `.aab` الموقّع إلى Play Console، وجرّبه أولًا في Internal testing.

رابط سياسة الخصوصية المنشور الذي يوضع في Play Console:

```text
https://triva-nights-main.vercel.app/privacy
```

## قائمة مراجعة Play Console

- عرّف المطوّر باسم **NextAura Studios**، واسم التطبيق **قد التحدي**، والحزمة `com.nextaurastudios.qadaltahaddi`.
- راجع نموذج Data safety وفق البيانات الفعلية: البريد، الاسم، رقم الهاتف، الملف الشخصي، التعليقات، وبيانات اللعب تُدار عبر Supabase. لا تعلن أن التطبيق لا يجمع بيانات ما دامت الحسابات مفعّلة.
- لا توجد إعلانات أو مشتريات أو مكافآت مدفوعة مفعّلة الآن. قبل إضافتها، أضف SDK رسميًا، شاشة موافقة/إفصاح عند الحاجة، واختبرها في Internal testing؛ لا تمنح رصيدًا مقابل إعلان غير مكتمل.
- تحقّق على هاتف حقيقي من التسجيل بالبريد وGoogle، استعادة الجلسة، تشغيل الصوت والفيديو، العربية RTL، زر الرجوع، وسهولة القراءة.
- أي رابط خارجي جديد يجب أن يمر عبر `openExternalUrl` من `src/lib/native-platform.ts` حتى يفتح في المتصفح النظامي داخل التطبيق.
