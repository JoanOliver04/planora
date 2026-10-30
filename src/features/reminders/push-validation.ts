import { z } from "zod";

export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.length > 1 &&
      value.length <= 2048 &&
      /^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

export const pushPreferencesSchema = z
  .object({
    tasks: z.boolean(),
    events: z.boolean(),
    summaries: z.boolean(),
    alarms: z.boolean(),
    system: z.boolean(),
    sound: z.boolean(),
    vibration: z.boolean(),
    inApp: z.boolean(),
  })
  .strict();

export const pushRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("subscribe"),
      subscription: z
        .object({
          endpoint: z.string().refine(isPushEndpoint),
          keys: z
            .object({
              p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,2}$/),
              auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
            })
            .strict(),
          expirationTime: z.number().nullable().optional(),
        })
        .strict(),
      preferences: pushPreferencesSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(["unsubscribe", "test"]),
      endpoint: z.string().refine(isPushEndpoint),
    })
    .strict(),
]);
