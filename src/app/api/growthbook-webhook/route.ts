import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

import { RULESET_TAG } from "@/lib/flags/ruleset";

/**
 * GrowthBook SDK webhook → drop the cached ruleset.
 *
 * Step 4 of FLAGS-PLAN.md. Without this, a flag change waits for the
 * `cacheLife("minutes")` window to lapse. With it, GrowthBook tells us the
 * moment something changed and the next visitor gets the new value.
 *
 * A Route Handler and not a Server Action, because `revalidateTag` is callable
 * from both but `updateTag` is not — and `revalidateTag` is the one we want
 * anyway (see below). Proxy cannot call either.
 */

/**
 * How far out of date a request's timestamp may be.
 *
 * Without this, a signed request captured once is replayable forever. Five
 * minutes is the Standard Webhooks recommendation and leaves room for clock
 * skew between GrowthBook and us.
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

export async function POST(request: Request) {
  const secret = process.env.GROWTHBOOK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[flags] GROWTHBOOK_WEBHOOK_SECRET is not set");
    return Response.json({ error: "webhook not configured" }, { status: 500 });
  }

  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signatureHeader = request.headers.get("webhook-signature");

  if (!id || !timestamp || !signatureHeader) {
    return Response.json({ error: "missing signature headers" }, { status: 400 });
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return Response.json({ error: "bad timestamp" }, { status: 400 });
  }
  if (Math.abs(Date.now() / 1000 - sentAt) > TOLERANCE_SECONDS) {
    return Response.json({ error: "timestamp outside tolerance" }, { status: 400 });
  }

  // The raw text, not the parsed JSON: the signature covers the exact bytes
  // sent, and re-serialising a parsed object will not reproduce them.
  const body = await request.text();

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

  if (!provided.some((candidate) => signaturesMatch(candidate, expected))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  // `revalidateTag` with `"max"`, not `updateTag`: this marks the entry stale
  // and lets the next visitor be served the old value while a fresh one is
  // built behind them. Nothing recomputes until a page using the tag is
  // actually visited, so a flag change cannot stampede every instance at once.
  revalidateTag(RULESET_TAG, "max");

  return Response.json({ ok: true, revalidated: RULESET_TAG });
}
