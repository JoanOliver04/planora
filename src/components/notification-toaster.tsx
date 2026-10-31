"use client";

import { Toaster } from "sonner";

export function NotificationToaster() {
  return (
    <Toaster
      richColors
      position="top-center"
      offset={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      mobileOffset={{
        top: "calc(0.75rem + env(safe-area-inset-top, 0px))",
        left: "max(0.75rem, env(safe-area-inset-left, 0px))",
        right: "max(0.75rem, env(safe-area-inset-right, 0px))",
      }}
    />
  );
}
