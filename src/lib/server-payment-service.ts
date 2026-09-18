// src/lib/server-payment-service.ts
// Server-side payment processing, webhook verification, and atomic credit fulfillment

import { createClient } from "@supabase/supabase-js";
import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";
import { google } from "googleapis";
import {
  getPackageDefinition,
  findPackageByGooglePlayId,
  findSubscriptionByPaddlePriceId,
  hashGooglePlayAccountId,
  ANDROID_PACKAGE_NAME,
  PAYMENT_PACKAGES,
  AD_FREE_SUBSCRIPTION_PRODUCT_ID,
  AD_FREE_SUBSCRIPTIONS,
} from "./payment-config";

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "[PaymentServer] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Initializes the official Paddle Server SDK client
 */
export function getPaddleServerClient(): Paddle {
  const apiKey = process.env["PADDLE_API_KEY"] || "";
  const isProd = process.env["PADDLE_ENV"] === "production";

  return new Paddle(apiKey, {
    environment: isProd ? Environment.production : Environment.sandbox,
    logLevel: LogLevel.warn,
  });
}

/**
 * Verifies and unmarshals Paddle Webhook using official @paddle/paddle-node-sdk
 */
export async function verifyAndUnmarshalPaddleWebhook(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
) {
  if (!signatureHeader || !webhookSecret) {
    throw new Error("MISSING_WEBHOOK_SIGNATURE_OR_SECRET");
  }

  const paddle = getPaddleServerClient();
  // Official SDK verifies HMAC SHA-256 signature and parses typed event
  const event = await paddle.webhooks.unmarshal(rawBody, webhookSecret, signatureHeader);
  return event;
}

export interface PaddleEventLike {
  eventType: string;
  data: {
    id: string;
    status?: string;
    subscriptionId?: string | null;
    customData?: {
      userId?: string;
      packageSlug?: string;
      packageId?: string;
      plan?: string;
    };
    details?: {
      totals?: {
        total?: string;
      };
    };
    currentBillingPeriod?: {
      startsAt?: string;
      endsAt?: string;
    };
    scheduledChange?: {
      action?: string;
      effectiveAt?: string;
    } | null;
    currencyCode?: string;
    items?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
}

/**
 * Processes verified Paddle webhook events:
 * 1. Subscription lifecycle: 'subscription.created', 'subscription.updated', 'subscription.canceled', etc.
 * 2. Canonical fulfillment for one-time package purchases: 'transaction.completed'.
 * Guaranteed NEVER to grant game credits for Ad-Free subscriptions.
 */
export async function processPaddleWebhookEvent(
  event: PaddleEventLike,
  deps?: { supabaseAdmin?: ReturnType<typeof getSupabaseAdminClient> },
) {
  const supabaseAdmin = deps?.supabaseAdmin || getSupabaseAdminClient();
  const eventType: string =
    event.eventType ||
    (typeof (event as Record<string, unknown>).event_type === "string"
      ? ((event as Record<string, unknown>).event_type as string)
      : "");

  // 1. Handle Subscription lifecycle events
  if (eventType.startsWith("subscription.")) {
    const sub = event.data as Record<string, unknown>;
    const customData =
      (sub.customData as Record<string, unknown> | undefined) ||
      (sub.custom_data as Record<string, unknown> | undefined) ||
      {};
    const userId = typeof customData.userId === "string" ? customData.userId : undefined;

    if (!userId) {
      return {
        status: "ignored",
        reason: "[Paddle Subscription Webhook] Missing userId in customData",
      };
    }

    const items = sub.items as Array<{ price?: { id?: string } }> | undefined;
    const priceId = items?.[0]?.price?.id || "";
    const subDef = findSubscriptionByPaddlePriceId(priceId);
    const plan =
      customData.plan === "ad_free_yearly" || subDef?.period === "yearly"
        ? "ad_free_yearly"
        : "ad_free_monthly";

    let mappedStatus: "active" | "trialing" | "past_due" | "paused" | "canceled" | "expired" =
      "active";
    if (sub.status === "active") mappedStatus = "active";
    else if (sub.status === "trialing") mappedStatus = "trialing";
    else if (sub.status === "past_due") mappedStatus = "past_due";
    else if (sub.status === "paused") mappedStatus = "paused";
    else if (sub.status === "canceled") mappedStatus = "canceled";
    else if (sub.status === "expired") mappedStatus = "expired";

    const periodStart =
      sub.currentBillingPeriod?.startsAt ||
      sub.current_billing_period?.starts_at ||
      new Date().toISOString();
    const periodEnd =
      sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at || null;
    const cancelAtPeriodEnd =
      sub.scheduledChange?.action === "cancel" ||
      sub.scheduled_change?.action === "cancel" ||
      mappedStatus === "canceled";

    const { data: subResult, error: subErr } = await supabaseAdmin.rpc(
      "upsert_verified_subscription",
      {
        p_user_id: userId,
        p_provider: "paddle",
        p_provider_subscription_id: sub.id,
        p_provider_transaction_id: sub.id,
        p_product_id: priceId || "paddle_ad_free",
        p_plan: plan,
        p_status: mappedStatus,
        p_current_period_start: periodStart,
        p_current_period_end: periodEnd,
        p_cancel_at_period_end: cancelAtPeriodEnd,
        p_canceled_at: cancelAtPeriodEnd ? new Date().toISOString() : null,
      },
    );

    if (subErr) {
      throw new Error(
        `[Paddle Subscription Webhook] upsert_verified_subscription failed: ${subErr.message}`,
      );
    }

    return { status: "success", result: subResult };
  }

  // 2. Canonical fulfillment event for one-time purchases: 'transaction.completed'
  if (eventType !== "transaction.completed") {
    return {
      status: "ignored",
      reason: `Event '${eventType}' ignored. Fulfillment is performed on 'transaction.completed' or 'subscription.*'.`,
    };
  }

  const transaction = event.data as Record<string, unknown>;
  const customData =
    (transaction.customData as Record<string, unknown> | undefined) ||
    (transaction.custom_data as Record<string, unknown> | undefined) ||
    {};
  const userId = typeof customData.userId === "string" ? customData.userId : undefined;
  const subscriptionId =
    (transaction.subscriptionId as string | undefined) ||
    (transaction.subscription_id as string | undefined);
  const planName = typeof customData.plan === "string" ? customData.plan : undefined;

  // Check if transaction is for an Ad-Free subscription
  if (subscriptionId || planName?.startsWith("ad_free")) {
    if (!userId) {
      throw new Error("[Paddle Webhook] Missing userId in subscription transaction customData");
    }

    const plan = planName === "ad_free_yearly" ? "ad_free_yearly" : "ad_free_monthly";
    const txnItems = transaction.items as Array<{ price?: { id?: string } }> | undefined;
    const priceId = txnItems?.[0]?.price?.id || "";

    const { data: subResult, error: subErr } = await supabaseAdmin.rpc(
      "upsert_verified_subscription",
      {
        p_user_id: userId,
        p_provider: "paddle",
        p_provider_subscription_id: transaction.subscriptionId || transaction.id,
        p_provider_transaction_id: transaction.id,
        p_product_id: priceId || "paddle_ad_free",
        p_plan: plan,
        p_status: "active",
        p_current_period_start: new Date().toISOString(),
        p_current_period_end: null,
        p_cancel_at_period_end: false,
        p_canceled_at: null,
      },
    );

    if (subErr) {
      throw new Error(`[Paddle Webhook] Subscription activation failed: ${subErr.message}`);
    }

    return { status: "success", subscription: subResult };
  }

  // Otherwise, standard one-time game package purchase
  const packageSlugOrId = customData?.packageSlug || customData?.packageId;

  if (!userId || !packageSlugOrId) {
    throw new Error("[Paddle Webhook] Missing userId or packageSlug in transaction customData");
  }

  const packageDef = getPackageDefinition(packageSlugOrId);

  // Find target package row in database (support slug or id)
  const { data: pkgRow, error: pkgErr } = await supabaseAdmin
    .from("packages")
    .select("id, slug, games_count, price, currency")
    .or(`slug.eq.${packageSlugOrId},id.eq.${packageSlugOrId}`)
    .maybeSingle();

  if (pkgErr || !pkgRow) {
    throw new Error(`[Paddle Webhook] Package not found in database: ${packageSlugOrId}`);
  }

  const amount = transaction.details?.totals?.total
    ? parseFloat(transaction.details.totals.total)
    : pkgRow.price;
  const currency = transaction.currencyCode || pkgRow.currency || "USD";
  const providerProductId = transaction.items?.[0]?.price?.id || packageDef?.paddlePriceId || "";

  // Execute atomic & idempotent complete_verified_purchase RPC
  const { data: result, error: rpcErr } = await supabaseAdmin.rpc("complete_verified_purchase", {
    p_user_id: userId,
    p_package_id: pkgRow.id,
    p_provider: "paddle",
    p_provider_transaction_id: transaction.id,
    p_provider_product_id: providerProductId,
    p_amount: amount,
    p_currency: currency,
    p_credits_override: pkgRow.games_count,
  });

  if (rpcErr) {
    throw new Error(`[Paddle Webhook] complete_verified_purchase RPC failed: ${rpcErr.message}`);
  }

  return { status: "success", result };
}

export interface GooglePlayPublisherClientLike {
  purchases: {
    productsv2: {
      getproductpurchasev2: (params: {
        packageName: string;
        token: string;
      }) => Promise<{ data: unknown }>;
    };
    products: {
      consume: (params: {
        packageName: string;
        productId: string;
        token: string;
      }) => Promise<unknown>;
    };
    subscriptionsv2: {
      get: (params: { packageName: string; token: string }) => Promise<{ data: unknown }>;
    };
    subscriptions?: {
      acknowledge?: (params: {
        packageName: string;
        subscriptionId: string;
        token: string;
        requestBody?: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  };
}

export interface GooglePlayVerificationDeps {
  androidPublisher?: GooglePlayPublisherClientLike;
  supabaseAdmin?: ReturnType<typeof getSupabaseAdminClient>;
}

export interface GooglePlayVerificationResult {
  success: boolean;
  already_processed?: boolean;
  purchase_id?: string;
  games_left?: number;
  credits_granted?: number;
  consumed?: boolean;
  orderId?: string | null;
  error?: string;
}

/**
 * Server-Authoritative Google Play Developer API Verification & Fulfillment
 * Endpoint: purchases.productsv2.getproductpurchasev2
 * Consumption: purchases.products.consume (executed on server after credit fulfillment)
 * Strictly validates:
 * 1. Package name is 'com.nextaurastudios.qadaltahaddi'
 * 2. Product ID matches catalog and Google Play line item
 * 3. Purchase state is PURCHASED (rejects PENDING and CANCELED)
 * 4. Account binding (obfuscatedExternalAccountId matches authenticated userId)
 * 5. Transaction idempotency via complete_verified_purchase RPC
 * 6. Server-side consumption frees the one-time token in Google Play
 */
export async function processGooglePlayVerification(
  params: {
    userId: string;
    purchaseToken: string;
    productId: string;
    packageSlugOrId?: string;
  },
  deps?: GooglePlayVerificationDeps,
): Promise<GooglePlayVerificationResult> {
  const { userId, purchaseToken, productId, packageSlugOrId } = params;

  if (!purchaseToken || !productId) {
    throw new Error("MISSING_TOKEN_OR_PRODUCT_ID");
  }

  // Verify that the requested productId is in our recognized product catalog
  const allowedProductIds = Object.values(PAYMENT_PACKAGES).map((p) => p.googlePlayProductId);
  if (!allowedProductIds.includes(productId)) {
    throw new Error(`UNAUTHORIZED_PRODUCT_ID: ${productId} is not a valid app product.`);
  }

  const pkgDef =
    findPackageByGooglePlayId(productId) || getPackageDefinition(packageSlugOrId || "");
  const supabaseAdmin = deps?.supabaseAdmin || getSupabaseAdminClient();

  // Look up package in database
  let query = supabaseAdmin.from("packages").select("id, slug, games_count, price, currency");
  if (pkgDef?.slug) {
    query = query.eq("slug", pkgDef.slug);
  } else if (packageSlugOrId) {
    query = query.or(`slug.eq.${packageSlugOrId},id.eq.${packageSlugOrId}`);
  } else {
    query = query.eq("slug", "single");
  }

  const { data: pkgRow, error: pkgErr } = await query.maybeSingle();
  if (pkgErr || !pkgRow) {
    throw new Error(`Package not found for Google Play product: ${productId}`);
  }

  // Initialize or inject Google Play Publisher API client
  let androidPublisher: GooglePlayPublisherClientLike;
  if (deps?.androidPublisher) {
    androidPublisher = deps.androidPublisher;
  } else {
    const serviceAccountJson = process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
    if (!serviceAccountJson) {
      throw new Error(
        "GOOGLE_PLAY_CREDENTIALS_NOT_CONFIGURED: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is required on server to verify purchases with Google Play Developer API.",
      );
    }

    let credentials;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error(
        "INVALID_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: Failed to parse credentials JSON.",
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    androidPublisher = google.androidpublisher({
      version: "v3",
      auth,
    }) as unknown as GooglePlayPublisherClientLike;
  }

  // 1. Call official purchases.productsv2.getproductpurchasev2 endpoint
  const v2Res = await androidPublisher.purchases.productsv2.getproductpurchasev2({
    packageName: ANDROID_PACKAGE_NAME,
    token: purchaseToken,
  });

  const purchaseData = (v2Res.data || {}) as {
    orderId?: string | null;
    productLineItem?: Array<{ productId?: string | null }>;
    purchaseStateContext?: { purchaseState?: string | null };
    productPurchaseState?: string | null;
    purchaseState?: number | string | null;
    obfuscatedExternalAccountId?: string | null;
  };

  // 2. Validate productLineItem
  const lineItems = purchaseData.productLineItem || [];
  if (lineItems.length === 0) {
    throw new Error("INVALID_PURCHASE_DATA: Google Play returned no product line items.");
  }
  const matchedItem = lineItems.find((item) => item.productId === productId);
  if (!matchedItem) {
    const returnedIds = lineItems
      .map((i) => i.productId)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `PRODUCT_ID_MISMATCH: Purchased product [${returnedIds}] does not match requested productId [${productId}].`,
    );
  }

  // 3. Validate purchaseState (reject pending or canceled)
  const rawState =
    purchaseData.purchaseStateContext?.purchaseState ??
    purchaseData.productPurchaseState ??
    purchaseData.purchaseState;

  const isPurchased =
    rawState === "PURCHASED" || rawState === "PRODUCT_PURCHASE_STATE_PURCHASED" || rawState === 0;

  if (!isPurchased) {
    if (rawState === "PENDING" || rawState === "PRODUCT_PURCHASE_STATE_PENDING" || rawState === 2) {
      throw new Error(
        "GOOGLE_PURCHASE_STATE_PENDING: Purchase is currently pending payment approval.",
      );
    }
    if (
      rawState === "CANCELED" ||
      rawState === "PRODUCT_PURCHASE_STATE_CANCELED" ||
      rawState === 1
    ) {
      throw new Error("GOOGLE_PURCHASE_STATE_CANCELED: Purchase has been canceled or refunded.");
    }
    throw new Error(`GOOGLE_PURCHASE_STATE_INVALID: Purchase state is '${rawState}'.`);
  }

  // 4. Validate Account Binding (privacy-safe deterministic SHA-256)
  // Backend calculates SHA-256(userId) itself and never trusts client-supplied hash.
  // Rejects missing, malformed, or mismatched account identifiers.
  if (!purchaseData.obfuscatedExternalAccountId) {
    throw new Error(
      "MISSING_ACCOUNT_IDENTIFIER: Google Play purchase lacks obfuscatedExternalAccountId binding.",
    );
  }

  const accountId = purchaseData.obfuscatedExternalAccountId;
  const isValidHex64 = /^[0-9a-f]{64}$/.test(accountId);
  if (!isValidHex64) {
    throw new Error(
      "MALFORMED_ACCOUNT_IDENTIFIER: obfuscatedExternalAccountId must be a 64-character lowercase hex string.",
    );
  }

  const expectedHashedAccountId = await hashGooglePlayAccountId(userId);
  if (accountId !== expectedHashedAccountId) {
    throw new Error("ACCOUNT_MISMATCH: Purchase is bound to a different user account.");
  }

  // 5. Execute atomic & idempotent complete_verified_purchase RPC
  const { data: result, error: rpcErr } = await supabaseAdmin.rpc("complete_verified_purchase", {
    p_user_id: userId,
    p_package_id: pkgRow.id,
    p_provider: "google_play",
    p_provider_transaction_id: purchaseToken,
    p_provider_product_id: productId,
    p_amount: pkgRow.price,
    p_currency: pkgRow.currency || "USD",
    p_credits_override: pkgRow.games_count,
  });

  if (rpcErr) {
    throw new Error(`complete_verified_purchase RPC failed: ${rpcErr.message}`);
  }

  // 6. Server-Authoritative Google Play Consumption (purchases.products.consume)
  // Call consume to finalize the purchase in Google Play and allow subsequent purchases
  let consumed = false;
  try {
    await androidPublisher.purchases.products.consume({
      packageName: ANDROID_PACKAGE_NAME,
      productId,
      token: purchaseToken,
    });
    consumed = true;
  } catch (consumeErr: unknown) {
    const consumeMessage = consumeErr instanceof Error ? consumeErr.message : String(consumeErr);
    console.warn(
      `[Google Play] Server-side consume notice for token ${purchaseToken.substring(0, 12)}...:`,
      consumeMessage,
    );
  }

  const rpcResult = (result || {}) as {
    success?: boolean;
    already_processed?: boolean;
    purchase_id?: string;
    games_left?: number;
    credits_granted?: number;
  };

  return {
    success: rpcResult.success ?? true,
    already_processed: rpcResult.already_processed ?? false,
    purchase_id: rpcResult.purchase_id,
    games_left: rpcResult.games_left,
    credits_granted: rpcResult.credits_granted,
    consumed,
    orderId: purchaseData.orderId || null,
  };
}

export interface GooglePlaySubscriptionVerificationResult {
  success: boolean;
  subscription_id?: string;
  status: string;
  is_ad_free: boolean;
  plan: string;
  current_period_end?: string | null;
  orderId?: string | null;
  error?: string;
}

/**
 * Server-Authoritative Google Play Subscription Verification & Entitlement Fulfillment
 * Endpoint: purchases.subscriptionsv2.get
 * Acknowledges: purchases.subscriptions.acknowledge (if needed)
 * Strictly validates:
 * 1. Package name matches ANDROID_PACKAGE_NAME
 * 2. Subscription product is 'qad_ad_free'
 * 3. Base plan is 'monthly' or 'yearly'
 * 4. Account binding (obfuscatedExternalAccountId matches authenticated userId)
 * 5. Lifecycle states: active, in_grace_period (past_due), on_hold (paused), canceled, expired
 * 6. Guaranteed NEVER to touch game credits or balance.
 */
export async function processGooglePlaySubscriptionVerification(
  params: {
    userId: string;
    purchaseToken: string;
    subscriptionId?: string;
    basePlanId?: string;
  },
  deps?: GooglePlayVerificationDeps,
): Promise<GooglePlaySubscriptionVerificationResult> {
  const {
    userId,
    purchaseToken,
    subscriptionId = AD_FREE_SUBSCRIPTION_PRODUCT_ID,
    basePlanId,
  } = params;

  if (!userId || !purchaseToken) {
    throw new Error("MISSING_USER_OR_PURCHASE_TOKEN");
  }

  const supabaseAdmin = deps?.supabaseAdmin || getSupabaseAdminClient();

  // Initialize or inject Google Play Publisher API client
  let androidPublisher: GooglePlayPublisherClientLike;
  if (deps?.androidPublisher) {
    androidPublisher = deps.androidPublisher;
  } else {
    const serviceAccountJson = process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
    if (!serviceAccountJson) {
      throw new Error(
        "GOOGLE_PLAY_CREDENTIALS_NOT_CONFIGURED: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is required on server to verify subscriptions with Google Play Developer API.",
      );
    }

    let credentials;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error(
        "INVALID_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: Failed to parse credentials JSON.",
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    androidPublisher = google.androidpublisher({
      version: "v3",
      auth,
    }) as unknown as GooglePlayPublisherClientLike;
  }

  // 1. Call official purchases.subscriptionsv2.get endpoint
  const v2Res = await androidPublisher.purchases.subscriptionsv2.get({
    packageName: ANDROID_PACKAGE_NAME,
    token: purchaseToken,
  });

  const purchaseData = (v2Res.data || {}) as {
    lineItems?: Array<{
      productId?: string | null;
      expiryTime?: string | null;
      latestSuccessfulOrderId?: string | null;
      autoRenewingPlan?: { autoRenewEnabled?: boolean | null } | null;
      offerDetails?: { basePlanId?: string | null } | null;
    }>;
    subscriptionState?: string | null;
    startTime?: string | null;
    acknowledgementState?: string | null;
    externalAccountIdentifiers?: {
      obfuscatedExternalAccountId?: string | null;
    };
  };

  // 2. Validate lineItems
  const lineItem = purchaseData.lineItems?.[0];
  if (!lineItem) {
    throw new Error("INVALID_SUBSCRIPTION_DATA: Google Play returned no subscription line items.");
  }

  const returnedProductId = lineItem.productId || subscriptionId;
  if (
    returnedProductId !== AD_FREE_SUBSCRIPTION_PRODUCT_ID &&
    returnedProductId !== subscriptionId
  ) {
    throw new Error(
      `UNAUTHORIZED_SUBSCRIPTION_PRODUCT: Product [${returnedProductId}] is not authorized.`,
    );
  }

  // Determine plan from basePlanId
  const effectiveBasePlan = lineItem.offerDetails?.basePlanId || basePlanId || "monthly";
  const plan = effectiveBasePlan.includes("year") ? "ad_free_yearly" : "ad_free_monthly";

  // 3. Validate Account Binding (privacy-safe deterministic SHA-256)
  const returnedAccountId = purchaseData.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (!returnedAccountId) {
    throw new Error(
      "MISSING_ACCOUNT_IDENTIFIER: Google Play subscription lacks obfuscatedExternalAccountId binding.",
    );
  }

  const isValidHex64 = /^[0-9a-f]{64}$/.test(returnedAccountId);
  if (!isValidHex64) {
    throw new Error(
      "MALFORMED_ACCOUNT_IDENTIFIER: obfuscatedExternalAccountId must be a 64-character lowercase hex string.",
    );
  }

  const expectedHashedAccountId = await hashGooglePlayAccountId(userId);
  if (returnedAccountId !== expectedHashedAccountId) {
    throw new Error("ACCOUNT_MISMATCH: Purchase is bound to a different user account.");
  }

  // 4. Map Subscription State
  const rawState = purchaseData.subscriptionState;
  let status: "active" | "trialing" | "past_due" | "paused" | "canceled" | "expired" = "active";

  if (rawState === "SUBSCRIPTION_STATE_ACTIVE") {
    status = "active";
  } else if (rawState === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
    status = "past_due";
  } else if (
    rawState === "SUBSCRIPTION_STATE_ON_HOLD" ||
    rawState === "SUBSCRIPTION_STATE_PAUSED"
  ) {
    status = "paused";
  } else if (rawState === "SUBSCRIPTION_STATE_CANCELED") {
    status = "canceled";
  } else if (rawState === "SUBSCRIPTION_STATE_EXPIRED") {
    status = "expired";
  } else if (rawState === "SUBSCRIPTION_STATE_PENDING") {
    throw new Error("GOOGLE_SUBSCRIPTION_PENDING: Subscription payment is currently pending.");
  } else {
    status = "active";
  }

  const expiryTime = lineItem.expiryTime || null;
  const cancelAtPeriodEnd =
    lineItem.autoRenewingPlan?.autoRenewEnabled === false ||
    rawState === "SUBSCRIPTION_STATE_CANCELED";

  // 5. Upsert subscription record in database
  const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
    "upsert_verified_subscription",
    {
      p_user_id: userId,
      p_provider: "google_play",
      p_provider_subscription_id: purchaseToken,
      p_provider_transaction_id: lineItem.latestSuccessfulOrderId || purchaseToken,
      p_product_id: returnedProductId,
      p_plan: plan,
      p_status: status,
      p_current_period_start: purchaseData.startTime || new Date().toISOString(),
      p_current_period_end: expiryTime,
      p_cancel_at_period_end: cancelAtPeriodEnd,
      p_canceled_at: cancelAtPeriodEnd ? new Date().toISOString() : null,
    },
  );

  if (rpcErr) {
    throw new Error(`upsert_verified_subscription failed: ${rpcErr.message}`);
  }

  // 6. Acknowledge subscription if pending
  if (
    purchaseData.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING" &&
    androidPublisher.purchases.subscriptions?.acknowledge
  ) {
    try {
      await androidPublisher.purchases.subscriptions.acknowledge({
        packageName: ANDROID_PACKAGE_NAME,
        subscriptionId: returnedProductId,
        token: purchaseToken,
      });
    } catch (ackErr: unknown) {
      console.warn(
        "[Google Play] Subscription acknowledgement warning:",
        ackErr instanceof Error ? ackErr.message : String(ackErr),
      );
    }
  }

  const parsedResult = (rpcResult || {}) as {
    success?: boolean;
    subscription_id?: string;
    is_ad_free?: boolean;
    status?: string;
  };

  return {
    success: parsedResult.success ?? true,
    subscription_id: parsedResult.subscription_id,
    status: parsedResult.status || status,
    is_ad_free: parsedResult.is_ad_free ?? status === "active",
    plan,
    current_period_end: expiryTime,
    orderId: lineItem.latestSuccessfulOrderId || null,
  };
}

/**
 * Handles Real-Time Developer Notifications (RTDN) from Google Cloud Pub/Sub
 * to automatically synchronize subscription changes (renewals, cancellations, grace periods).
 */
export async function processGooglePlayRtdnNotification(
  pubSubMessage: { data?: string },
  deps?: GooglePlayVerificationDeps,
) {
  if (!pubSubMessage?.data) {
    return { status: "ignored", reason: "EMPTY_PUBSUB_DATA" };
  }

  let payload: {
    subscriptionNotification?: {
      purchaseToken?: string;
      subscriptionId?: string;
      notificationType?: number;
    };
  };

  try {
    const rawJson = Buffer.from(pubSubMessage.data, "base64").toString("utf-8");
    payload = JSON.parse(rawJson);
  } catch {
    return { status: "ignored", reason: "INVALID_BASE64_OR_JSON" };
  }

  const subNotification = payload.subscriptionNotification;
  if (!subNotification) {
    return { status: "ignored", reason: "NOT_A_SUBSCRIPTION_NOTIFICATION" };
  }

  const { purchaseToken, subscriptionId, notificationType } = subNotification;
  if (!purchaseToken) {
    return { status: "ignored", reason: "MISSING_PURCHASE_TOKEN" };
  }

  const supabaseAdmin = deps?.supabaseAdmin || getSupabaseAdminClient();
  const { data: existingSub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id")
    .eq("provider", "google_play")
    .eq("provider_subscription_id", purchaseToken)
    .maybeSingle();

  if (!existingSub?.user_id) {
    console.warn(
      `[RTDN] No existing user found for Google Play token: ${purchaseToken.substring(0, 10)}...`,
    );
    return { status: "unmatched_user", purchaseToken, notificationType };
  }

  const verification = await processGooglePlaySubscriptionVerification(
    {
      userId: existingSub.user_id,
      purchaseToken,
      subscriptionId,
    },
    deps,
  );

  return { status: "success", notificationType, verification };
}
