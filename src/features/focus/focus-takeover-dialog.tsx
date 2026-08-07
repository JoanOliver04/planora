"use client";

import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useOptionalFocusSessionContext } from "./focus-session-context";

/** Global takeover confirm so the compact bar can open it outside /focus. */
export function FocusTakeoverDialog() {
  const ctx = useOptionalFocusSessionContext();
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  if (!ctx) return null;

  return (
    <ConfirmDialog
      open={ctx.takeoverDialogOpen}
      onOpenChange={ctx.setTakeoverDialogOpen}
      title={t("sync.takeoverTitle")}
      description={t("sync.takeoverDescription")}
      cancelLabel={common("cancel")}
      confirmLabel={t("sync.continueHere")}
      onConfirm={async () => {
        await ctx.requestTakeover();
        return true;
      }}
    />
  );
}
