import { isPushEndpoint } from "./push-validation";

export type PushJob = {
  id: string;
  lease: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  payload: Record<string, unknown>;
};

export async function deliverPushJobs(
  jobs: PushJob[],
  send: (job: PushJob) => Promise<number>,
  finish: (job: PushJob, code: number) => Promise<void>,
) {
  let sent = 0,
    failed = 0;
  // Bound outgoing concurrency and never follow redirects to untrusted endpoints.
  for (let start = 0; start < jobs.length; start += 5) {
    await Promise.all(
      jobs.slice(start, start + 5).map(async (job) => {
        let code = 400;
        if (isPushEndpoint(job.endpoint)) {
          try {
            code = await send(job);
          } catch (error) {
            code =
              typeof error === "object" &&
              error !== null &&
              "statusCode" in error &&
              typeof error.statusCode === "number"
                ? error.statusCode
                : 503;
          }
        }
        await finish(job, code);
        if (code >= 200 && code < 300) sent++;
        else failed++;
      }),
    );
  }
  return { sent, failed };
}
