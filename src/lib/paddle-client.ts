// src/lib/paddle-client.ts
// Browser-only Paddle Billing client integration

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import {
  PADDLE_CONFIG,
  isValidPaddlePriceId,
  type PackageProductDefinition,
  type SubscriptionProductDefinition,
} from "./payment-config";

let paddlePromise: Promise<Paddle | undefined> | undefined;

export async function getPaddleInstance(): Promise<Paddle | undefined> {
  if (typeof window === "undefined") return undefined;
  if (!PADDLE_CONFIG.clientToken) {
    console.warn(
      "[Paddle] VITE_PADDLE_CLIENT_TOKEN is not set. Paddle checkout will run in demo/sandbox placeholder mode.",
    );
    return undefined;
  }

  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      environment: PADDLE_CONFIG.environment,
      token: PADDLE_CONFIG.clientToken,
    });
  }

  return paddlePromise;
}

export interface PaddleCheckoutParams {
  packageDef: PackageProductDefinition;
  userId: string;
  userEmail?: string | null;
  onCheckoutComplete?: (transactionId?: string) => void;
  onCheckoutClose?: () => void;
}

export async function openPaddleCheckout({
  packageDef,
  userId,
  userEmail,
  onCheckoutComplete,
  onCheckoutClose,
}: PaddleCheckoutParams): Promise<boolean> {
  if (!isValidPaddlePriceId(packageDef.paddlePriceId)) {
    console.error(
      `[Paddle] Invalid or missing Paddle Price ID "${packageDef.paddlePriceId}" for package "${packageDef.slug}". Checkout aborted.`,
    );
    return false;
  }

  const paddle = await getPaddleInstance();

  if (!paddle) {
    return false;
  }

  paddle.Checkout.open({
    items: [
      {
        priceId: packageDef.paddlePriceId,
        quantity: 1,
      },
    ],
    customData: {
      userId,
      packageSlug: packageDef.slug,
    },
    customer: userEmail ? { email: userEmail } : undefined,
    settings: {
      displayMode: "overlay",
      theme: "dark",
      locale: "ar",
    },
  });

  return true;
}

export interface PaddleSubscriptionCheckoutParams {
  subscriptionDef: SubscriptionProductDefinition;
  userId: string;
  userEmail?: string | null;
  onCheckoutComplete?: (transactionId?: string) => void;
  onCheckoutClose?: () => void;
}

export async function openPaddleSubscriptionCheckout({
  subscriptionDef,
  userId,
  userEmail,
}: PaddleSubscriptionCheckoutParams): Promise<boolean> {
  if (!isValidPaddlePriceId(subscriptionDef.paddlePriceId)) {
    console.error(
      `[Paddle] Invalid or missing Paddle Price ID "${subscriptionDef.paddlePriceId}" for subscription "${subscriptionDef.plan}". Checkout aborted.`,
    );
    return false;
  }

  const paddle = await getPaddleInstance();

  if (!paddle) {
    return false;
  }

  paddle.Checkout.open({
    items: [
      {
        priceId: subscriptionDef.paddlePriceId,
        quantity: 1,
      },
    ],
    customData: {
      userId,
      plan: subscriptionDef.plan,
    },
    customer: userEmail ? { email: userEmail } : undefined,
    settings: {
      displayMode: "overlay",
      theme: "dark",
      locale: "ar",
    },
  });

  return true;
}

export interface DynamicPaddlePrice {
  priceId: string;
  formattedTotal: string;
  currencyCode: string;
}

/**
 * Fetches real-time price preview dynamically from Paddle.js based on configured Price IDs.
 * Returns null if Paddle client token is not set or preview fails.
 */
export async function getPaddlePricePreview(priceId: string): Promise<DynamicPaddlePrice | null> {
  const paddle = await getPaddleInstance();
  if (!paddle || !priceId) return null;

  try {
    const preview = await paddle.PricePreview({
      items: [{ priceId, quantity: 1 }],
    });
    const lineItem = preview?.data?.details?.lineItems?.[0];
    if (lineItem?.formattedTotals?.total) {
      return {
        priceId,
        formattedTotal: lineItem.formattedTotals.total,
        currencyCode: preview.data.currencyCode,
      };
    }
    return null;
  } catch (err) {
    console.warn("[Paddle] PricePreview lookup failed for:", priceId, err);
    return null;
  }
}
