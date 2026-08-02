"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  cancelLabel,
  confirmLabel,
  onConfirm,
  variant = "danger",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  details?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => boolean | void | Promise<boolean | void>;
  variant?: "danger" | "primary";
}) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      const shouldClose = await onConfirm();
      if (shouldClose !== false) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description className="muted">
            {description}
          </AlertDialog.Description>
          {details}
          <div className="dialog-actions">
            <AlertDialog.Cancel className="pill" disabled={pending}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <button
              className={`primary ${variant === "danger" ? "danger-action" : ""}`}
              type="button"
              disabled={pending}
              onClick={() => void confirm()}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
