"use client";

import { AiRunButton } from "@/components/ai/AiRunButton";

/**
 * Starts Page AI for one page (or, on a paid plan, a batch of the worst
 * pages). A thin wrapper over AiRunButton, kept for the screens that already
 * use it: every AI request goes through the same button, idempotency key and
 * server checks.
 */
export function AnalyzeButton({
  projectId,
  pageId,
  label,
  appearance = "outline",
  disabledReason,
  force = false,
  features,
  outputs,
  next,
}: {
  projectId: string;
  pageId?: string;
  label?: string;
  appearance?: "outline" | "primary";
  disabledReason?: string;
  force?: boolean;
  /** Worker feature names, e.g. ["title", "meta"]. */
  features?: string[];
  /** Page AI outputs, e.g. ["metadata"]. Preferred over `features`. */
  outputs?: string[];
  /** Queue the N worst pages not analysed yet, instead of one page. */
  next?: number;
}) {
  return (
    <AiRunButton
      endpoint={`/api/projects/${projectId}/analyze`}
      body={{ pageId, features, outputs, next }}
      label={label ?? (pageId ? "Analyse this page" : "Analyse pages")}
      appearance={appearance}
      regenerate={force}
      disabledReason={disabledReason}
    />
  );
}
