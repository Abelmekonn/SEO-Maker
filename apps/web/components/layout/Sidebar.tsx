"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Cog,
  Eye,
  FileText,
  Gauge,
  Globe,
  Hexagon,
  LayoutDashboard,
  Lightbulb,
  Link2,
  Newspaper,
  Plus,
  Quote,
  Radar,
  Settings,
  Sparkles,
  Star,
  Swords,
  Target,
  Wrench,
} from "lucide-react";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";
import type { PlanId } from "@/lib/plan";
import { cn } from "@/lib/utils";

type ProjectSummary = { id: string; name: string; status: string };

/**
 * A nav entry. `href` absent means the page does not exist yet: the item is
 * rendered, so the shape of the product is visible, but it is not a link and
 * carries a "Soon" tag. Navigating to a 404 is worse than saying "not yet".
 */
type NavItem = {
  key: string;
  label: string;
  icon: typeof Globe;
  href?: string;
  exact?: boolean;
};

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

  const seoItems: NavItem[] = projectBase
    ? [
        { key: "pages", href: `${projectBase}/pages`, label: "Pages", icon: FileText },
        { key: "technical", label: "Technical SEO", icon: Cog },
        { key: "content", label: "Content", icon: Newspaper },
        { key: "performance", href: `${projectBase}/performance`, label: "Performance", icon: Gauge },
        { key: "links", label: "Internal Links", icon: Link2 },
        { key: "competitors", href: `${projectBase}/competitors`, label: "Competitors", icon: Swords },
        {
          key: "opportunities",
          href: `${projectBase}/opportunities`,
          label: "Opportunities",
          icon: Lightbulb,
        },
      ]
    : [];

  const aiSearchItems: NavItem[] = projectBase
    ? [
        // Not Hexagon: that already means the project Overview, and one glyph
        // should not stand for two different destinations.
        { key: "ai-overview", href: `${projectBase}/ai-search`, label: "Overview", icon: Radar, exact: true },
        {
          key: "ai-readiness",
          href: `${projectBase}/ai-search/readiness`,
          label: "AI Readiness",
          icon: Gauge,
        },
        { key: "ai-visibility", label: "AI Visibility", icon: Eye },
        { key: "ai-citations", label: "AI Citations", icon: Quote },
        { key: "ai-competitors", label: "AI Competitors", icon: Swords },
        { key: "geo-opportunities", label: "GEO Opportunities", icon: Target },
      ]
    : [];

  const secondaryItems: NavItem[] = projectBase
    ? [
        { key: "tools", href: `${projectBase}/tools`, label: "Tools", icon: Wrench },
        { key: "suggestions", href: `${projectBase}/suggestions`, label: "AI Suggestions", icon: Sparkles },
        { key: "reports", href: `${projectBase}/reports`, label: "Reports", icon: ClipboardList },
        { key: "settings", href: `${projectBase}/settings`, label: "Settings", icon: Settings },
      ]
    : [];

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  function hasActiveChild(items: NavItem[]) {
    return items.some((item) => item.href != null && isActive(item.href, item.exact));
  }

  // A group opens itself when the current page is inside it, but an explicit
  // toggle wins from then on — otherwise navigating would keep reopening a
  // group the person just closed.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const seoOpen = toggled.seo ?? hasActiveChild(seoItems);
  const aiOpen = toggled.ai ?? hasActiveChild(aiSearchItems);

  function toggleGroup(key: string, open: boolean) {
    setToggled((current) => ({ ...current, [key]: open }));
  }

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-hairline bg-canvas">
      <div className="shrink-0 px-3 pt-4 pb-3">
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
            <NavLink href={projectBase} active={isActive(projectBase, true)}>
              <Hexagon className="size-3.5 shrink-0" aria-hidden />
              Overview
            </NavLink>

            <NavGroup
              label="SEO"
              icon={BarChart3}
              open={seoOpen}
              onToggle={() => toggleGroup("seo", !seoOpen)}
            >
              {seoItems.map((item) => (
                <NavItemRow key={item.key} item={item} isActive={isActive} />
              ))}
            </NavGroup>

            <NavGroup
              label="AI Search"
              icon={Sparkles}
              badge="New"
              open={aiOpen}
              onToggle={() => toggleGroup("ai", !aiOpen)}
            >
              {aiSearchItems.map((item) => (
                <NavItemRow key={item.key} item={item} isActive={isActive} />
              ))}
            </NavGroup>

            <div className="mt-3 flex flex-col gap-0.5">
              {secondaryItems.map((item) => (
                <NavItemRow key={item.key} item={item} isActive={isActive} />
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

/**
 * A collapsible group of nav items.
 *
 * The header is a button rather than a link: it owns disclosure, not
 * navigation. Its `aria-expanded` and `aria-controls` are what let a screen
 * reader announce the group as open or closed.
 */
function NavGroup({
  label,
  icon: Icon,
  badge,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: typeof Globe;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = useId();

  return (
    <div className="mt-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className={cn(
          "cursor-pointer flex h-9 w-full items-center gap-2 rounded-full px-2.5",
          "text-left text-[13px] font-medium text-muted-foreground",
          "hover:bg-surface-soft hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge ? (
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-primary">
            {badge}
          </span>
        ) : null}
        <ChevronDown
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {/*
        Always rendered so `aria-controls` resolves to the real content, and
        toggled with a display utility rather than the `hidden` attribute —
        Tailwind's `flex` utility would otherwise win over `[hidden]` and the
        group would never collapse.
      */}
      <div
        id={contentId}
        className={cn(
          "ml-4 flex-col gap-0.5 border-l border-hairline pl-2",
          open ? "mt-0.5 flex" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Renders a nav entry as a link, or as a non-interactive "Soon" row. */
function NavItemRow({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: (href: string, exact?: boolean) => boolean;
}) {
  if (!item.href) {
    return (
      <span className="flex h-9 items-center gap-2 rounded-full px-2.5 text-[13px] font-medium text-muted-soft">
        <item.icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="shrink-0 rounded-full bg-surface-card px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-soft">
          Soon
        </span>
      </span>
    );
  }

  return (
    <NavLink href={item.href} active={isActive(item.href, item.exact)}>
      <item.icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </NavLink>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
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
            Unlock competitor analysis, Google Search Console, and more.
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

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-soft px-2.5 py-2 ring-1 ring-hairline">
      <UserButton
        appearance={{
          ...clerkDarkAppearance,
          elements: {
            avatarBox: "size-8",
          },
        }}
      />
      <div className="min-w-0 flex-1">
        {isLoaded ? (
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
