import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@seo-maker/ai", "@seo-maker/db", "@seo-maker/core"],

  /**
   * Keep production builds out of the dev server's directory.
   *
   * `next build` and `next dev` write incompatible trees into `.next`. Running
   * a verification build while a dev server owns that folder leaves the dev
   * server reading production artifacts, which surfaces as font modules that
   * will not resolve and as ENOENT on `.next/static/development/*.tmp` —
   * because `static/development` is never created.
   *
   * Setting NEXT_DIST_DIR (as `pnpm verify:build` does) sends a build to its
   * own folder, so the two can coexist.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
