import type { PlanId } from "@/lib/plan";
import { findHomepage } from "@/lib/site-url";

export type PerfPage = {
  id: string;
  url: string;
  finalUrl?: string | null;
  status: string;
};

export type PerfTarget = {
  pageId: string;
  url: string;
};

const AGENCY_DEFAULT = 8;

export function readPerfPageIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function defaultPerfPageIds(pages: PerfPage[], rootUrl: string, plan: PlanId): string[] {
  const homepage = findHomepage(pages, rootUrl);
  if (!homepage) {
    return [];
  }
  if (plan !== "agency") {
    return [homepage.id];
  }

  const rest = pages
    .filter(
      (page) =>
        page.id !== homepage.id && (page.status === "analyzed" || page.status === "failed"),
    )
    .map((page) => ({
      id: page.id,
      depth: pathDepth(page.finalUrl ?? page.url),
    }))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

  return [homepage.id, ...rest.slice(0, AGENCY_DEFAULT - 1).map((page) => page.id)];
}

export function resolvePerfTargets({
  plan,
  maxPages,
  pages,
  rootUrl,
  requestedIds,
}: {
  plan: PlanId;
  maxPages: number;
  pages: PerfPage[];
  rootUrl: string;
  requestedIds?: string[];
}): { targets: PerfTarget[] } | { error: string } {
  const homepage = findHomepage(pages, rootUrl);
  const byId = new Map(pages.map((page) => [page.id, page]));

  let ids: string[];
  if (plan === "free") {
    ids = homepage ? [homepage.id] : [];
  } else if (requestedIds && requestedIds.length > 0) {
    ids = [...new Set(requestedIds)];
  } else {
    ids = defaultPerfPageIds(pages, rootUrl, plan);
  }

  if (ids.length === 0) {
    return { error: homepage ? "Select at least one page." : "No homepage to test." };
  }

  if (ids.length > maxPages) {
    return {
      error:
        plan === "free"
          ? "Free includes PageSpeed on the homepage."
          : `${plan === "pro" ? "Pro" : "Agency"} includes PageSpeed on ${maxPages} pages.`,
    };
  }

  const targets: PerfTarget[] = [];
  for (const id of ids) {
    const page = byId.get(id);
    if (!page) {
      return { error: "One of those pages is not in this project." };
    }
    targets.push({ pageId: page.id, url: page.finalUrl ?? page.url });
  }

  return { targets };
}

function pathDepth(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 99;
  }
}
