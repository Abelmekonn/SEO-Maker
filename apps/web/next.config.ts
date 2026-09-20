import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@seo-maker/db", "@seo-maker/core"],
};

export default nextConfig;
