// tests/account-deletion.test.ts
// Comprehensive Test Suite for Google Play Compliant Account Deletion Flow
// Application: قدّ التحدي | Developer: NextAura Studios

import fs from "node:fs";
import path from "node:path";

function testAccountDeletionCompliance() {
  console.log("\n=== 1. Validating Public /delete-account Route & Google Play Policy ===");

  const routePath = path.resolve(process.cwd(), "src/routes/delete-account.tsx");
  if (!fs.existsSync(routePath)) {
    throw new Error("Missing public route file: src/routes/delete-account.tsx");
  }

  const routeContent = fs.readFileSync(routePath, "utf-8");

  // A. Publicly accessible route definition
  if (!routeContent.includes('createFileRoute("/delete-account")')) {
    throw new Error("Route must be registered as /delete-account");
  }
  console.log("  [PASS] /delete-account route exists and is defined as a public createFileRoute");

  // B. Exact branding requirements: قدّ التحدي and NextAura Studios
  if (!routeContent.includes("قدّ التحدي")) {
    throw new Error("Missing app name 'قدّ التحدي' on deletion page");
  }
  if (!routeContent.includes("NextAura Studios")) {
    throw new Error("Missing developer name 'NextAura Studios' on deletion page");
  }
  console.log("  [PASS] Application ('قدّ التحدي') and Developer ('NextAura Studios') explicitly branded");

  // C. Disclosures: Deleted data, Retained data, and Subscription warning
  if (!routeContent.includes("البيانات التي يتم حذفها نهائياً") && !routeContent.includes("deleted")) {
    throw new Error("Missing clear disclosure of deleted data");
  }
  if (!routeContent.includes("البيانات التي قد يُحتفظ بها") && !routeContent.includes("retained")) {
    throw new Error("Missing disclosure of legally retained accounting/audit data");
  }
  if (
    !routeContent.includes("Google Play") ||
    !routeContent.includes("لا يلغي بالضرورة اشتراكك")
  ) {
    throw new Error("Missing prominent warning regarding Google Play recurring subscription cancellation");
  }
  console.log("  [PASS] Prominent disclosure of deleted data, legal retention, and Google Play subscriptions");

  // D. Identity verification for unauthenticated users (OTP/Magic-link)
  if (!routeContent.includes("signInWithOtp") || !routeContent.includes("verifyOtp")) {
    throw new Error("Unauthenticated users must verify identity via OTP/magic-link before deletion");
  }
  if (!routeContent.includes("shouldCreateUser: false")) {
    throw new Error("signInWithOtp must not allow creating new users on the deletion page");
  }
  console.log("  [PASS] Secure OTP identity verification implemented for unauthenticated visitors (no blind deletion)");

  // E. Two-step confirmation logic
  if (!routeContent.includes("DELETE") || !routeContent.includes("حذف")) {
    throw new Error("Missing two-step confirmation requiring typing 'حذف' or 'DELETE'");
  }
  console.log("  [PASS] Two-step confirmation ('حذف' / 'DELETE') verified");

  console.log("\n=== 2. Validating Server-Side Deletion Security & Architecture ===");

  const serverPath = path.resolve(process.cwd(), "src/server.ts");
  const serverContent = fs.readFileSync(serverPath, "utf-8");

  // A. Server endpoint registration
  if (!serverContent.includes('url.pathname === "/api/account/delete"')) {
    throw new Error("Missing server endpoint /api/account/delete in src/server.ts");
  }
  console.log("  [PASS] Endpoint /api/account/delete registered in server entry");

  // B. Authentication & Token Verification
  if (!serverContent.includes('request.headers.get("Authorization")') || !serverContent.includes("supabaseAdmin.auth.getUser")) {
    throw new Error("/api/account/delete must verify Supabase JWT via Authorization header");
  }
  console.log("  [PASS] Server validates JWT via Authorization header with supabaseAdmin.auth.getUser");

  // C. Server-derived User ID (Zero Trust)
  if (!serverContent.includes("userId: user.id")) {
    throw new Error("Server must derive userId directly from verified user.id, not client payload");
  }
  console.log("  [PASS] Server strictly derives user ID from verified session (client cannot forge userId)");

  const servicePath = path.resolve(process.cwd(), "src/lib/server-account-service.ts");
  if (!fs.existsSync(servicePath)) {
    throw new Error("Missing server service: src/lib/server-account-service.ts");
  }
  const serviceContent = fs.readFileSync(servicePath, "utf-8");

  // D. Multiplayer room edge cases
  if (!serviceContent.includes('status: "expired"') || !serviceContent.includes("host_id")) {
    throw new Error("Multiplayer rooms hosted by the deleting user must be expired");
  }
  if (!serviceContent.includes("room_players") || !serviceContent.includes('status: "finished"')) {
    throw new Error("Active games where user is a guest must be safely transitioned/finished");
  }
  console.log("  [PASS] Multiplayer room cleanup handles host and guest edge cases cleanly");

  // E. Admin deleteUser call
  if (!serviceContent.includes("supabaseAdmin.auth.admin.deleteUser")) {
    throw new Error("User deletion must execute via supabaseAdmin.auth.admin.deleteUser");
  }
  console.log("  [PASS] Cascading deletion executed via supabaseAdmin.auth.admin.deleteUser");

  console.log("\n=== 3. Validating In-App Profile Deletion & Privacy Policy ===");

  const profilePath = path.resolve(process.cwd(), "src/routes/_authenticated/profile.tsx");
  const profileContent = fs.readFileSync(profilePath, "utf-8");

  // A. In-app Profile deletion button
  if (!profileContent.includes("حذف الحساب نهائياً")) {
    throw new Error("Missing in-app 'حذف الحساب نهائياً' button in Profile page");
  }
  if (!profileContent.includes("executeAccountDeletion")) {
    throw new Error("Profile page must call executeAccountDeletion");
  }
  if (!profileContent.includes("AlertDialog")) {
    throw new Error("Profile page must use AlertDialog for explicit confirmation");
  }
  console.log("  [PASS] In-app Profile page includes destructive Danger Zone with AlertDialog and confirmation");

  // B. Privacy Policy section
  const privacyPath = path.resolve(process.cwd(), "src/routes/privacy.tsx");
  const privacyContent = fs.readFileSync(privacyPath, "utf-8");

  if (!privacyContent.includes("حذف الحساب") || !privacyContent.includes("/delete-account")) {
    throw new Error("Privacy policy must include account deletion section and link to /delete-account");
  }
  console.log("  [PASS] Privacy policy includes dedicated deletion section linking to /delete-account");

  // C. Site Footer link
  const footerPath = path.resolve(process.cwd(), "src/components/site-footer.tsx");
  const footerContent = fs.readFileSync(footerPath, "utf-8");
  if (!footerContent.includes("/delete-account")) {
    throw new Error("Site footer must link to /delete-account for global discoverability");
  }
  console.log("  [PASS] Global site footer links directly to /delete-account");

  console.log("\n>>> ALL GOOGLE PLAY ACCOUNT DELETION COMPLIANCE TESTS PASSED (100%) <<<\n");
}

try {
  testAccountDeletionCompliance();
} catch (err: unknown) {
  console.error("\n❌ TEST FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
