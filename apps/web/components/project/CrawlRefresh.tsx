"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const LIVE = new Set(["pending", "crawling", "queued", "running", "cancelling", "discovering"]);

/**
 * Re-fetches the current route every couple of seconds while `status`
 * is an in-progress state. Renders nothing.
 */
export function CrawlRefresh({
  status,
  intervalMs = 2000,
}: {
  status: string;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!LIVE.has(status)) {
      return;
    }

    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, router, status]);

  return null;
}
