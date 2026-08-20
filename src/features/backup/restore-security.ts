import { distributedRateLimit } from "@/lib/security/distributed-rate-limit";

export async function assertRestoreAllowed(userId: string) {
  const attempt = await distributedRateLimit(
    `backup-restore:${userId}`,
    5,
    60 * 60_000,
    { fallback: "deny" },
  );
  if (!attempt.allowed) throw new Error("Too many restore attempts");
}
