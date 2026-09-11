"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { normalizeSiteUrl } from "@/lib/site-url";

export function UrlIntakeForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeSiteUrl(url);
    if ("error" in normalized) {
      setError(normalized.error);
      return;
    }

    setPending(true);
    setError("");
    setExistingId(null);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: normalized.href }),
    });

    const data = (await response.json().catch(() => null)) as
      | { id?: string; error?: string }
      | null;

    if (response.status === 409 && data?.id) {
      setPending(false);
      setExistingId(data.id);
      setError(data.error ?? "Free includes one project.");
      return;
    }

    if (!response.ok || !data?.id) {
      setPending(false);
      setError(data?.error ?? "Could not start the project.");
      return;
    }

    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="project-url" className="text-sm font-medium text-ink">
          Site URL
        </label>
        <input
          id="project-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "project-url-error" : undefined}
          className="h-11 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error ? (
        <div className="flex flex-col gap-2">
          <p id="project-url-error" role="alert" className="text-sm text-ink">
            {error}
          </p>
          {existingId ? (
            <Link
              href={`/projects/${existingId}`}
              className="text-sm underline underline-offset-4 hover:text-ink"
            >
              Open your project
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-body">
          We crawl the homepage when the project starts. Your plan sets how many
          sites and pages you can add.
        </p>
      )}
      <Button type="submit" className="h-11 w-fit" disabled={pending}>
        {pending ? "Starting…" : "Start project"}
      </Button>
    </form>
  );
}
