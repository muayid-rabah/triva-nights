// src/lib/google-play-client.ts
// Android Google Play Billing client integration via @capgo/native-purchases

import { NativePurchases, PURCHASE_TYPE, type Product } from "@capgo/native-purchases";
import { isNativeApp } from "./native-platform";
import {
  getAllGooglePlayProductIds,
  findPackageByGooglePlayId,
  hashGooglePlayAccountId,
  AD_FREE_SUBSCRIPTION_PRODUCT_ID,
  getGooglePlaySubscriptionManagementUrl,
  type PackageProductDefinition,
} from "./payment-config";
import { supabase } from "@/integrations/supabase/client";

export interface VerificationResult {
  success: boolean;
  already_processed?: boolean;
  purchase_id?: string;
  games_left?: number;
  credits_granted?: number;
  consumed?: boolean;
  orderId?: string | null;
  error?: string;
}

export async function isGooglePlayBillingAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await NativePurchases.isBillingSupported();
    return res.isBillingSupported;
  } catch (err) {
    console.warn("[GooglePlay] isBillingSupported check failed:", err);
    return false;
  }
}

export async function fetchGooglePlayProducts(): Promise<Product[]> {
  if (!isNativeApp()) return [];
  try {
    const ids = getAllGooglePlayProductIds();
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: ids,
      productType: PURCHASE_TYPE.INAPP,
    });
    return products || [];
  } catch (err) {
    console.warn("[GooglePlay] fetchProducts error:", err);
    return [];
  }
}

export async function fetchGooglePlaySubscriptionProducts(): Promise<Product[]> {
  if (!isNativeApp()) return [];
  try {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: [AD_FREE_SUBSCRIPTION_PRODUCT_ID],
      productType: PURCHASE_TYPE.SUBS,
    });
    return products || [];
  } catch (err) {
    console.warn("[GooglePlay] fetchSubscriptionProducts error:", err);
    return [];
  }
}

/**
 * Sends acquired purchase token to trusted backend for server-side verification and atomic credit granting.
 */
export async function verifyGooglePlayPurchaseWithServer(params: {
  purchaseToken: string;
  productId: string;
  packageId?: string;
}): Promise<VerificationResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { success: false, error: "AUTH_REQUIRED" };
  }

  // Find matching internal package slug
  const pkgDef = findPackageByGooglePlayId(params.productId);
  const packageIdentifier = params.packageId || pkgDef?.slug;

  try {
    const response = await fetch("/api/verify-google-purchase", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        purchaseToken: params.purchaseToken,
        productId: params.productId,
        packageSlugOrId: packageIdentifier,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: errText || "SERVER_VERIFICATION_FAILED" };
    }

    const result = (await response.json()) as VerificationResult;
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Purchases a package via Google Play Billing sheet.
 * Server-Authoritative Consumable lifecycle:
 * 1. Sheet completes -> purchaseToken acquired with account binding (appAccountToken).
 * 2. Sent to server -> server verifies via productsv2.getproductpurchasev2, atomically grants credits,
 *    and consumes the purchase with Google Play API (purchases.products.consume).
 * 3. Client updates local UI and displays updated games_left. Client does NOT consume.
 */
export async function purchaseGooglePlayPackage(params: {
  packageDef: PackageProductDefinition;
  userId: string;
}): Promise<VerificationResult> {
  if (!isNativeApp()) {
    return { success: false, error: "NOT_NATIVE_ANDROID" };
  }

  try {
    // 1. Compute privacy-safe deterministic SHA-256 account identifier (<= 64 chars)
    const hashedAccountId = await hashGooglePlayAccountId(params.userId);

    // 2. Launch native Google Play purchase flow with hashed account binding
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: params.packageDef.googlePlayProductId,
      productType: PURCHASE_TYPE.INAPP,
      appAccountToken: hashedAccountId,
      isConsumable: false, // Server authoritative consumption!
      autoAcknowledgePurchases: false,
    });

    const purchaseToken = transaction.purchaseToken;
    if (!purchaseToken) {
      return { success: false, error: "MISSING_PURCHASE_TOKEN" };
    }

    // 2. Server-side verification, atomic credit granting, and server-side consume
    const verification = await verifyGooglePlayPurchaseWithServer({
      purchaseToken,
      productId: params.packageDef.googlePlayProductId,
      packageId: params.packageDef.slug,
    });

    if (!verification.success) {
      console.error("[GooglePlay] Server verification failed:", verification.error);
      return verification;
    }

    return verification;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("User cancelled") || message.includes("USER_CANCELED")) {
      return { success: false, error: "USER_CANCELLED" };
    }
    return { success: false, error: message };
  }
}

/**
 * Interrupted purchase recovery:
 * Checks for any unconsumed purchases on the device and reconciles them with the server.
 * The server handles verification, idempotency, and consumption.
 */
export async function recoverInterruptedPurchases(): Promise<number> {
  if (!isNativeApp()) return 0;
  try {
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.INAPP,
    });

    if (!purchases || purchases.length === 0) return 0;

    let recoveredCount = 0;
    for (const p of purchases) {
      if (!p.purchaseToken) continue;
      const verification = await verifyGooglePlayPurchaseWithServer({
        purchaseToken: p.purchaseToken,
        productId: p.productIdentifier,
      });

      if (verification.success) {
        recoveredCount++;
      }
    }
    return recoveredCount;
  } catch (err) {
    console.warn("[GooglePlay] recoverInterruptedPurchases error:", err);
    return 0;
  }
}

export interface SubscriptionVerificationResult {
  success: boolean;
  subscription_id?: string;
  status?: string;
  is_ad_free?: boolean;
  plan?: string;
  current_period_end?: string | null;
  orderId?: string | null;
  error?: string;
}

/**
 * Verifies acquired Google Play subscription token with backend using SubscriptionPurchaseV2.
 */
export async function verifyGooglePlaySubscriptionWithServer(params: {
  purchaseToken: string;
  subscriptionId?: string;
  basePlanId?: string;
}): Promise<SubscriptionVerificationResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { success: false, error: "AUTH_REQUIRED" };
  }

  try {
    const response = await fetch("/api/verify-google-subscription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        purchaseToken: params.purchaseToken,
        subscriptionId: params.subscriptionId || AD_FREE_SUBSCRIPTION_PRODUCT_ID,
        basePlanId: params.basePlanId,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: errText || "SERVER_VERIFICATION_FAILED" };
    }

    const result = (await response.json()) as SubscriptionVerificationResult;
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Purchases a recurring Ad-Free subscription via Google Play Billing sheet.
 * Uses ProductType.SUBS with base plan 'monthly' or 'yearly'.
 */
export async function purchaseGooglePlaySubscription(params: {
  plan: "monthly" | "yearly";
  userId: string;
}): Promise<SubscriptionVerificationResult> {
  if (!isNativeApp()) {
    return { success: false, error: "NOT_NATIVE_ANDROID" };
  }

  try {
    // 1. Compute privacy-safe deterministic SHA-256 account identifier
    const hashedAccountId = await hashGooglePlayAccountId(params.userId);

    // 2. Launch native Google Play subscription flow
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: AD_FREE_SUBSCRIPTION_PRODUCT_ID,
      planIdentifier: params.plan,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: hashedAccountId,
      autoAcknowledgePurchases: false,
    });

    const purchaseToken = transaction.purchaseToken;
    if (!purchaseToken) {
      return { success: false, error: "MISSING_PURCHASE_TOKEN" };
    }

    // 3. Server-side verification via SubscriptionPurchaseV2 and entitlement grant
    const verification = await verifyGooglePlaySubscriptionWithServer({
      purchaseToken,
      subscriptionId: AD_FREE_SUBSCRIPTION_PRODUCT_ID,
      basePlanId: params.plan,
    });

    return verification;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("User cancelled") || message.includes("USER_CANCELED")) {
      return { success: false, error: "USER_CANCELLED" };
    }
    return { success: false, error: message };
  }
}

/**
 * Opens Google Play subscription management page for this app / product.
 */
export async function openGooglePlaySubscriptionManagement(
  sku: string = AD_FREE_SUBSCRIPTION_PRODUCT_ID,
): Promise<void> {
  const url = getGooglePlaySubscriptionManagementUrl(sku);
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } catch {
    window.open(url, "_blank");
  }
}

/**
 * Interrupted subscription recovery:
 * Checks for any active/unacknowledged subscriptions and reconciles them with the server.
 */
export async function recoverInterruptedSubscriptions(): Promise<number> {
  if (!isNativeApp()) return 0;
  try {
    const { purchases } = await NativePurchases.getPurchases({
      productType: PURCHASE_TYPE.SUBS,
    });

    if (!purchases || purchases.length === 0) return 0;

    let recoveredCount = 0;
    for (const p of purchases) {
      if (!p.purchaseToken) continue;
      const verification = await verifyGooglePlaySubscriptionWithServer({
        purchaseToken: p.purchaseToken,
        subscriptionId: p.productIdentifier,
      });

      if (verification.success) {
        recoveredCount++;
      }
    }
    return recoveredCount;
  } catch (err) {
    console.warn("[GooglePlay] recoverInterruptedSubscriptions error:", err);
    return 0;
  }
}
