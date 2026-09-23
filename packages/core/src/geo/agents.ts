/**
 * The crawlers an AI-search readiness check cares about.
 *
 * `purpose` is what keeps this honest. Blocking a TRAINING crawler is a
 * deliberate, legitimate business decision — plenty of publishers do it on
 * purpose — so it must never count against a readiness score. Only the crawlers
 * that feed retrieval and answer-time fetching affect whether a site can turn
 * up in an AI answer, and only those are scored.
 *
 * The rest are still shown, because "GPTBot is blocked" is a fact the owner
 * should see. It is reported, not penalised.
 */

export type AiCrawlerPurpose = "search" | "training" | "user-fetch" | "general";

export type AiCrawlerAgent = {
  /** Lower-cased user-agent token, matched against robots.txt groups. */
  token: string;
  label: string;
  operator: string;
  purpose: AiCrawlerPurpose;
  /**
   * True when this crawler's access affects Google's AI surfaces, which are
   * built on the same index as Search. Only these agents are affected by a
   * `noindex`; a `noindex` does not stop an OpenAI fetcher from reading a page.
   */
  affectsGoogleAiSurfaces: boolean;
  /** One line explaining what blocking it actually costs. */
  note: string;
};

export const AI_CRAWLER_AGENTS: AiCrawlerAgent[] = [
  {
    token: "oai-searchbot",
    label: "OAI-SearchBot",
    operator: "OpenAI",
    purpose: "search",
    affectsGoogleAiSurfaces: false,
    note: "Builds the index behind ChatGPT search results.",
  },
  {
    token: "chatgpt-user",
    label: "ChatGPT-User",
    operator: "OpenAI",
    purpose: "user-fetch",
    affectsGoogleAiSurfaces: false,
    note: "Fetches a page when someone asks ChatGPT to open a link.",
  },
  {
    token: "gptbot",
    label: "GPTBot",
    operator: "OpenAI",
    purpose: "training",
    affectsGoogleAiSurfaces: false,
    note: "Collects data for model training. Blocking it is a common, deliberate choice.",
  },
  {
    token: "perplexitybot",
    label: "PerplexityBot",
    operator: "Perplexity",
    purpose: "search",
    affectsGoogleAiSurfaces: false,
    note: "Builds Perplexity's search index.",
  },
  {
    token: "perplexity-user",
    label: "Perplexity-User",
    operator: "Perplexity",
    purpose: "user-fetch",
    affectsGoogleAiSurfaces: false,
    note: "Fetches a page in response to a user request.",
  },
  {
    token: "googlebot",
    label: "Googlebot",
    operator: "Google",
    purpose: "search",
    affectsGoogleAiSurfaces: true,
    note: "Google's AI features are served from the same index as Search.",
  },
  {
    token: "google-extended",
    label: "Google-Extended",
    operator: "Google",
    purpose: "training",
    affectsGoogleAiSurfaces: false,
    note: "Controls Gemini training use. It does not affect Search or AI Overviews.",
  },
  {
    token: "bingbot",
    label: "Bingbot",
    operator: "Microsoft",
    purpose: "search",
    affectsGoogleAiSurfaces: false,
    note: "Copilot is grounded in Bing's index.",
  },
  {
    token: "claudebot",
    label: "ClaudeBot",
    operator: "Anthropic",
    purpose: "training",
    affectsGoogleAiSurfaces: false,
    note: "Collects data for model training.",
  },
  {
    token: "applebot-extended",
    label: "Applebot-Extended",
    operator: "Apple",
    purpose: "training",
    affectsGoogleAiSurfaces: false,
    note: "Controls Apple Intelligence training use.",
  },
  {
    token: "ccbot",
    label: "CCBot",
    operator: "Common Crawl",
    purpose: "training",
    affectsGoogleAiSurfaces: false,
    note: "Feeds a public dataset many models are trained on.",
  },
];

/** Agents whose access genuinely bears on whether a site can appear in an AI answer. */
export const DISCOVERY_PURPOSES: AiCrawlerPurpose[] = ["search", "user-fetch"];

export function isDiscoveryAgent(agent: AiCrawlerAgent): boolean {
  return DISCOVERY_PURPOSES.includes(agent.purpose);
}

export function agentByToken(token: string): AiCrawlerAgent | undefined {
  return AI_CRAWLER_AGENTS.find((agent) => agent.token === token.toLowerCase());
}
