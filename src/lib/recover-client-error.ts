import { toast } from "sonner";
import { stopSoundPreview } from "@/lib/audio/shared-preview";

/**
 * Clear transient client state before an error boundary renders again.
 * Sonner keeps active toasts in a module store and replays them on remount.
 * A burst that crashed the toaster would crash again on retry if left in place.
 * Preview playback is in-memory only and must not restart by itself.
 */
export function recoverClientError() {
  try {
    stopSoundPreview();
  } catch {
    // Stopping audio is best-effort. Retry still has to run.
  }
  try {
    toast.dismiss();
  } catch {
    // The toast store can be mid-update. Leave it and still retry.
  }
}
