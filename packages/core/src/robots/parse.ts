/**
 * robots.txt parsing and analysis.
 *
 * The previous first-party crawler only regexed out the `Sitemap:` line, so it
 * neither obeyed `Disallow` nor had anything to report about the file. This
 * module parses the whole thing: user-agent groups, Allow/Disallow with `*`
 * and `$` wildcards, Crawl-delay, every Sitemap declaration, and the syntax
 * problems worth surfacing to the user.
 */

export type RobotsGroup = {
  /** Lower-cased user-agent tokens this group applies to. */
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
};

export type RobotsWarning = {
  line: number;
  text: string;
  message: string;
};

export type ParsedRobots = {
  groups: RobotsGroup[];
  sitemaps: string[];
  warnings: RobotsWarning[];
  /** Directives found before any `User-agent` line, which are ignored. */
  orphanDirectives: number;
};

const KNOWN_FIELDS = new Set([
  "user-agent",
  "allow",
  "disallow",
  "sitemap",
  "crawl-delay",
  "host",
  "noindex",
  "clean-param",
  "request-rate",
  "visit-time",
]);

/** Our crawler identifies as this; used to select the matching robots group. */
export const CRAWLER_TOKEN = "seo-maker-bot";

export function parseRobotsTxt(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const warnings: RobotsWarning[] = [];
  let orphanDirectives = 0;

  let current: RobotsGroup | null = null;
  // Consecutive `User-agent` lines share one group of rules.
  let acceptingAgents = false;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      warnings.push({
        line: index + 1,
        text: line.slice(0, 120),
        message: "Line has no `field: value` separator and is ignored.",
      });
      continue;
    }

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (!KNOWN_FIELDS.has(field)) {
      warnings.push({
        line: index + 1,
        text: line.slice(0, 120),
        message: `Unknown directive \`${field}\`.`,
      });
      continue;
    }

    if (field === "sitemap") {
      if (!value) {
        warnings.push({
          line: index + 1,
          text: line.slice(0, 120),
          message: "Sitemap directive has no URL.",
        });
        continue;
      }
      sitemaps.push(value);
      continue;
    }

    if (field === "user-agent") {
      if (!value) {
        warnings.push({
          line: index + 1,
          text: line.slice(0, 120),
          message: "User-agent directive has no value.",
        });
        continue;
      }
      if (current && acceptingAgents) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], allow: [], disallow: [], crawlDelay: null };
        groups.push(current);
        acceptingAgents = true;
      }
      continue;
    }

    // Any non-agent directive closes the agent list for the current group.
    acceptingAgents = false;

    if (!current) {
      orphanDirectives += 1;
      warnings.push({
        line: index + 1,
        text: line.slice(0, 120),
        message: "Directive appears before any `User-agent` line and is ignored.",
      });
      continue;
    }

    if (field === "disallow") {
      // An empty Disallow means "allow everything" and carries no path.
      if (value) {
        current.disallow.push(value);
      }
      continue;
    }
    if (field === "allow") {
      if (value) {
        current.allow.push(value);
      }
      continue;
    }
    if (field === "crawl-delay") {
      const delay = Number(value);
      if (Number.isFinite(delay) && delay >= 0) {
        current.crawlDelay = delay;
      } else {
        warnings.push({
          line: index + 1,
          text: line.slice(0, 120),
          message: "Crawl-delay is not a number.",
        });
      }
    }
  }

  return { groups, sitemaps, warnings, orphanDirectives };
}

/**
 * Selects the group that applies to `token`, falling back to `*`.
 *
 * Matches the search-engine rule: the most specific matching user-agent wins,
 * and only that one group applies.
 */
export function groupFor(parsed: ParsedRobots, token = CRAWLER_TOKEN): RobotsGroup | null {
  let wildcard: RobotsGroup | null = null;
  let specific: RobotsGroup | null = null;
  let specificLength = -1;

  for (const group of parsed.groups) {
    for (const agent of group.agents) {
      if (agent === "*") {
        wildcard ??= group;
        continue;
      }
      if (token.includes(agent) && agent.length > specificLength) {
        specific = group;
        specificLength = agent.length;
      }
    }
  }

  return specific ?? wildcard;
}

function ruleToRegExp(rule: string): RegExp {
  const pattern = rule
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$$/, "$");
  return new RegExp(`^${pattern}`);
}

/** Longest matching rule wins; `Allow` beats `Disallow` on an equal-length tie. */
function matchLength(pathname: string, rules: string[]): number {
  let best = -1;
  for (const rule of rules) {
    if (!rule) {
      continue;
    }
    const matched = rule.includes("*") || rule.endsWith("$")
      ? ruleToRegExp(rule).test(pathname)
      : pathname.startsWith(rule);
    if (matched && rule.length > best) {
      best = rule.length;
    }
  }
  return best;
}

export function isPathDisallowed(pathname: string, group: RobotsGroup | null): boolean {
  if (!group) {
    return false;
  }
  const disallow = matchLength(pathname, group.disallow);
  if (disallow === -1) {
    return false;
  }
  const allow = matchLength(pathname, group.allow);
  return allow < disallow;
}

/**
 * Back-compat helper for callers that only hold a flat disallow list.
 * Prefer `isPathDisallowed` with a parsed group.
 */
export function isDisallowed(pathname: string, disallow: string[]): boolean {
  return isPathDisallowed(pathname, { agents: ["*"], allow: [], disallow, crawlDelay: null });
}
