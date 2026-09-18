// src/lib/payment-config.ts
// Centralized configuration for Paddle Billing and Google Play Billing

export interface PackageProductDefinition {
  slug: string;
  name: string;
  gamesCount: number;
  priceUsd: number;
  googlePlayProductId: string;
  paddlePriceId: string;
}

const getEnv = (key: string): string => {
  if (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env) {
    return (import.meta as { env: Record<string, string> }).env[key] || "";
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] || "";
  }
  return "";
};

/**
 * Centralized reference for Paddle Sandbox Product IDs.
 * Note: Runtime operations in Paddle Billing use Price IDs for checkout and webhooks;
 * these Product IDs are kept here for centralized documentation and reference.
 */
export const PADDLE_SANDBOX_PRODUCT_IDS = {
  single: "pro_01m2tt4vsmg20exyrsy91v1bjp",
  triple: "pro_01m2txsgfns38bsvgyb4zsw51z",
  tournament: "pro_01m2txxhhabs2m302aqdhp8jfp",
  vip: "pro_01m2ty07txvf12tbf0b13maxjk",
  adFree: "pro_01m2ty231ptk5nq5myb2nmprkr",
} as const;

/**
 * Real Paddle Sandbox Price IDs configured in the Paddle dashboard.
 */
export const PADDLE_SANDBOX_DEFAULT_PRICE_IDS = {
  single: "pri_01m2tvh9dg32cdx2sm6pjj087b",
  triple: "pri_01m2txtqyn5vmf5r2bedk6ajj8",
  tournament: "pri_01m2txygk6mt363yfgrftjdrgn",
  vip: "pri_01m2ty0t4p94sz6q5y9pk8afnm",
  adFreeMonthly: "pri_01m2ty4wqfsgh8bb7gsr2xk6dm",
  adFreeYearly: "pri_01m2ty9p5g2cz22vhxr8dn36ek",
} as const;

export const PAYMENT_PACKAGES: Record<string, PackageProductDefinition> = {
  single: {
    slug: "single",
    name: "لعبة وحدة",
    gamesCount: 1,
    priceUsd: 4.99,
    googlePlayProductId: "qad_pkg_single_1",
    paddlePriceId:
      getEnv("VITE_PADDLE_PRICE_SINGLE") || PADDLE_SANDBOX_DEFAULT_PRICE_IDS.single,
  },
  triple: {
    slug: "triple",
    name: "٣ ألعاب",
    gamesCount: 3,
    priceUsd: 10.99,
    googlePlayProductId: "qad_pkg_triple_3",
    paddlePriceId:
      getEnv("VITE_PADDLE_PRICE_TRIPLE") || PADDLE_SANDBOX_DEFAULT_PRICE_IDS.triple,
  },
  tournament: {
    slug: "tournament",
    name: "باقة بطولة",
    gamesCount: 6,
    priceUsd: 19.99,
    googlePlayProductId: "qad_pkg_tournament_6",
    paddlePriceId:
      getEnv("VITE_PADDLE_PRICE_TOURNAMENT") || PADDLE_SANDBOX_DEFAULT_PRICE_IDS.tournament,
  },
  vip: {
    slug: "vip",
    name: "باقة VIP",
    gamesCount: 12,
    priceUsd: 24.99,
    googlePlayProductId: "qad_pkg_vip_12",
    paddlePriceId:
      getEnv("VITE_PADDLE_PRICE_VIP") || PADDLE_SANDBOX_DEFAULT_PRICE_IDS.vip,
  },
};

export const PADDLE_CONFIG = {
  environment: (getEnv("VITE_PADDLE_ENV") || "sandbox") as "sandbox" | "production",
  clientToken: getEnv("VITE_PADDLE_CLIENT_TOKEN") || "",
};

export const ANDROID_PACKAGE_NAME = "com.nextaurastudios.qadaltahaddi";

export function getPackageDefinition(slugOrId: string): PackageProductDefinition | undefined {
  if (PAYMENT_PACKAGES[slugOrId]) return PAYMENT_PACKAGES[slugOrId];
  // Backward compatibility alias: 'monthly' maps to 'vip'
  if (slugOrId === "monthly") return PAYMENT_PACKAGES.vip;
  return Object.values(PAYMENT_PACKAGES).find((p) => p.slug === slugOrId);
}

export function getAllGooglePlayProductIds(): string[] {
  return Object.values(PAYMENT_PACKAGES).map((p) => p.googlePlayProductId);
}

export function findPackageByGooglePlayId(productId: string): PackageProductDefinition | undefined {
  return Object.values(PAYMENT_PACKAGES).find((p) => p.googlePlayProductId === productId);
}

export function findPackageByPaddlePriceId(priceId: string): PackageProductDefinition | undefined {
  return Object.values(PAYMENT_PACKAGES).find((p) => p.paddlePriceId === priceId);
}

export function isValidPaddlePriceId(priceId: string | undefined | null): boolean {
  if (!priceId || typeof priceId !== "string") return false;
  const trimmed = priceId.trim();
  return /^pri_[a-z0-9]+$/i.test(trimmed) && !trimmed.includes("placeholder");
}

export interface SubscriptionProductDefinition {
  plan: "ad_free_monthly" | "ad_free_yearly";
  name: string;
  period: "monthly" | "yearly";
  jodPriceDisplay: string;
  jodPrice: number;
  googlePlayProductId: string;
  googlePlayBasePlanId: string;
  paddlePriceId: string;
  badge?: string;
  savingsText?: string;
}

export const AD_FREE_SUBSCRIPTION_PRODUCT_ID = "qad_ad_free";

export const AD_FREE_SUBSCRIPTIONS: Record<"monthly" | "yearly", SubscriptionProductDefinition> = {
  monthly: {
    plan: "ad_free_monthly",
    name: "اشتراك شهري بدون إعلانات",
    period: "monthly",
    jodPriceDisplay: "٣ د.أ / شهر",
    jodPrice: 3,
    googlePlayProductId: AD_FREE_SUBSCRIPTION_PRODUCT_ID,
    googlePlayBasePlanId: "monthly",
    paddlePriceId:
      getEnv("VITE_PADDLE_PRICE_AD_FREE_MONTHLY") ||
      PADDLE_SANDBOX_DEFAULT_PRICE_IDS.adFreeMonthly,
  },
  yearly: {
    plan: "ad_free_yearly",
    name: "اشتراك سنوي بدون إعلانات",
    period: "yearly",
    jodPriceDisplay: "٣٠ د.أ / سنة",
    jodPrice: 30,
    googlePlayProductId: AD_FREE_SUBSCRIPTION_PRODUCT_ID,
    googlePlayBasePlanId: "yearly",
    paddlePriceId:
      getEnv("VITE_PADDLE_PRICE_AD_FREE_YEARLY") ||
      PADDLE_SANDBOX_DEFAULT_PRICE_IDS.adFreeYearly,
    badge: "الأكثر توفيراً",
    savingsText: "وفّر ٦ د.أ سنوياً",
  },
};

export function getSubscriptionDefinition(
  planOrPeriod: string,
): SubscriptionProductDefinition | undefined {
  if (planOrPeriod === "monthly" || planOrPeriod === "ad_free_monthly") {
    return AD_FREE_SUBSCRIPTIONS.monthly;
  }
  if (planOrPeriod === "yearly" || planOrPeriod === "ad_free_yearly") {
    return AD_FREE_SUBSCRIPTIONS.yearly;
  }
  return undefined;
}

export function findSubscriptionByPaddlePriceId(
  priceId: string,
): SubscriptionProductDefinition | undefined {
  return Object.values(AD_FREE_SUBSCRIPTIONS).find((s) => s.paddlePriceId === priceId);
}

export function getGooglePlaySubscriptionManagementUrl(
  sku: string = AD_FREE_SUBSCRIPTION_PRODUCT_ID,
): string {
  return `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE_NAME}&sku=${sku}`;
}

/**
 * Computes a deterministic, privacy-preserving SHA-256 hash of the Supabase user ID
 * for Google Play Billing account binding (obfuscatedExternalAccountId).
 * Never exposes raw user ID, email, or phone to Google Play.
 * Output is lowercase hex with length exactly 64 characters (Google Play limit <= 64).
 */
export async function hashGooglePlayAccountId(userId: string): Promise<string> {
  if (!userId || typeof userId !== "string") {
    throw new Error("INVALID_USER_ID: userId must be a non-empty string.");
  }

  const normalized = userId.trim().toLowerCase();

  // Web Crypto API (browser, Capacitor WebView, Node 18+)
  if (
    typeof crypto !== "undefined" &&
    crypto.subtle &&
    typeof crypto.subtle.digest === "function"
  ) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Node fallback if global crypto.subtle is not present
  try {
    const nodeCrypto = await import("crypto");
    return nodeCrypto.createHash("sha256").update(normalized).digest("hex");
  } catch {
    throw new Error("CRYPTO_UNAVAILABLE: Unable to compute SHA-256 hash in current environment.");
  }
}
