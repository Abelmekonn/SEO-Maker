import { prisma, settleUsage } from "@seo-maker/db";

/** What one feature of a generation came to. */
export type GenerationOutcome =
  | { status: "generated" }
  | { status: "cached" }
  | { status: "failed"; reason: string }
  | { status: "cancelled" }
  | { status: "skipped"; reason: string };

/**
 * Settles the usage record a user's AI request was charged to.
 *
 *   anything newly generated        -> succeeded (counts toward the allowance)
 *   only answers reused from cache  -> refunded: nothing new was produced
 *   stopped before anything new     -> cancelled
 *   everything failed or skipped    -> failed
 *
 * A partial success counts: the user got new output. A job queued before the
 * ledger existed has no record, and nothing is settled.
 */
export async function settleGeneration(
  usageId: string | undefined,
  outcomes: GenerationOutcome[],
  signal?: AbortSignal,
): Promise<void> {
  if (!usageId) return;
  const generated = outcomes.some((outcome) => outcome.status === "generated");
  const cached = outcomes.some((outcome) => outcome.status === "cached");
  const reasons = outcomes
    .flatMap((outcome) => ("reason" in outcome ? [outcome.reason] : []))
    .join("; ")
    .slice(0, 400);

  const status = generated
    ? "succeeded"
    : signal?.aborted || outcomes.some((outcome) => outcome.status === "cancelled")
      ? "cancelled"
      : cached
        ? "refunded"
        : "failed";
  const note =
    status === "refunded" ? "answered from cache: nothing new generated" : status === "succeeded" ? null : reasons || status;

  try {
    await settleUsage(prisma, usageId, status, note);
  } catch (error) {
    console.warn(`Could not settle usage ${usageId}:`, error);
  }
}
