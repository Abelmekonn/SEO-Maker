/**
 * Queue producers for the worker.
 *
 * Until now the worker only consumed: every `enqueue*` helper lived in
 * `apps/web/lib/queue.ts`, so no job could ever chain into another one. That is
 * why the AI queues have had names and payload types but nothing to feed them.
 *
 * Connections and Queue instances are lazy singletons, matching the web side,
 * so importing this module costs nothing until something actually enqueues.
 */

import {
  GEO_AUDIT_JOB,
  GEO_QUEUE,
  type GeoAuditJob,
} from "@seo-maker/core/queue";
import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;

function getConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6380", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

let geoQueue: Queue<GeoAuditJob> | null = null;

function getGeoQueue() {
  if (!geoQueue) {
    geoQueue = new Queue<GeoAuditJob>(GEO_QUEUE, { connection: getConnection() });
  }
  return geoQueue;
}

/**
 * Enqueues a GEO audit.
 *
 * `attempts: 1` for the same reason competitor discovery uses it: the run is
 * long and spends real tokens, so a silent BullMQ retry would double-bill. The
 * retries that matter live inside the phases, and a failed run is retried
 * explicitly by the user.
 *
 * The `jobId` is derived from the project and crawl, so a crawl-completion
 * chain and a manual click racing each other collapse into one run rather than
 * two concurrent ones writing to the same project row.
 */
export async function enqueueGeoAudit(data: GeoAuditJob) {
  await getGeoQueue().add(GEO_AUDIT_JOB, data, {
    jobId: `geo:${data.projectId}:${data.crawlId ?? "latest"}`,
    attempts: 1,
    removeOnComplete: 20,
    removeOnFail: 20,
  });
}
