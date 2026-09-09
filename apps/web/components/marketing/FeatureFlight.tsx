"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ChartMock,
  GapsMock,
  GatewayMock,
  PagesMock,
  ScheduleMock,
} from "@/components/marketing/feature-mocks";
import { cn } from "@/lib/utils";

type Scene = {
  id: string;
  title: string;
  body: string;
  points: string[];
  tags: string[];
  note?: string;
  Visual: ComponentType;
  scroll: number;
  linger: number;
};

const SCENES: Scene[] = [
  {
    id: "audits",
    title: "Page audits in one table",
    body: "Every crawled URL lands in one project table. Status is on the row, not in a PDF.",
    points: [
      "Title, meta description, and H1 on every page",
      "Word count and missing-field flags",
      "Approved or review — no extra dashboard",
    ],
    tags: ["Homepage first", "On-page checklist"],
    Visual: PagesMock,
    scroll: 1.55,
    linger: 0.45,
  },
  {
    id: "vitals",
    title: "Core Web Vitals stored",
    body: "Performance is stored per page. You pick the PageSpeed scope so the run stays cheap.",
    points: [
      "LCP (main content paint), CLS (layout shift), and INP (input delay)",
      "Homepage, important pages, or all pages",
      "Readable notes on the raw PageSpeed output",
    ],
    tags: ["Scoped PageSpeed", "LCP · CLS · INP"],
    Visual: ChartMock,
    scroll: 1.5,
    linger: 0.4,
  },
  {
    id: "drafts",
    title: "AI title and meta drafts",
    body: "A suggestion you can copy. You ship the change. Then you re-audit.",
    points: [
      "Title and meta drafts from the page content",
      "Copy the line — no auto-publish to the site",
      "Re-run the table after you ship",
    ],
    tags: ["Claude drafts", "You ship it"],
    note: "Suggestions can be wrong. Edit before you publish. Audits work without drafts.",
    Visual: GatewayMock,
    scroll: 1.5,
    linger: 0.4,
  },
  {
    id: "scope",
    title: "Automated crawl scope",
    body: "Start small. Expand when the first pass is useful — not a full-site burn by default.",
    points: [
      "Homepage on Free",
      "Up to 10 pages on Pro, 100 on Agency",
      "Add URLs when you are ready",
    ],
    tags: ["Expand later", "Page-count plans"],
    Visual: ScheduleMock,
    scroll: 1.5,
    linger: 0.4,
  },
  {
    id: "gaps",
    title: "Competitor page gaps",
    body: "Enter a domain by hand. See pages they have that you do not. Search-result discovery comes later.",
    points: [
      "Manual competitor domains first",
      "Pages they rank that you skip",
      "Kept next to your own table",
    ],
    tags: ["Manual competitors", "Gaps, not vanity"],
    Visual: GapsMock,
    scroll: 1.6,
    linger: 0.45,
  },
];

const N = SCENES.length;
const TOTAL_W = SCENES.reduce((sum, scene) => sum + scene.scroll, 0);

function clamp(x: number, a = 0, b = 1) {
  return Math.min(b, Math.max(a, x));
}

function smooth(x: number) {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
}

function lingerEase(x: number, linger: number) {
  const L = clamp(linger);
  const c = x - 0.5;
  return (1 - L) * x + L * (4 * c * c * c + 0.5);
}

function sceneWindow(index: number) {
  let start = 0;
  for (let i = 0; i < index; i += 1) start += SCENES[i].scroll;
  return { start, end: start + SCENES[index].scroll };
}

function SceneCopy({ scene }: { scene: Scene }) {
  return (
    <div className="max-w-lg">
      <p className="font-mono text-[12px] tracking-[0.16em] text-brand-orange">
        What we do
      </p>
      <h2 className="mt-4 font-heading text-[32px] font-semibold tracking-[-1px] text-white md:text-[40px]">
        {scene.title}
      </h2>
      <p className="mt-4 text-base leading-6 text-mkt-muted">{scene.body}</p>
      <ul className="mt-5 flex flex-col gap-2.5">
        {scene.points.map((point) => (
          <li key={point} className="flex gap-3 text-sm leading-6 text-white/85">
            <span
              className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-orange"
              aria-hidden
            />
            {point}
          </li>
        ))}
      </ul>
      {scene.note ? (
        <p className="mt-4 text-sm leading-6 text-mkt-subtle">{scene.note}</p>
      ) : null}
      <p className="mt-6 font-mono text-[12px] leading-5 text-mkt-subtle">
        {scene.tags.join(" · ")}
      </p>
    </div>
  );
}

function SceneVisual({ Visual }: { Visual: ComponentType }) {
  return (
    <div className="h-[min(58vh,460px)] min-h-[280px] overflow-hidden rounded-2xl border border-white/10 bg-mkt-canvas shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_80px_rgba(255,109,41,0.10)] ring-1 ring-white/5">
      <Visual />
    </div>
  );
}

function FeatureStack() {
  return (
    <section aria-label="What we do" className="space-y-24 px-6 py-16">
      {SCENES.map((scene) => (
        <article
          key={scene.id}
          className="mx-auto grid w-full max-w-7xl items-center gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
        >
          <SceneCopy scene={scene} />
          <SceneVisual Visual={scene.Visual} />
        </article>
      ))}
    </section>
  );
}

function FeatureFlightDesktop() {
  const rootRef = useRef<HTMLElement>(null);
  const [y, setY] = useState(0);
  const [vh, setVh] = useState(800);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    let ticking = false;
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      setVh(window.innerHeight);
      setY(
        clamp(
          -root.getBoundingClientRect().top,
          0,
          root.offsetHeight - window.innerHeight,
        ),
      );
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const progress = vh ? y / vh : 0;
  const fade = 0.14;
  let active = 0;
  SCENES.forEach((_, i) => {
    if (progress >= sceneWindow(i).start) active = i;
  });

  function jumpTo(index: number) {
    const root = rootRef.current;
    if (!root) return;
    const { start } = sceneWindow(index);
    const top = root.offsetTop + start * window.innerHeight;
    window.scrollTo({ top, behavior: "auto" });
    setAnnounce(SCENES[index].title);
  }

  return (
    <section
      ref={rootRef}
      aria-label="What we do"
      className="relative"
      style={{ height: `${TOTAL_W * 100 + 100}vh` }}
    >
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden bg-mkt-canvas">
        <div className="relative mx-auto flex h-full w-full max-w-7xl items-center px-6">
          {SCENES.map((scene, i) => {
            const { start, end } = sceneWindow(i);
            const local = lingerEase(
              clamp((progress - start) / (end - start)),
              scene.linger,
            );
            const before = progress < start;
            const after = progress > end;
            let outside = 0;
            if (before) outside = start - progress;
            else if (after) outside = progress - end;
            const opacity = smooth(1 - outside / fade);
            const scale = 1.02 + local * 0.12;
            const rise = (0.5 - local) * 6;

            let copyOpacity = 0;
            if (i === 0) copyOpacity = after ? 0 : smooth(1 - local / 0.62);
            else if (i === N - 1) copyOpacity = before ? 0 : smooth(local / 0.4);
            else
              copyOpacity = before || after
                ? 0
                : smooth(1 - Math.abs(local - 0.5) / 0.5);

            return (
              <article
                key={scene.id}
                aria-hidden={i !== active}
                className="pointer-events-none absolute inset-0 flex items-center px-6"
                style={{
                  opacity,
                  zIndex: i === active ? 12 : 10,
                }}
              >
                <div className="mx-auto grid w-full max-w-7xl items-center gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div
                    className="pointer-events-auto"
                    style={{
                      opacity: copyOpacity,
                      transform: `translateY(${(0.5 - local) * 4}vh)`,
                    }}
                  >
                    <SceneCopy scene={scene} />
                  </div>
                  <div
                    style={{
                      transform: `translateY(${rise}vh) scale(${scale})`,
                    }}
                  >
                    <SceneVisual Visual={scene.Visual} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <nav
          aria-label="Feature scenes"
          className="absolute top-1/2 right-4 z-20 flex -translate-y-1/2 flex-col gap-1 md:right-8"
        >
          {SCENES.map((scene, i) => (
            <button
              key={scene.id}
              type="button"
              aria-label={scene.title}
              aria-current={i === active ? "true" : undefined}
              className="flex size-7 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
              onClick={() => jumpTo(i)}
            >
              <span
                className={cn(
                  "size-2.5 rounded-full border",
                  i === active
                    ? "border-white bg-white"
                    : "border-white/45 bg-transparent hover:border-white",
                )}
                aria-hidden
              />
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

export function FeatureFlight() {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyReduce = () => setReduce(motion.matches);
    applyReduce();
    motion.addEventListener("change", applyReduce);
    return () => motion.removeEventListener("change", applyReduce);
  }, []);

  if (reduce) return <FeatureStack />;

  return (
    <>
      <div className="md:hidden">
        <FeatureStack />
      </div>
      <div className="hidden md:block">
        <FeatureFlightDesktop />
      </div>
    </>
  );
}
