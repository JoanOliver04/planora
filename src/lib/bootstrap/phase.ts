export const BOOTSTRAP_PHASES = [
  "loading",
  "authenticated",
  "unauthenticated",
  "offline",
  "recoverable_error",
  "fatal_error",
] as const;

export type BootstrapPhase = (typeof BOOTSTRAP_PHASES)[number];

export type BootstrapFacts = {
  settled: boolean;
  timedOut: boolean;
  online: boolean;
  hasSession: boolean;
  authError: boolean;
  hasFreshData: boolean;
  hasCache: boolean;
  requestFailed: boolean;
  fatal?: boolean;
};

export function decideBootstrapPhase(facts: BootstrapFacts): BootstrapPhase {
  if (facts.fatal) return "fatal_error";
  const hasData = facts.hasFreshData || facts.hasCache;
  if (!facts.online) {
    if (!facts.settled && !facts.timedOut && !hasData && !facts.authError)
      return "loading";
    return "offline";
  }
  if (!facts.settled && !facts.timedOut) return "loading";
  if (facts.authError || !facts.hasSession) {
    if (hasData) return "authenticated";
    if (facts.timedOut || facts.requestFailed) return "recoverable_error";
    return "unauthenticated";
  }
  if (facts.hasFreshData) return "authenticated";
  if (facts.hasCache) return "authenticated";
  if (facts.timedOut || facts.requestFailed) return "recoverable_error";
  return "recoverable_error";
}

export function bootstrapIsTerminal(phase: BootstrapPhase) {
  return phase !== "loading";
}
