import type { RobotsOutcome, RobotsProblem, RobotsRedirect } from "./fetch";
import { type ParsedRobots, type RobotsGroup, groupFor, isPathDisallowed } from "./parse";

/**
 * The reportable view of robots.txt.
 *
 * `robotsOk` used to mean only "the file returned HTTP 200", which told the
 * user nothing. This carries the directive analysis PRD §13 asks for.
 */
export type RobotsAudit = {
  url: string;
  /** File was reachable and parseable. */
  found: boolean;
  status: number | null;
  /** No syntax warnings and at least one usable group. */
  valid: boolean;
  sitemaps: string[];
  hasSitemapDirective: boolean;
  groupCount: number;
  /** Rules that apply to our crawler, after user-agent selection. */
  appliedAgent: string | null;
  disallowCount: number;
  allowCount: number;
  crawlDelay: number | null;
  warnings: Array<{ line: number; text: string; message: string }>;
  /** Sitemap-listed URLs that robots.txt blocks — a real self-contradiction. */
  blockedSitemapUrls: string[];
  /** True when the whole site is closed to our crawler. */
  blocksEverything: boolean;

  // How the file was fetched. Optional: audits stored before these existed lack them.
  /** Where the file actually came from, after redirects. */
  finalUrl?: string | null;
  redirects?: RobotsRedirect[];
  /** ok | unavailable (no rules apply) | unreachable (RFC 9309: treat all as disallowed). */
  outcome?: RobotsOutcome;
  problem?: RobotsProblem | null;
  truncated?: boolean;
  /** What went wrong, in words. */
  error?: string | null;
};

export type RobotsAuditInput = {
  url: string;
  status: number | null;
  parsed: ParsedRobots | null;
  group: RobotsGroup | null;
  /** Normalized URLs read from the sitemap, checked against the rules. */
  sitemapUrls?: string[];
  /** The fetch that produced `parsed`, from fetchRobotsTxt. */
  fetch?: {
    finalUrl: string | null;
    redirects: RobotsRedirect[];
    outcome: RobotsOutcome;
    problem: RobotsProblem | null;
    truncated: boolean;
    error: string | null;
  };
};

export function buildRobotsAudit(input: RobotsAuditInput): RobotsAudit {
  const { url, status, parsed, group } = input;
  const fetched = input.fetch
    ? {
        finalUrl: input.fetch.finalUrl,
        redirects: input.fetch.redirects,
        outcome: input.fetch.outcome,
        problem: input.fetch.problem,
        truncated: input.fetch.truncated,
        error: input.fetch.error,
      }
    : {};

  if (!parsed) {
    return {
      ...fetched,
      url,
      found: false,
      status,
      valid: false,
      sitemaps: [],
      hasSitemapDirective: false,
      groupCount: 0,
      appliedAgent: null,
      disallowCount: 0,
      allowCount: 0,
      crawlDelay: null,
      warnings: [],
      blockedSitemapUrls: [],
      blocksEverything: false,
    };
  }

  const blockedSitemapUrls: string[] = [];
  for (const raw of input.sitemapUrls ?? []) {
    try {
      if (isPathDisallowed(new URL(raw).pathname, group)) {
        blockedSitemapUrls.push(raw);
      }
    } catch {
      // Not a URL we can check; the sitemap audit reports it separately.
    }
  }

  return {
    ...fetched,
    url,
    found: true,
    status,
    valid: parsed.warnings.length === 0 && parsed.groups.length > 0,
    sitemaps: parsed.sitemaps,
    hasSitemapDirective: parsed.sitemaps.length > 0,
    groupCount: parsed.groups.length,
    appliedAgent: group?.agents.join(", ") ?? null,
    disallowCount: group?.disallow.length ?? 0,
    allowCount: group?.allow.length ?? 0,
    crawlDelay: group?.crawlDelay ?? null,
    warnings: parsed.warnings.slice(0, 25),
    blockedSitemapUrls: blockedSitemapUrls.slice(0, 25),
    blocksEverything: isPathDisallowed("/", group),
  };
}

export { groupFor };
