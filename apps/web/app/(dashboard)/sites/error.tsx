"use client";

/** The Sites list could not load. Offers a retry instead of a blank screen. */
export default function SitesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
      <h1 className="font-display text-[22px] leading-7 text-ink">Your sites could not be loaded</h1>
      <p className="text-sm leading-6 text-body">This is usually brief. Try again in a moment.</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-11 cursor-pointer items-center rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try again
      </button>
    </section>
  );
}
