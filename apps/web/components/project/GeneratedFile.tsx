"use client";

import { Download } from "lucide-react";
import { CopyButton } from "@/components/project/CopyButton";

/**
 * A generated file with Copy and Download (Phase 3.4). The text is built on
 * the server from crawl evidence; this only hands it to the user.
 */
export function GeneratedFile({
  filename,
  content,
  mime,
  label,
}: {
  filename: string;
  content: string;
  mime: string;
  label?: string;
}) {
  function download() {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[12px] text-muted-foreground">{label ?? filename}</p>
        <div className="flex items-center gap-1.5">
          <CopyButton value={content} />
          <button
            type="button"
            onClick={download}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-mono text-[12px] text-body ring-1 ring-hairline hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-3.5" aria-hidden />
            Download
          </button>
        </div>
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-canvas p-3 font-mono text-[12px] leading-5 text-body ring-1 ring-hairline">
        {content}
      </pre>
    </div>
  );
}
