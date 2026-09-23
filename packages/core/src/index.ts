export * from "./scoring/index";
export * from "./competitors/index";
export * from "./queue/index";
export * from "./crawl/index";
export * from "./robots/index";
export * from "./sitemap/index";
export * from "./page/index";
export * from "./geo/index";

/**
 * `hostKey` exists in both `competitors/domain` and `crawl/url`, which makes
 * this barrel ambiguous (TS2308). The competitors version is the stricter of
 * the two — it trims and strips a trailing dot as well as `www.` — so it wins
 * here. Both are left in place: consumers import them through their own
 * subpaths, and collapsing them into one is a refactor that would change
 * competitor domain handling, not a re-export fix.
 */
export { hostKey } from "./competitors/index";
