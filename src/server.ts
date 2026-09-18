import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

import {
  verifyAndUnmarshalPaddleWebhook,
  processPaddleWebhookEvent,
  processGooglePlayVerification,
  processGooglePlaySubscriptionVerification,
  processGooglePlayRtdnNotification,
  getSupabaseAdminClient,
  type PaddleEventLike,
} from "./lib/server-payment-service";

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // 1. Paddle Billing Webhook Handler via official @paddle/paddle-node-sdk
    if (url.pathname === "/api/paddle-webhook" || url.pathname === "/api/paddle/webhook") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const webhookSecret = process.env["PADDLE_WEBHOOK_SECRET"] || "";
      const signatureHeader = request.headers.get("Paddle-Signature");
      const rawBody = await request.text();

      try {
        let event: PaddleEventLike;
        if (webhookSecret) {
          // Official Paddle SDK verifies HMAC SHA-256 and unmarshals typed event
          event = (await verifyAndUnmarshalPaddleWebhook(
            rawBody,
            signatureHeader,
            webhookSecret,
          )) as unknown as PaddleEventLike;
        } else {
          console.warn(
            "[Paddle Webhook] PADDLE_WEBHOOK_SECRET not set. Parsing unverified payload in local sandbox mode.",
          );
          event = JSON.parse(rawBody);
        }

        const result = await processPaddleWebhookEvent(event);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Paddle Webhook] Processing error:", message);
        const status = message.includes("signature") || message.includes("INVALID") ? 401 : 500;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 2. Google Play Android Purchase Verification Handler
    if (url.pathname === "/api/verify-google-purchase") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "");
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized: Missing auth token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const supabaseAdmin = getSupabaseAdminClient();
        const {
          data: { user },
          error: authError,
        } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized: Invalid session" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const body = (await request.json()) as {
          purchaseToken: string;
          productId: string;
          packageSlugOrId?: string;
        };

        const result = await processGooglePlayVerification({
          userId: user.id,
          purchaseToken: body.purchaseToken,
          productId: body.productId,
          packageSlugOrId: body.packageSlugOrId,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Google Play Verify] Error:", message);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 3. Google Play Android Subscription Verification Handler
    if (url.pathname === "/api/verify-google-subscription") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "");
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized: Missing auth token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const supabaseAdmin = getSupabaseAdminClient();
        const {
          data: { user },
          error: authError,
        } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized: Invalid session" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const body = (await request.json()) as {
          purchaseToken: string;
          subscriptionId?: string;
          basePlanId?: string;
        };

        const result = await processGooglePlaySubscriptionVerification({
          userId: user.id,
          purchaseToken: body.purchaseToken,
          subscriptionId: body.subscriptionId,
          basePlanId: body.basePlanId,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Google Play Subscription Verify] Error:", message);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 4. Google Play Real-Time Developer Notifications (RTDN) Webhook via Cloud Pub/Sub
    if (url.pathname === "/api/google-play-rtdn") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      try {
        const body = (await request.json()) as {
          message?: {
            data?: string;
            messageId?: string;
          };
        };

        if (!body.message?.data) {
          return new Response(JSON.stringify({ error: "Bad Request: Missing Pub/Sub message data" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const result = await processGooglePlayRtdnNotification(body.message);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Google Play RTDN] Processing error:", message);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default SSR / Route handler
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
