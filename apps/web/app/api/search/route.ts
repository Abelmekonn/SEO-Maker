import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/projects";
import { searchWorkspace } from "@/lib/search";

/**
 * Dashboard search across the user's sites, their pages (latest crawl) and
 * the product's screens.
 *
 *   ?q=          at least 2 characters
 *   ?project=    the site open now, to include its screens
 *   ?offset=     more pages: sites and screens only come with the first page
 */
export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to search." }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const result = await searchWorkspace(userId, {
    q: params.get("q") ?? "",
    projectId: params.get("project"),
    offset: Number(params.get("offset")) || 0,
    limit: Number(params.get("limit")) || undefined,
  });
  return NextResponse.json(result);
}
