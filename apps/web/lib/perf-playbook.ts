import type { Opportunity } from "@/lib/performance";

export type FixEffort = "Low" | "Medium" | "High";

export type Playbook = {
  why: string;
  fix: string;
  effort: FixEffort;
};

const playbooks: Record<string, Playbook> = {
  "unused-javascript": {
    why: "The browser downloads and parses script that does not run on first load. That delays interactivity.",
    fix: "Split large bundles, defer non-critical scripts, and use dynamic imports for below-the-fold features.",
    effort: "Medium",
  },
  "modern-image-formats": {
    why: "A large image in an older format is often the LCP element on mobile.",
    fix: "Convert the hero and other large images to WebP or AVIF, and keep a fallback for older browsers.",
    effort: "Low",
  },
  "uses-responsive-images": {
    why: "Images larger than their display size waste bandwidth and slow LCP.",
    fix: "Resize images to the size they actually render, and add srcset for common breakpoints.",
    effort: "Low",
  },
  "offscreen-images": {
    why: "Images below the fold compete with the first paint.",
    fix: "Lazy-load below-the-fold images. Do not lazy-load the LCP image.",
    effort: "Low",
  },
  "render-blocking-resources": {
    why: "CSS or scripts in the head block the first paint until they finish.",
    fix: "Inline critical CSS, defer non-critical CSS, and move non-essential scripts to the end of the body.",
    effort: "Medium",
  },
  "unused-css-rules": {
    why: "Unused CSS still has to download and parse before the page can paint.",
    fix: "Remove unused rules, split CSS by route, and load page-specific styles only where needed.",
    effort: "Medium",
  },
  "server-response-time": {
    why: "A slow first byte delays every other metric, including LCP.",
    fix: "Cache the HTML, move work off the request path, and use a closer origin or CDN.",
    effort: "Medium",
  },
  "prioritize-lcp-image": {
    why: "The largest image is discovered late, so it starts downloading too late.",
    fix: "Preload the LCP image only if it is the main above-the-fold image, and give it fetchpriority=high.",
    effort: "Low",
  },
  "lcp-lazy-loaded": {
    why: "Lazy-loading the hero image delays the most important paint.",
    fix: "Remove loading=lazy from the LCP image so the browser fetches it immediately.",
    effort: "Low",
  },
  "total-byte-weight": {
    why: "A heavy page takes longer to download on a phone network.",
    fix: "Compress assets, remove unused libraries, and keep the first load under a few hundred kilobytes where you can.",
    effort: "High",
  },
  "dom-size": {
    why: "A large DOM makes style and layout work more expensive.",
    fix: "Simplify the template, paginate long lists, and avoid nesting wrappers that do not help the layout.",
    effort: "High",
  },
  "bootup-time": {
    why: "JavaScript execution on the main thread delays taps and input.",
    fix: "Cut unused dependencies and break long tasks into smaller chunks.",
    effort: "Medium",
  },
  "uses-long-cache-ttl": {
    why: "Repeat visits re-download files that could have been cached.",
    fix: "Set a long cache policy on hashed static assets.",
    effort: "Low",
  },
  "font-display": {
    why: "Web fonts can hide text until they load.",
    fix: "Use font-display: swap and subset the font files.",
    effort: "Low",
  },
};

const fallback: Playbook = {
  why: "This finding adds work before the page is useful on a phone.",
  fix: "Follow the Lighthouse note, then re-run Lighthouse to confirm the saving.",
  effort: "Medium",
};

export function playbookFor(id: string): Playbook {
  return playbooks[id] ?? fallback;
}

export function summarizePerformance(score: number | null, top: Opportunity | null, path: string) {
  if (score == null) {
    return "Run Lighthouse to see how fast this site is, and which pages to fix first.";
  }
  if (!top) {
    return `The ${path} score is ${score}. Lighthouse did not flag a high-impact saving on this run.`;
  }
  if (score >= 90) {
    return `The ${path} score is ${score}. The remaining work is smaller, starting with ${top.title.toLowerCase()}.`;
  }
  return `The ${path} score is ${score} because ${top.title.toLowerCase()} is delaying the first useful paint.`;
}
