"use client";

import { FormEvent } from "react";
import { Button } from "@/components/ui/button";

export function EmailCta({
  id = "email-cta",
  submitLabel = "Get started",
}: {
  id?: string;
  submitLabel?: string;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-md items-center rounded-3xl border border-white/10 bg-black/40 p-1 shadow-[0_0_48px_rgba(255,109,41,0.18)]"
    >
      <label className="sr-only" htmlFor={id}>
        Email
      </label>
      <input
        id={id}
        name="email"
        type="email"
        required
        placeholder="you@studio.com"
        className="h-11 min-w-0 flex-1 bg-transparent px-4 text-sm text-white outline-none placeholder:text-white/35"
      />
      <Button type="submit" className="h-11 shrink-0  px-5">
        {submitLabel}
      </Button>
    </form>
  );
}
