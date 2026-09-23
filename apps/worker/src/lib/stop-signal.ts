/**
 * Turns a user's Stop request into an AbortSignal for a running job.
 *
 * The web app cannot reach into this process, so it records the request where
 * both can see it (a status on the job's database row, or a Redis key for AI
 * work) and the job polls for it. Every long wait in a job (a crawl, a
 * PageSpeed call, an AI call or its rate-limit wait) listens to the signal, so
 * a stop lands within a poll interval rather than when the work would have
 * finished anyway.
 */

const POLL_MS = 1500;

export type StopWatch = {
  signal: AbortSignal;
  /** Stops polling. Call it when the job ends, however it ends. */
  dispose: () => void;
};

export function watchForStop(requested: () => Promise<boolean>, pollMs = POLL_MS): StopWatch {
  const controller = new AbortController();
  let checking = false;

  const timer = setInterval(() => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    requested()
      .then((stop) => {
        if (stop) {
          controller.abort();
          clearInterval(timer);
        }
      })
      // A failed check is not a stop request. The next poll tries again.
      .catch(() => undefined)
      .finally(() => {
        checking = false;
      });
  }, pollMs);

  return {
    signal: controller.signal,
    dispose: () => clearInterval(timer),
  };
}
