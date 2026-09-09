"use client";

import { FormEvent } from "react";
import { Button } from "@/components/ui/button";

export function HomeCta() {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section className="px-6 pb-8">
      <div className="mx-auto max-w-7xl rounded-xl border border-white/10 bg-[#1a1514] px-8 py-12 text-center">
        <h2 className="font-heading text-[28px] font-semibold tracking-[-0.6px] text-white">
          Get product notes
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-brand-silver">
          Crawl and intake are next. Leave an email if you want the update.
        </p>
        <form
          onSubmit={onSubmit}
          className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row"
        >
          <label className="sr-only" htmlFor="notes-email">
            Email
          </label>
          <input
            id="notes-email"
            name="email"
            type="email"
            required
            placeholder="you@studio.com"
            className="h-10 flex-1 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-brand-orange/50"
          />
          <Button type="submit">Subscribe</Button>
        </form>
      </div>
    </section>
  );
}
