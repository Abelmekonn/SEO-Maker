"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EmailCta({
  id = "site-url",
  submitLabel = "Get started",
}: {
  id?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("url") ?? "").trim();
    if (!value) {
      setError("Enter a site URL to start a project.");
      return;
    }

    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(href);
      if (!parsed.hostname.includes(".")) {
        setError("Enter a full site URL, like example.com.");
        return;
      }
    } catch {
      setError("Enter a valid site URL, like example.com.");
      return;
    }

    setError("");
    router.push(`/projects/new?url=${encodeURIComponent(href)}`);
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col gap-2 rounded-3xl border border-white/10 bg-black/40 p-1 shadow-[0_0_48px_rgba(255,109,41,0.18)] sm:flex-row sm:items-center"
      >
        <label className="sr-only" htmlFor={id}>
          Site URL
        </label>
        <input
          id={id}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          required
          placeholder="example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error ${id}-note` : `${id}-note`}
          className="h-11 min-w-0 flex-1 bg-transparent px-4 text-sm text-white outline-none placeholder:text-mkt-subtle"
        />
        <Button type="submit" className="h-11 w-full shrink-0 px-5 sm:w-auto">
          {submitLabel}
        </Button>
      </form>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-white">
          {error}
        </p>
      ) : null}
      <p id={`${id}-note`} className="max-w-md text-center text-sm leading-6 text-mkt-subtle">
        No mailing list. This opens a project. We do not store the URL until you
        continue.
      </p>
    </div>
  );
}
