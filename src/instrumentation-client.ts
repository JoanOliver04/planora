import { bindAssetLoadRecovery } from "@/lib/pwa/chunk-recovery";
import { logBootstrap } from "@/lib/bootstrap/log";

try {
  bindAssetLoadRecovery();
  logBootstrap({ phase: "hydrate" });
} catch {
  // Instrumentation must never block startup.
}
