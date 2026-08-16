import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

import { RULESET_TAG } from "@/lib/flags/ruleset";

/**
 * GrowthBook webhook → drop the cached ruleset.
 *
 * Step 4 of FLAGS-PLAN.md. Without this, a flag change waits for the
 * `cacheLife("hours")` window to lapse. With it, GrowthBook tells us the moment
 * something changed and the next visitor gets the new value.
 *
 * A Route Handler and not a Server Action, because `revalidateTag` is callable
 * from both but `updateTag` is not — and `revalidateTag` is the one we want
 * anyway (see below). Proxy cannot call either.
 *
 * ## Two signature schemes, because GrowthBook has two webhook systems
 *
 * Step 4 was written for **SDK Webhooks** and then blocked: the free plan
 * allows one per organisation and Vercel's Edge Config sync already holds it.
 * **Event Webhooks** (SDK Configuration → Event Webhooks) are a separate system
 * with a separate limit, which is the slot that turned out to be free — so that
 * is the path actually in use.
 *
 * They do not sign the same way, and the mismatch is what produced a `400` with
 * `missing signature headers` on the first delivery:
 *
 *   | | SDK Webhook | Event Webhook |
 *   | --- | --- | --- |
 *   | headers | `webhook-id`, `webhook-timestamp`, `webhook-signature` | `X-GrowthBook-Signature` |
 *   | signed  | `id.timestamp.body` | the raw body alone |
 *   | digest  | base64 | hex |
 *   | secret  | yours | GrowthBook's, prefixed `ewhk_` |
 *
 * Both are supported. The scheme is chosen by which header arrived rather than
 * by configuration, so neither path can be selected by accident.
 */

/**
 * How far out of date an SDK webhook's timestamp may be.
 *
 * Without this, a signed request captured once is replayable forever. Five
 * minutes is the Standard Webhooks recommendation and leaves room for clock
 * skew between GrowthBook and us.
 *
 * **Event Webhooks have no equivalent**, because they sign the body alone —
 * there is no timestamp in the signed material, so a captured delivery stays
 * valid indefinitely and nothing here can detect a replay. That is tolerable
 * only because of what a replay can do: mark one cache tag stale. It is
 * idempotent, costs one ruleset read, and reveals nothing. Were this endpoint
 * to do anything else, the scheme would not be good enough.
 */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Constant-time compare that tolerates a length mismatch.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so calling it
 * directly on attacker-controlled input turns a forged signature into a 500
 * instead of a 401. GrowthBook's own documented example has this bug.
 */
function signaturesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

type Rejection = { error: string; status: number };

/**
 * Event Webhook: HMAC-SHA256 over the raw body, hex, in one header.
 *
 * The secret is GrowthBook's own `ewhk_…` value, shown once when the webhook is
 * created. It is read from its own environment variable so the two schemes
 * cannot be given each other's secret and fail with a signature error that
 * looks like tampering.
 */
function verifyEventWebhook(
  body: string,
  provided: string,
): Rejection | null {
  const secret = process.env.GROWTHBOOK_EVENT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[flags] GROWTHBOOK_EVENT_WEBHOOK_SECRET is not set");
    return { error: "event webhook not configured", status: 500 };
  }

  const expected = createHmac("sha256", secret).update(body).digest("hex");

  return signaturesMatch(provided, expected)
    ? null
    : { error: "invalid signature", status: 401 };
}

/** SDK Webhook: Standard Webhooks — three headers, base64, `id.timestamp.body`. */
function verifySdkWebhook(
  headers: Headers,
  body: string,
): Rejection | null {
  const secret = process.env.GROWTHBOOK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[flags] GROWTHBOOK_WEBHOOK_SECRET is not set");
    return { error: "webhook not configured", status: 500 };
  }

  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");

  if (!id || !timestamp || !signatureHeader) {
    return { error: "missing signature headers", status: 400 };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { error: "bad timestamp", status: 400 };
  }
  if (Math.abs(Date.now() / 1000 - sentAt) > TOLERANCE_SECONDS) {
    return { error: "timestamp outside tolerance", status: 400 };
  }

  const expected = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  // The header may carry several space-separated signatures — that is how the
  // spec supports rotating a secret without dropping deliveries. Any match is
  // a pass.
  const provided = signatureHeader
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice("v1,".length));

  return provided.some((candidate) => signaturesMatch(candidate, expected))
    ? null
    : { error: "invalid signature", status: 401 };
}

/** The event name, if the payload carries one. Event Webhooks always do. */
function readEventName(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "event" in parsed) {
      const { event } = parsed as { event: unknown };
      return typeof event === "string" ? event : null;
    }
  } catch {
    // An SDK webhook in "Standard (no SDK payload)" format sends an empty body,
    // which is not a parse failure worth reporting — it simply has no event.
  }
  return null;
}

export async function POST(request: Request) {
  // The raw text, not the parsed JSON: both signatures cover the exact bytes
  // sent, and re-serialising a parsed object will not reproduce them.
  const body = await request.text();

  const eventSignature = request.headers.get("x-growthbook-signature");

  const rejection = eventSignature
    ? verifyEventWebhook(body, eventSignature)
    : verifySdkWebhook(request.headers, body);

  if (rejection) {
    return Response.json(
      { error: rejection.error },
      { status: rejection.status },
    );
  }

  // GrowthBook's "test" button sends this before any real event. Acknowledged
  // without invalidating: the point of pressing it is to confirm the signature
  // and the URL, and a test that quietly expired production's cache would be a
  // surprising thing for a test button to do.
  const event = readEventName(body);
  if (event === "webhook.test") {
    return Response.json({ ok: true, event, revalidated: null });
  }

  // `revalidateTag` with `"max"`, not `updateTag`: this marks the entry stale
  // and lets the next visitor be served the old value while a fresh one is
  // built behind them. Nothing recomputes until a page using the tag is
  // actually visited, so a flag change cannot stampede every instance at once.
  revalidateTag(RULESET_TAG, "max");

  return Response.json({ ok: true, event, revalidated: RULESET_TAG });
}
