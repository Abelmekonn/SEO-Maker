import { NextResponse } from "next/server";
import { inferSearchIntent, type PageType } from "@seo-maker/core/page";
import { Prisma, prisma } from "@seo-maker/db";
import { getPageForUser, requireUserId } from "@/lib/projects";
import { pagePath } from "@/lib/site-url";

/** Types a user may assign. Mirrors PageType in @seo-maker/core/page. */
const PAGE_TYPES: readonly PageType[] = [
  "homepage",
  "service",
  "product",
  "pricing",
  "category",
  "article",
  "documentation",
  "about",
  "contact",
  "legal",
  "landing",
  "utility",
  "other",
];

/**
 * Sets a page's type when the crawler could not classify it (Phase 2.4).
 *
 * The user's word is evidence the crawl cannot collect, so it is stored with
 * full confidence. That unblocks AI fixes that need a known type, such as
 * structured data. It is also kept on the project by URL path, so the next
 * crawl applies it instead of classifying the page from scratch again.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to edit pages." }, { status: 401 });
  }
  const { id, pageId } = await params;
  const page = await getPageForUser(id, pageId, userId);
  if (!page) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { pageType?: unknown } | null;
  const pageType = typeof body?.pageType === "string" ? (body.pageType as PageType) : null;
  if (!pageType || !PAGE_TYPES.includes(pageType)) {
    return NextResponse.json({ error: "Choose one of the listed page types." }, { status: 400 });
  }

  const intent = inferSearchIntent({ pageType, title: page.title, h1: page.h1 });
  const path = pagePath(page.finalUrl ?? page.url);
  const overrides = {
    ...((page.project.pageTypeOverrides as Record<string, string> | null) ?? {}),
    [path]: pageType,
  };

  await prisma.$transaction([
    prisma.page.update({
      where: { id: page.id },
      data: {
        pageType,
        pageTypeScore: 1,
        searchIntent: intent.intent,
        searchIntentScore: intent.intent ? intent.confidence : null,
      },
    }),
    prisma.project.update({
      where: { id: page.project.id },
      data: { pageTypeOverrides: overrides as Prisma.InputJsonValue },
    }),
  ]);

  return NextResponse.json({ ok: true, pageType, searchIntent: intent.intent });
}
