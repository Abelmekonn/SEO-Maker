/** Shown while the Sites list loads or a filter changes on the server. */
export default function SitesLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5" aria-busy="true" aria-label="Loading sites">
      <div className="flex flex-col gap-2">
        <span className="h-4 w-24 animate-pulse rounded bg-surface-soft motion-reduce:animate-none" />
        <span className="h-8 w-40 animate-pulse rounded bg-surface-soft motion-reduce:animate-none" />
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />
      <div className="flex flex-col gap-px overflow-hidden rounded-xl ring-1 ring-hairline">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <span key={row} className="h-16 animate-pulse bg-surface-soft motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
