import { indexabilityVerdict } from "./indexability";

const THIN_WORDS = 300;

/**
 * Structural shape of a crawled page. Both the Prisma `Page` row and a
 * `CompetitorPage` row satisfy it, which is what lets one scorer serve both.
 */
export type AuditablePage = {
  status: string;
  url: string;
  finalUrl?: string | null;
  statusCode?: number | null;
  title?: string | null;
  metaDesc?: string | null;
  h1?: string | null;
  h1Count?: number | null;
  h2Count?: number | null;
  canonicalUrl?: string | null;
  wordCount?: number | null;
  imageCount?: number | null;
  missingAlt?: number | null;
  internalLinks?: number | null;
  schemaCount?: number | null;
  robotsTxtUrl?: string | null;
  robotsOk?: boolean | null;
  sitemapUrl?: string | null;
  hasSitemap?: boolean | null;
  xRobotsTag?: string | null;
  indexable?: boolean | null;
  /** Whether the site's own sitemap lists this URL. Null when no sitemap exists. */
  inSitemap?: boolean | null;
  /** Whether robots.txt disallows this path for our crawler. */
  robotsDisallowed?: boolean | null;
  pageType?: string | null;
};

export function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function isCrawled(page: AuditablePage) {
  return page.status === "analyzed" || page.status === "failed";
}

export function isThin(page: AuditablePage) {
  return isCrawled(page) && page.wordCount != null && page.wordCount < THIN_WORDS;
}

export type CheckStatus = "pass" | "warning" | "fail";

export type CheckSeverity = "low" | "medium" | "high" | "critical";

export type CheckId =
  | "status"
  | "title"
  | "meta"
  | "h1"
  | "h2"
  | "canonical"
  | "images"
  | "links"
  | "words"
  | "schema"
  | "indexability"
  | "robots"
  | "sitemap";

export const checks: { id: CheckId; label: string; hint: string }[] = [
  { id: "status", label: "Status code", hint: "Responds with 2xx or 3xx" },
  { id: "title", label: "Title", hint: "Has a title tag" },
  { id: "meta", label: "Meta description", hint: "Has a meta description" },
  { id: "h1", label: "H1", hint: "Has one H1" },
  { id: "h2", label: "H2", hint: "Has at least one H2" },
  { id: "canonical", label: "Canonical", hint: "Declares a canonical URL" },
  { id: "images", label: "Image alt text", hint: "Every image has alt text" },
  { id: "links", label: "Internal links", hint: "Links to other pages on the site" },
  { id: "words", label: "Word count", hint: `At least ${THIN_WORDS} words` },
  { id: "schema", label: "Schema", hint: "Has JSON-LD structured data" },
  { id: "indexability", label: "Indexability", hint: "Not blocked by noindex" },
  { id: "robots", label: "robots.txt", hint: "robots.txt is reachable" },
  { id: "sitemap", label: "Sitemap", hint: "robots.txt lists a sitemap" },
];

export function failsCheck(page: AuditablePage, check: CheckId) {
  if (!isCrawled(page)) {
    return false;
  }
  switch (check) {
    case "status":
      return page.statusCode == null || page.statusCode >= 400;
    case "title":
      return !hasText(page.title);
    case "meta":
      return !hasText(page.metaDesc);
    case "h1":
      return !hasText(page.h1);
    case "h2":
      return (page.h2Count ?? 0) < 1;
    case "canonical":
      return !hasText(page.canonicalUrl);
    case "images":
      return (page.missingAlt ?? 0) > 0;
    case "links":
      return (page.internalLinks ?? 0) < 1;
    case "words":
      return isThin(page);
    case "schema":
      return (page.schemaCount ?? 0) < 1;
    case "indexability":
      // Evidence-aware: a deliberately excluded page is not a failure.
      // See `indexabilityVerdict` for why sitemap membership decides this.
      return indexabilityVerdict(page).status === "fail";
    case "robots":
      return page.robotsOk === false;
    case "sitemap":
      return page.hasSitemap === false;
  }
}

/**
 * Three-state view of a check.
 *
 * `failsCheck` stays boolean so existing callers and the scoring maths are
 * untouched; this adds the warning tier the UI and the issue log need.
 */
export function checkStatus(page: AuditablePage, check: CheckId): CheckStatus {
  if (!isCrawled(page)) {
    return "pass";
  }
  if (check === "indexability") {
    return indexabilityVerdict(page).status;
  }
  if (failsCheck(page, check)) {
    return warningIds.includes(check) ? "warning" : "fail";
  }
  return "pass";
}

export function failedChecks(page: AuditablePage) {
  return checks.filter((check) => failsCheck(page, check.id));
}

function count(value: number, singular: string, plural = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

/**
 * Observed value for a check, for the page detail screen.
 * `value` is the headline, `detail` is an optional second line.
 */
export function checkValue(
  page: AuditablePage,
  check: CheckId,
): { value: string; detail?: string } {
  if (!isCrawled(page)) {
    return { value: "Waiting for crawl" };
  }
  switch (check) {
    case "status":
      return {
        value: page.statusCode == null ? "No response" : `HTTP ${page.statusCode}`,
        detail:
          page.finalUrl && page.finalUrl !== page.url ? `Redirected to ${page.finalUrl}` : undefined,
      };
    case "title":
      return page.title
        ? { value: page.title, detail: `${count(page.title.length, "character")}. Aim for 50 to 60.` }
        : { value: "No title tag" };
    case "meta":
      return page.metaDesc
        ? {
            value: page.metaDesc,
            detail: `${count(page.metaDesc.length, "character")}. Aim for 120 to 160.`,
          }
        : { value: "No meta description" };
    case "h1":
      return page.h1 ? { value: page.h1 } : { value: "No H1 on the page" };
    case "h2":
      return { value: count(page.h2Count ?? 0, "H2 heading") };
    case "canonical":
      return page.canonicalUrl
        ? {
            value: page.canonicalUrl,
            detail:
              page.finalUrl && page.canonicalUrl !== page.finalUrl
                ? "Points to a different URL than the one crawled."
                : undefined,
          }
        : { value: "No canonical link" };
    case "images": {
      const total = page.imageCount ?? 0;
      const missing = page.missingAlt ?? 0;
      if (total === 0) {
        return { value: "No images on the page" };
      }
      return {
        value:
          missing === 0
            ? `All ${count(total, "image")} have alt text`
            : `${missing} of ${total} images have no alt text`,
      };
    }
    case "links":
      return { value: count(page.internalLinks ?? 0, "internal link") };
    case "words":
      return {
        value: count(page.wordCount ?? 0, "word"),
        detail: isThin(page) ? `Under ${THIN_WORDS} words reads as thin content.` : undefined,
      };
    case "schema":
      return { value: count(page.schemaCount ?? 0, "JSON-LD block") };
    case "indexability": {
      const verdict = indexabilityVerdict(page);
      if (page.indexable === false) {
        return {
          value: verdict.intentional ? "Excluded on purpose" : "Blocked from indexing",
          detail: verdict.message,
        };
      }
      return {
        value: verdict.status === "pass" ? "Indexable" : "Indexable but unreachable",
        detail:
          verdict.reason === "indexable"
            ? (page.xRobotsTag ? `X-Robots-Tag: ${page.xRobotsTag}` : undefined)
            : verdict.message,
      };
    }
    case "robots":
      return page.robotsOk
        ? { value: "robots.txt found", detail: page.robotsTxtUrl ?? undefined }
        : { value: "robots.txt not reachable", detail: page.robotsTxtUrl ?? undefined };
    case "sitemap":
      return page.hasSitemap && page.sitemapUrl
        ? { value: page.sitemapUrl }
        : { value: "No sitemap listed in robots.txt" };
  }
}

export function pageSeoScore(page: AuditablePage) {
  if (!isCrawled(page)) {
    return null;
  }
  const failed = failedChecks(page).length;
  return Math.round(((checks.length - failed) / checks.length) * 100);
}

export function siteSeoScore(pages: AuditablePage[]) {
  const scores = pages.map(pageSeoScore).filter((score): score is number => score != null);
  if (scores.length === 0) {
    return null;
  }
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export const technicalCheckIds: CheckId[] = [
  "status",
  "canonical",
  "schema",
  "indexability",
  "robots",
  "sitemap",
];

export const onPageCheckIds: CheckId[] = ["title", "meta", "h1", "h2", "images", "links", "words"];

export function pageCategoryScore(page: AuditablePage, ids: CheckId[]) {
  if (!isCrawled(page) || ids.length === 0) {
    return null;
  }
  const failed = ids.filter((id) => failsCheck(page, id)).length;
  return Math.round(((ids.length - failed) / ids.length) * 100);
}

export function siteCategoryScore(pages: AuditablePage[], ids: CheckId[]) {
  const scores = pages
    .map((page) => pageCategoryScore(page, ids))
    .filter((score): score is number => score != null);
  if (scores.length === 0) {
    return null;
  }
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export type PageHealth = "optimized" | "issues" | "warnings" | "critical" | "pending";

const criticalIds: CheckId[] = ["status", "indexability"];
const warningIds: CheckId[] = ["words", "h2", "images", "links"];

export function pageHealth(page: AuditablePage): PageHealth {
  if (!isCrawled(page)) {
    return "pending";
  }
  if (page.status === "failed" || failsCheck(page, "status")) {
    return "critical";
  }
  const failed = failedChecks(page);
  if (failed.length === 0) {
    return "optimized";
  }
  if (failed.some((check) => criticalIds.includes(check.id))) {
    return "critical";
  }
  if (failed.every((check) => warningIds.includes(check.id))) {
    return "warnings";
  }
  return "issues";
}

export const healthLabels: Record<PageHealth, string> = {
  optimized: "Optimized",
  issues: "Issues",
  warnings: "Warnings",
  critical: "Critical",
  pending: "Pending",
};

export function hasIssue(page: AuditablePage) {
  return page.status === "failed" || failedChecks(page).length > 0;
}

export function pageAuditStats(pages: AuditablePage[]) {
  const crawled = pages.filter(isCrawled);
  const analyzed = pages.filter((page) => page.status === "analyzed");
  const failures = Object.fromEntries(
    checks.map((check) => [check.id, crawled.filter((page) => failsCheck(page, check.id)).length]),
  ) as Record<CheckId, number>;

  return {
    total: pages.length,
    crawled: crawled.length,
    analyzed: analyzed.length,
    pending: pages.filter((page) => page.status === "pending" || page.status === "crawling").length,
    failed: pages.filter((page) => page.status === "failed").length,
    passing: analyzed.filter((page) => !hasIssue(page)).length,
    withIssues: crawled.filter(hasIssue).length,
    failures,
  };
}

export const THIN_WORD_LIMIT = THIN_WORDS;

/**
 * Severity per check.
 *
 * Deterministic and code-owned: architecture §12 and rule 10 are explicit that
 * the LLM must never decide numeric priority. AI explains a severity; it does
 * not choose one.
 */
export const checkSeverity: Record<CheckId, CheckSeverity> = {
  status: "critical",
  indexability: "critical",
  canonical: "high",
  title: "high",
  meta: "high",
  h1: "high",
  robots: "high",
  sitemap: "medium",
  schema: "medium",
  links: "medium",
  words: "medium",
  h2: "low",
  images: "low",
};

/**
 * One persisted finding. Matches the contract PRD §45 specifies so the UI,
 * scoring engine, AI layer and reports all read the same record instead of
 * each re-deriving it.
 */
export type PageIssueRecord = {
  checkId: CheckId;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  evidence: string | null;
  recommendation: string | null;
};

const RECOMMENDATION: Record<CheckId, string> = {
  status: "Return a 2xx response, or remove the URL from internal links and the sitemap.",
  title: "Add a unique title of roughly 50-60 characters describing this page.",
  meta: "Add a meta description of roughly 120-160 characters summarising the page.",
  h1: "Add a single H1 that states what the page is about.",
  h2: "Break the page into sections with H2 headings.",
  canonical: "Declare a self-referencing canonical link unless this page is a deliberate duplicate.",
  images: "Add descriptive alt text to every meaningful image, and empty alt to decorative ones.",
  links: "Link to this page from related pages so it is reachable and passes context.",
  words: `Expand the page past ${THIN_WORDS} words of genuine content, or merge it into a stronger page.`,
  schema: "Add JSON-LD structured data matching what the page represents.",
  indexability: "Make the sitemap and the page's robots directives agree on whether this URL should be indexed.",
  robots: "Serve a reachable robots.txt at the site root.",
  sitemap: "Publish a sitemap and declare it in robots.txt.",
};

/**
 * Projects a crawled page into the issue records to persist.
 *
 * Deliberately derived from the same `checkStatus`/`checkValue` functions the
 * UI uses (Phase 0.4: do not rewrite deterministic scoring) — persisting is
 * the only change, so a stored issue can never disagree with a rendered one.
 */
export function toPageIssues(page: AuditablePage): PageIssueRecord[] {
  if (!isCrawled(page)) {
    return [];
  }

  const records: PageIssueRecord[] = [];
  for (const check of checks) {
    const status = checkStatus(page, check.id);
    if (status === "pass") {
      continue;
    }
    const observed = checkValue(page, check.id);
    records.push({
      checkId: check.id,
      status,
      severity: status === "warning" ? downgrade(checkSeverity[check.id]) : checkSeverity[check.id],
      message: check.id === "indexability" ? indexabilityVerdict(page).message : check.hint,
      evidence: observed.detail ? `${observed.value} — ${observed.detail}` : observed.value,
      recommendation: RECOMMENDATION[check.id] ?? null,
    });
  }
  return records;
}

function downgrade(severity: CheckSeverity): CheckSeverity {
  switch (severity) {
    case "critical":
      return "high";
    case "high":
      return "medium";
    default:
      return "low";
  }
}
