"use client";

import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects/new": "New project",
};

function titleFromPath(pathname: string) {
  if (titles[pathname]) {
    return titles[pathname];
  }

  if (pathname.includes("/pages/") && pathname.split("/").length > 4) {
    return "Page audit";
  }

  if (pathname.endsWith("/pages")) {
    return "Pages";
  }

  if (pathname.endsWith("/performance")) {
    return "Performance";
  }

  if (pathname.endsWith("/competitors")) {
    return "Competitors";
  }

  if (pathname.startsWith("/projects/")) {
    return "Overview";
  }

  return "SEO Maker";
}

export function TopBar() {
  const pathname = usePathname();
  const title = titleFromPath(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center bg-canvas px-6">
      <h1 className="text-base font-semibold leading-[1.4] text-ink">{title}</h1>
    </header>
  );
}
