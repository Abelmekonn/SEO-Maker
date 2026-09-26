import { NextResponse } from "next/server";
import { quickInspect } from "@seo-maker/core/quick";
import { requireUserId } from "@/lib/projects";
import { checkRateLimits } from "@/lib/rate-limit";

/**
 * Quick Search: a lightweight inspection of one URL, on every plan.
 *
 * Reads the start of the page (never the whole thing), checks robots.txt for
 * its path, and runs deterministic checks. Nothing is stored and no AI runs.
 * Rate-limited per user because it fetches addresses the user chooses.
 */

export const maxDuration = 30;

function normalize(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(href);
    if (!url.hostname.includes(".")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to use Quick Search." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? normalize(body.url) : null;
  if (!url) {
    return NextResponse.json({ error: "Enter a full page address, like example.com/pricing." }, { status: 400 });
  }

  const limited = await checkRateLimits([
    { key: `quick:${userId}:minute`, max: 10, windowSeconds: 60 },
    { key: `quick:${userId}:day`, max: 200, windowSeconds: 24 * 60 * 60 },
  ]);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `That is a lot of searches in a short time. Try again in ${limited.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "retry-after": String(limited.retryAfterSeconds) } },
    );
  }

  const result = await quickInspect(url);
  return NextResponse.json(result);
}
