import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/projects";
import { listSites, parseSiteQuery } from "@/lib/sites";

/**
 * The user's sites, searched, filtered, sorted and paginated.
 *
 *   ?q=         name or address contains
 *   ?field=     added | crawled         which date from/to filter
 *   ?from= ?to= YYYY-MM-DD, inclusive
 *   ?sort=      recent | added | name | score | crawled
 *   ?dir=       asc | desc
 *   ?page= ?pageSize=   1-based; at most 50 per page
 */
export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your sites." }, { status: 401 });
  }
  const query = parseSiteQuery(new URL(request.url).searchParams);
  return NextResponse.json(await listSites(userId, query));
}
