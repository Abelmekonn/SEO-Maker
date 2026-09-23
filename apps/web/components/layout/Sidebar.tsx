"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  ChevronDown,
  ClipboardList,
  FileText,
  Gauge,
  Globe,
  Hexagon,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Lock,
  Menu,
  Plus,
  Settings,
  Sparkles,
  Star,
  Swords,
  Wrench,
  X,
} from "lucide-react";
import { AI_QUEUED_EVENT } from "@/components/project/AiQueueStatus";
import { CRAWL_QUEUED_EVENT } from "@/components/project/CrawlMiniStatus";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";
import type { PlanId } from "@/lib/plan";
import { cn } from "@/lib/utils";

type ProjectSummary = { id: string; name: string; status: string };

type Activity = {
  crawl: { running: boolean; done: number; total: number };
  performance: { running: boolean; done: number; total: number };
  competitors: { running: boolean };
  ai: { running: boolean; jobs: number };
};

/**
 * What is running for the open project, for the sidebar's mini progress.
 *
 * Polls quickly while something is in flight and slowly otherwise, and at
 * once when this tab starts a crawl or an AI run, so the indicator appears
 * the moment the work is queued.
 */
function useProjectActivity(projectId: string | null): Activity | null {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/activity`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setActivity((await response.json()) as Activity);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    window.addEventListener(CRAWL_QUEUED_EVENT, bump);
    window.addEventListener(AI_QUEUED_EVENT, bump);
    window.addEventListener("seo-maker:perf-queued", bump);
    return () => {
      window.removeEventListener(CRAWL_QUEUED_EVENT, bump);
      window.removeEventListener(AI_QUEUED_EVENT, bump);
      window.removeEventListener("seo-maker:perf-queued", bump);
    };
  }, []);

  const busy = Boolean(
    activity &&
      (activity.crawl.running || activity.performance.running || activity.competitors.running || activity.ai.running),
  );
  useEffect(() => {
    if (!projectId) return;
    const timer = window.setInterval(() => void load(), busy ? 4000 : 20000);
    return () => window.clearInterval(timer);
  }, [busy, load, projectId]);

  return projectId ? activity : null;
}

function projectIdFromPath(pathname: string) {
  const parts = pathname.split("/");
  if (parts[1] !== "projects" || !parts[2] || parts[2] === "new") {
    return null;
  }
  return parts[2];
}

export function Sidebar({ plan }: { plan: PlanId }) {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  const projectBase = projectId ? `/projects/${projectId}` : null;

  const workspaceItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/projects/new", label: "Add project", icon: Plus, exact: true },
  ];

  const primaryItems = projectBase
    ? [
        { href: projectBase, label: "Overview", icon: Hexagon, exact: true },
        { href: `${projectBase}/pages`, label: "Pages", icon: FileText, exact: false },
        { href: `${projectBase}/performance`, label: "Performance", icon: Gauge, exact: false },
        { href: `${projectBase}/competitors`, label: "Competitors", icon: Swords, exact: false, premium: true },
        { href: `${projectBase}/opportunities`, label: "Opportunities", icon: Lightbulb, exact: false, premium: true },
      ]
    : [];

  const secondaryItems = projectBase
    ? [
        { href: `${projectBase}/tools`, label: "Tools", icon: Wrench, exact: false, premium: true },
        { href: `${projectBase}/suggestions`, label: "AI workspace", icon: Sparkles, exact: false, premium: true },
        { href: `${projectBase}/reports`, label: "Reports", icon: ClipboardList, exact: false, premium: true },
        { href: `${projectBase}/settings`, label: "Settings", icon: Settings, exact: false },
      ]
    : [];

  const activity = useProjectActivity(projectId);
  const running: Record<string, string | true | undefined> = {
    [`${projectBase}`]: activity?.crawl.running
      ? activity.crawl.total
        ? `${activity.crawl.done}/${activity.crawl.total}`
        : true
      : undefined,
    [`${projectBase}/performance`]: activity?.performance.running
      ? activity.performance.total
        ? `${activity.performance.done}/${activity.performance.total}`
        : true
      : undefined,
    [`${projectBase}/competitors`]: activity?.competitors.running ? true : undefined,
    [`${projectBase}/suggestions`]: activity?.ai.running ? `${activity.ai.jobs}` : undefined,
  };

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  // Below lg the sidebar collapses into a drawer behind a top bar. A fixed
  // 224px column left phones 166px for content and pushed every page sideways.
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image src="/logo.png" alt="" width={24} height={24} className="size-6 rounded-full" />
          <span className="font-display text-[15px] font-semibold text-ink">SEO Maker</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls={drawerId}
          aria-label="Open navigation"
          className="flex size-11 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      {open ? (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      ) : null}

    <aside
      id={drawerId}
      className={cn(
        "flex h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-canvas lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-56",
        open ? "fixed inset-y-0 left-0 z-50" : "hidden",
      )}
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-4 pb-3">
        <Link
          href="/dashboard"
          className="cursor-pointer flex items-end gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="mt-0.5 size-7 shrink-0 rounded-full"
          />
          <span className="min-w-0">
            <span className="block font-display text-[15px] font-semibold leading-5 tracking-[-0.2px] text-ink">
              SEO Maker
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-3">
        <NavSection label="Workspace">
          {projectId ? (
            <WorkspaceSwitcher projectId={projectId} />
          ) : (
            workspaceItems.map((item) => (
              <NavLink key={item.href} href={item.href} active={isActive(item.href, item.exact)}>
                <item.icon className="size-3.5 shrink-0" aria-hidden />
                {item.label}
              </NavLink>
            ))
          )}
        </NavSection>

        {projectBase ? (
          <NavSection label="Project" className="mt-5">
            {primaryItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                active={isActive(item.href, item.exact)}
                locked={plan === "free" && "premium" in item}
                activity={running[item.href]}
              >
                <item.icon className="size-3.5 shrink-0" aria-hidden />
                {item.label}
              </NavLink>
            ))}
            <div className="mt-3 flex flex-col gap-0.5">
              {secondaryItems.map((item) => (
                  <NavLink
                  key={item.href}
                  href={item.href}
                  active={isActive(item.href, item.exact)}
                  locked={plan === "free" && "premium" in item}
                  activity={running[item.href]}
                >
                  <item.icon className="size-3.5 shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </NavSection>
        ) : (
          <p className="mt-5 px-2.5 text-xs leading-5 text-muted-soft">
            Open a project to see its overview, pages, performance, and competitors.
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-2 px-2.5 pb-3">
        {plan === "free" ? <UpgradeCard /> : null}
        <ProfileFooter />
      </div>
    </aside>
    </>
  );
}

function WorkspaceSwitcher({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { projects?: ProjectSummary[] } | null) => {
        if (!cancelled) {
          setProjects(data?.projects ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = projects?.find((project) => project.id === projectId) ?? null;
  const others = (projects ?? []).filter((project) => project.id !== projectId);

  return (
    <div ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "cursor-pointer flex h-9 w-full items-center gap-2 rounded-full px-2.5 ring-1 ring-hairline",
          "text-left text-[13px] font-medium text-ink",
          "hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-surface-soft",
        )}
      >
        <Globe className="size-3.5 shrink-0 text-muted-soft" aria-hidden />
        {current ? (
          <span className="min-w-0 flex-1 truncate" title={current.name}>
            {current.name}
          </span>
        ) : (
          <>
            <span className="h-3.5 flex-1 rounded bg-surface-card" aria-hidden />
            <span className="sr-only">Loading workspace</span>
          </>
        )}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-soft transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Workspaces"
          className="mt-1.5 overflow-hidden rounded-xl bg-surface-soft p-1 ring-1 ring-hairline"
        >
          {projects === null ? (
            <p className="px-2.5 py-2 text-[12px] leading-4 text-muted-soft">Loading workspaces</p>
          ) : others.length > 0 ? (
            <div className="max-h-40 overflow-y-auto">
              {others.map((project) => (
                <MenuLink key={project.id} href={`/projects/${project.id}`} icon={Globe}>
                  {project.name}
                </MenuLink>
              ))}
            </div>
          ) : (
            <p className="px-2.5 py-2 text-[12px] leading-4 text-muted-soft">No other workspaces</p>
          )}
          <div className="my-1 h-px bg-hairline" role="separator" />
          <MenuLink href="/dashboard" icon={LayoutDashboard}>
            Dashboard
          </MenuLink>
          <MenuLink href="/projects/new" icon={Plus}>
            Add project
          </MenuLink>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Globe;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className={cn(
        "cursor-pointer flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-ink",
        "hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-soft" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

function NavSection({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex flex-col gap-0.5", className)}>
      <p className="px-2.5 pb-1.5 text-[11px] leading-4 text-muted-soft">{label}</p>
      {children}
    </nav>
  );
}

function NavLink({
  href,
  active,
  locked = false,
  activity,
  children,
}: {
  href: string;
  active: boolean;
  /** Premium screen on a Free plan: still navigable, lands on the upgrade screen. */
  locked?: boolean;
  /** Work running for this screen: true for a spinner, or a short count. */
  activity?: string | true;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "cursor-pointer flex h-9 items-center gap-2 rounded-full px-2.5 text-[13px] font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-surface-soft hover:text-ink",
      )}
    >
      {children}
      {activity ? (
        <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] tabular-nums opacity-90">
          {typeof activity === "string" ? activity : null}
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="sr-only">(in progress)</span>
        </span>
      ) : null}
      {!activity && locked ? (
        <>
          <Lock className="ml-auto size-3 shrink-0 opacity-70" aria-hidden />
          <span className="sr-only">(premium)</span>
        </>
      ) : null}
    </Link>
  );
}

function UpgradeCard() {
  return (
    <div className="rounded-2xl bg-surface-soft p-3.5 ring-1 ring-hairline">
      <div className="flex items-start gap-2">
        <Star className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-5 text-ink">Upgrade to Pro</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-soft">
            Unlock competitors, AI suggestions, and every page on your site.
          </p>
        </div>
      </div>
      <Link
        href="/pricing"
        className={cn(
          "cursor-pointer flex mt-3 h-9 items-center justify-center rounded-full bg-primary px-3",
          "text-[13px] font-semibold text-primary-foreground",
          "hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        View plans
      </Link>
    </div>
  );
}

function ProfileFooter() {
  const { user, isLoaded } = useUser();
  const name = user?.fullName || user?.username || user?.firstName || "Account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  // The server always renders the loading state. When Clerk is already loaded in
  // the browser (any navigation after the first), the client's first render
  // would show the user instead and fail hydration. Match the server until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && isLoaded;

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-soft px-2.5 py-2 ring-1 ring-hairline">
      {mounted ? (
        <UserButton
          appearance={{
            ...clerkDarkAppearance,
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      ) : (
        <span className="size-8 shrink-0 rounded-full bg-surface-card" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {ready ? (
          <>
            <p className="truncate text-[13px] font-medium leading-4 text-ink" title={name}>
              {name}
            </p>
            {email ? (
              <p className="truncate text-[11px] leading-4 text-muted-soft" title={email}>
                {email}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <span className="block h-3.5 w-20 rounded bg-surface-card" aria-hidden />
            <span className="mt-1 block h-3 w-28 rounded bg-surface-card" aria-hidden />
          </>
        )}
      </div>
      <ChevronDown className="size-3.5 shrink-0 text-muted-soft" aria-hidden />
    </div>
  );
}
