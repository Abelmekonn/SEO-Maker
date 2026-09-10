"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  BarChart3,
  FileSearch,
  Gauge,
  LayoutDashboard,
  Plus,
  Settings,
  Swords,
} from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { StatusBadge } from "@/components/project/StatusBadge";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";
import { cn } from "@/lib/utils";

type ProjectSummary = { name: string; status: string };

function projectIdFromPath(pathname: string) {
  const parts = pathname.split("/");
  if (parts[1] !== "projects" || !parts[2] || parts[2] === "new") {
    return null;
  }
  return parts[2];
}

export function Sidebar() {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  const projectBase = projectId ? `/projects/${projectId}` : null;
  const [project, setProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/projects/${projectId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { project?: ProjectSummary } | null) => {
        if (!cancelled) {
          setProject(data?.project ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProject(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const workspaceItems = [
    { href: "/dashboard", label: "Projects", icon: BarChart3, exact: true },
    { href: "/projects/new", label: "New project", icon: Plus, exact: true },
  ];

  const projectItems = projectBase
    ? [
        { href: projectBase, label: "Overview", icon: LayoutDashboard, exact: true },
        { href: `${projectBase}/pages`, label: "Pages", icon: FileSearch, exact: false },
        { href: `${projectBase}/performance`, label: "Performance", icon: Gauge, exact: false },
        { href: `${projectBase}/competitors`, label: "Competitors", icon: Swords, exact: false },
      ]
    : [];

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-hairline bg-canvas">
      <div className="flex h-16 shrink-0 items-center px-4">
        <BrandMark href="/dashboard" compact inverted wordmark />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
        <NavSection label="Workspace">
          {workspaceItems.map((item) => (
            <NavLink key={item.href} href={item.href} active={isActive(item.href, item.exact)}>
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </NavSection>

        {projectBase ? (
          <NavSection label="Project">
            <Link
              href={projectBase}
              className={cn(
                "mb-1 flex flex-col gap-2 rounded-lg bg-surface-soft p-3 ring-1 ring-hairline",
                "hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {project ? (
                <>
                  <p
                    className="line-clamp-2 break-all font-mono text-[13px] font-medium leading-5 text-ink"
                    title={project.name}
                  >
                    {project.name}
                  </p>
                  <StatusBadge status={project.status} />
                </>
              ) : (
                <>
                  <span className="block h-5 w-36 rounded bg-surface-card" aria-hidden />
                  <span className="block h-5 w-20 rounded-full bg-surface-card" aria-hidden />
                  <span className="sr-only">Loading project</span>
                </>
              )}
            </Link>
            {projectItems.map((item) => (
              <NavLink key={item.href} href={item.href} active={isActive(item.href, item.exact)}>
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </NavSection>
        ) : (
          <p className="px-3 text-xs leading-5 text-muted-soft">
            Open a project to see its overview, pages, performance, and competitors.
          </p>
        )}

        <div className="mt-auto flex flex-col gap-1 pt-2">
          <span
            aria-disabled="true"
            title="Settings comes in a later slice"
            className="flex min-h-10 cursor-not-allowed items-center gap-2.5 rounded-md px-3 font-mono text-sm text-muted-soft"
          >
            <Settings className="size-4 shrink-0" aria-hidden />
            Settings
            <span className="ml-auto rounded-full bg-surface-soft px-2 py-0.5 font-mono text-[12px] leading-4 text-muted-foreground">
              Later
            </span>
          </span>
        </div>
      </div>

      <ProfileFooter />
    </aside>
  );
}

function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      <p className="px-3 pb-1 font-mono text-[12px] leading-4 tracking-[0.3px] text-muted-soft">
        {label}
      </p>
      {children}
    </nav>
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
        "flex min-h-10 items-center gap-2.5 rounded-md px-3 font-mono text-sm font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-surface-soft text-ink ring-1 ring-hairline"
          : "text-muted-foreground hover:bg-surface-soft/70 hover:text-ink active:bg-surface-soft",
      )}
    >
      {children}
    </Link>
  );
}

function ProfileFooter() {
  const { user, isLoaded } = useUser();
  const name = user?.fullName || user?.username || user?.firstName || "Account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-hairline px-4 py-3">
      <UserButton
        appearance={{
          ...clerkDarkAppearance,
          elements: {
            avatarBox: "size-9",
          },
        }}
      />
      <div className="min-w-0 flex-1">
        {isLoaded ? (
          <>
            <p className="truncate text-sm font-medium leading-5 text-ink" title={name}>
              {name}
            </p>
            {email ? (
              <p
                className="truncate font-mono text-[12px] leading-4 text-muted-foreground"
                title={email}
              >
                {email}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <span className="block h-4 w-24 rounded bg-surface-card" aria-hidden />
            <span className="mt-1.5 block h-3 w-32 rounded bg-surface-card" aria-hidden />
          </>
        )}
      </div>
    </div>
  );
}
