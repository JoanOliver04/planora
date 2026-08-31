import { siteConfig } from "@/config/site";

export const planoraBuildId =
  process.env.NEXT_PUBLIC_PLANORA_BUILD_ID || siteConfig.version;

export const PLANORA_CACHE_PREFIX = "planora-";
export const OFFLINE_STORAGE_KEYS = [
  "planora-offline-completions-v1",
  "planora-focus-offline-queue-v1",
  "planora-focus-offline-processed-v1",
] as const;
export const OFFLINE_STORAGE_PREFIXES = [
  "planora-workspace-cache-v1:",
  "planora-focus-session-cache-v1:",
] as const;
