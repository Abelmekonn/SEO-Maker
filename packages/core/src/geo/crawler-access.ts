/**
 * AI crawler accessibility — fully deterministic, no model involved.
 *
 * Two rules keep this honest, and both are load-bearing:
 *
 *  1. We never request the site as another user-agent. Impersonating
 *     OAI-SearchBot would be dishonest and the result would not be reliable
 *     anyway. So `live-agent-fetch` is permanently NOT_TESTED, and every screen
 *     that shows this dimension says what we did and did not observe.
 *
 *  2. `unknown` and `not_tested` are not failures. They become a null
 *     measurement, which `redistribute` drops while spreading its weight over
 *     the checks that did produce an answer. A robots.txt we could not read
 *     must never look like a robots.txt that blocks us.
 */

import { type RobotsGroup, groupFor, isPathDisallowed, parseRobotsTxt } from "../robots/parse";
import { redistribute } from "../scoring/weights";
import { AI_CRAWLER_AGENTS, type AiCrawlerAgent, isDiscoveryAgent } from "./agents";
import { type GeoCheckStatus, statusValue } from "./types";

export const GEO_ACCESS_CHECKS = [
  "robots-root",
  "robots-key-pages",
  "http-status",
  "auth-wall",
  "noindex",
  "bot-challenge",
  "live-agent-fetch",
] as const;

export type GeoAccessCheck = (typeof GEO_ACCESS_CHECKS)[number];

export const GEO_ACCESS_CHECK_LABELS: Record<GeoAccessCheck, string> = {
  "robots-root": "robots.txt allows the site root",
  "robots-key-pages": "robots.txt allows the analysed pages",
  "http-status": "Analysed pages return a success status",
  "auth-wall": "No page is behind a login or empty wall",
  noindex: "No analysed page is set to noindex",
  "bot-challenge": "No bot challenge was observed",
  "live-agent-fetch": "Fetched as this agent",
};

/** Only these five carry weight. See the notes on the other two below. */
export const ACCESS_WEIGHTS = {
  "robots-root": 30,
  "robots-key-pages": 20,
  "http-status": 20,
  "auth-wall": 15,
  noindex: 15,
} as const;

export type AccessCell = {
  status: GeoCheckStatus;
  /** What was observed, rendered verbatim next to the cell. */
  detail: string;
};

export type AgentRow = {
  agent: AiCrawlerAgent;
  /** Whether this row's result feeds the score. Training crawlers do not. */
  scored: boolean;
  checks: Record<GeoAccessCheck, AccessCell>;
};

export type AccessPage = {
  id: string;
  url: string;
  statusCode: number | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
  indexable: boolean | null;
  errorType: string | null;
  contentType: string | null;
  wordCount: number | null;
};

export type CrawlerAccessInput = {
  /** Raw robots.txt, or null when it could not be read. */
  robotsTxt: string | null;
  /** HTTP status of the robots.txt fetch. 404 means "no rules", which permits. */
  robotsStatus: number | null;
  pages: AccessPage[];
};

export type CrawlerAccessResult = {
  matrix: AgentRow[];
  /** The aggregate verdict per check, across the agents that are scored. */
  signals: Record<GeoAccessCheck, GeoCheckStatus>;
  raw: number | null;
  notMeasured: GeoAccessCheck[];
};

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

function robotsCells(
  group: RobotsGroup | null,
  robotsReadable: boolean,
  robotsAbsent: boolean,
  pages: AccessPage[],
): { root: AccessCell; keyPages: AccessCell } {
  if (robotsAbsent) {
    const detail = "robots.txt returned 404, so nothing is disallowed.";
    return {
      root: { status: "pass", detail },
      keyPages: { status: "pass", detail },
    };
  }

  if (!robotsReadable) {
    const detail = "robots.txt could not be read, so its rules are unknown.";
    return {
      root: { status: "unknown", detail },
      keyPages: { status: "unknown", detail },
    };
  }

  const rootBlocked = isPathDisallowed("/", group);
  const blocked = pages.filter((page) => isPathDisallowed(pathOf(page.url), group));

  return {
    root: rootBlocked
      ? { status: "fail", detail: "robots.txt disallows the site root for this agent." }
      : { status: "pass", detail: "robots.txt allows the site root for this agent." },
    keyPages:
      blocked.length > 0
        ? {
            status: "fail",
            detail: `robots.txt disallows ${blocked.length} of the ${pages.length} analysed pages, including ${blocked[0]!.url}.`,
          }
        : {
            status: "pass",
            detail: `robots.txt allows all ${pages.length} analysed pages.`,
          },
  };
}

function httpStatusCell(pages: AccessPage[]): AccessCell {
  if (pages.length === 0) {
    return { status: "unknown", detail: "No pages were analysed in this crawl." };
  }
  const unfetched = pages.filter((page) => page.statusCode == null);
  const bad = pages.filter((page) => page.statusCode != null && page.statusCode >= 400);

  if (bad.length > 0) {
    return {
      status: "fail",
      detail: `${bad.length} analysed page(s) returned an error, including ${bad[0]!.url} (HTTP ${bad[0]!.statusCode}).`,
    };
  }
  if (unfetched.length > 0) {
    return {
      status: "unknown",
      detail: `${unfetched.length} analysed page(s) were never fetched, so their status is unknown.`,
    };
  }
  return { status: "pass", detail: `All ${pages.length} analysed pages returned a success status.` };
}

function authWallCell(pages: AccessPage[]): AccessCell {
  const locked = pages.filter((page) => page.statusCode === 401 || page.statusCode === 403);
  if (locked.length > 0) {
    return {
      status: "fail",
      detail: `${locked.length} page(s) returned HTTP ${locked[0]!.statusCode}, including ${locked[0]!.url}.`,
    };
  }
  // A 200 with no text is the shape of a page whose content never arrives to a
  // crawler, whatever the cause. Reported as observed, with no claim about why.
  const empty = pages.filter(
    (page) => page.statusCode === 200 && (page.wordCount ?? 0) === 0,
  );
  if (empty.length > 0) {
    return {
      status: "fail",
      detail: `${empty.length} page(s) returned HTTP 200 with no readable text, including ${empty[0]!.url}.`,
    };
  }
  if (pages.length === 0) {
    return { status: "unknown", detail: "No pages were analysed in this crawl." };
  }
  return { status: "pass", detail: "No login wall or empty response was observed." };
}

function noindexCell(pages: AccessPage[], applies: boolean): AccessCell {
  if (!applies) {
    return {
      status: "not_tested",
      detail:
        "A noindex removes eligibility for Google's AI features but does not stop this crawler, so it is not counted here.",
    };
  }
  if (pages.length === 0) {
    return { status: "unknown", detail: "No pages were analysed in this crawl." };
  }
  if (pages.every((page) => page.indexable == null)) {
    return { status: "unknown", detail: "Indexability was not recorded for the analysed pages." };
  }
  const noindexed = pages.filter((page) => page.indexable === false);
  if (noindexed.length > 0) {
    return {
      status: "fail",
      detail: `${noindexed.length} analysed page(s) are set to noindex, including ${noindexed[0]!.url}.`,
    };
  }
  return { status: "pass", detail: "No analysed page is set to noindex." };
}

function botChallengeCell(pages: AccessPage[]): AccessCell {
  const challenged = pages.filter(
    (page) =>
      page.statusCode === 429 ||
      page.statusCode === 403 ||
      (page.contentType != null && !page.contentType.includes("html") && page.statusCode === 200),
  );
  if (challenged.length > 0) {
    return {
      status: "unknown",
      detail: `Our crawler saw a response consistent with bot protection on ${challenged.length} page(s), including ${challenged[0]!.url}. What another crawler receives is unknown.`,
    };
  }
  return {
    status: "unknown",
    detail: "We cannot tell from our own crawl whether bot protection would challenge another agent.",
  };
}

export function buildAiCrawlerMatrix(input: CrawlerAccessInput): CrawlerAccessResult {
  const parsed = input.robotsTxt ? parseRobotsTxt(input.robotsTxt) : null;
  const robotsAbsent = input.robotsStatus === 404;
  const robotsReadable = parsed != null;

  const httpStatus = httpStatusCell(input.pages);
  const authWall = authWallCell(input.pages);
  const botChallenge = botChallengeCell(input.pages);

  const matrix: AgentRow[] = AI_CRAWLER_AGENTS.map((agent) => {
    const group = parsed ? groupFor(parsed, agent.token) : null;
    const robots = robotsCells(group, robotsReadable, robotsAbsent, input.pages);

    return {
      agent,
      scored: isDiscoveryAgent(agent),
      checks: {
        "robots-root": robots.root,
        "robots-key-pages": robots.keyPages,
        "http-status": httpStatus,
        "auth-wall": authWall,
        noindex: noindexCell(input.pages, agent.affectsGoogleAiSurfaces),
        "bot-challenge": botChallenge,
        // Never anything else. We do not impersonate other crawlers, so we
        // cannot report what they receive.
        "live-agent-fetch": {
          status: "not_tested",
          detail: `We did not request this site as ${agent.label}.`,
        },
      },
    };
  });

  const scoredRows = matrix.filter((row) => row.scored);

  /**
   * The aggregate for a check is the worst result across the scored agents:
   * one blocked discovery crawler is a real finding even if the others are fine.
   * `unknown` only wins when nothing failed and nothing passed.
   */
  function aggregate(check: GeoAccessCheck): GeoCheckStatus {
    const statuses = scoredRows.map((row) => row.checks[check].status);
    if (statuses.includes("fail")) return "fail";
    if (statuses.includes("pass")) return "pass";
    if (statuses.includes("unknown")) return "unknown";
    return "not_tested";
  }

  const signals = Object.fromEntries(
    GEO_ACCESS_CHECKS.map((check) => [check, aggregate(check)]),
  ) as Record<GeoAccessCheck, GeoCheckStatus>;

  const measured = Object.fromEntries(
    (Object.keys(ACCESS_WEIGHTS) as Array<keyof typeof ACCESS_WEIGHTS>).map((check) => [
      check,
      statusValue(signals[check]),
    ]),
  ) as Record<keyof typeof ACCESS_WEIGHTS, number | null>;

  const result = redistribute(ACCESS_WEIGHTS, measured);

  return {
    matrix,
    signals,
    raw: result.score == null ? null : result.score / 100,
    notMeasured: result.notMeasured as GeoAccessCheck[],
  };
}
