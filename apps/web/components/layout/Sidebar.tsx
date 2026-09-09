"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileSearch,
  Gauge,
  LayoutDashboard,
  Settings,
  Swords,
} from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { DEMO_PROJECT_ID } from "@/lib/demo-project";
import { cn } from "@/lib/utils";

const projectBase = `/projects/${DEMO_PROJECT_ID}`;

const navItems = [
  { href: projectBase, label: "Overview", icon: LayoutDashboard },
  { href: `${projectBase}/pages`, label: "Pages", icon: FileSearch },
  { href: `${projectBase}/performance`, label: "Performance", icon: Gauge },
  { href: `${projectBase}/competitors`, label: "Competitors", icon: Swords },
];

function isActive(pathname: string, href: string) {
  if (href === projectBase) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-hairline bg-canvas">
      <div className="border-b border-hairline px-4 py-4">
        <BrandMark href="/dashboard" />
        <div className="mt-4 rounded-full bg-surface-soft p-1.5">
          <p className="rounded-full bg-canvas px-3 py-1.5 font-mono text-sm font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            demo.example.com
          </p>
        </div>
      </div>

      <nav aria-label="Project" className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md px-3 font-mono text-sm font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-canvas text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-hairline"
                  : "text-muted-foreground active:bg-surface-soft active:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}

        <span
          className="mt-auto flex min-h-11 cursor-not-allowed items-center gap-2 rounded-md px-3 font-mono text-sm text-muted-soft"
          title="Settings comes in a later slice"
        >
          <Settings className="size-4" aria-hidden />
          Settings
          <span className="ml-auto rounded-full bg-surface-card px-3 py-1 text-[13px] font-medium text-ink">
            Later
          </span>
        </span>
      </nav>

      <div className="border-t border-hairline p-3">
        <Link
          href="/dashboard"
          className="flex min-h-11 items-center gap-2 rounded-md px-3 font-mono text-sm font-medium text-muted-foreground active:bg-surface-soft active:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BarChart3 className="size-4" aria-hidden />
          All projects
        </Link>
      </div>
    </aside>
  );
}
