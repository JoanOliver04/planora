import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { PrivateSessionGuard } from "@/components/private-session-guard";
import { canUseClientSession } from "@/lib/security/client-session";

const auth = vi.hoisted(() => ({
  callback: null as
    null | ((event: AuthChangeEvent, session: Session | null) => void),
  unsubscribe: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (callback: typeof auth.callback) => {
        auth.callback = callback;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "guard-user" } } } }),
    },
  }),
}));

beforeEach(() => {
  localStorage.clear();
  auth.unsubscribe.mockReset();
});
afterEach(cleanup);

describe("private session guard", () => {
  it("unmounts private children and stops their effects on a cross-tab sign-out", async () => {
    const stopPoll = vi.fn();
    function PrivateChild() {
      useEffect(() => stopPoll, []);
      return <p>Private workspace</p>;
    }
    localStorage.setItem(
      "planora-workspace-cache-v1:guard-user:today",
      "private",
    );
    render(
      <PrivateSessionGuard userId="guard-user" locale="en">
        <PrivateChild />
      </PrivateSessionGuard>,
    );
    expect(screen.getByText("Private workspace")).toBeInTheDocument();
    act(() => auth.callback?.("SIGNED_OUT", null));
    expect(screen.queryByText("Private workspace")).toBeNull();
    expect(stopPoll).toHaveBeenCalledOnce();
    expect(canUseClientSession("guard-user")).toBe(false);
    // Unmount before navigation; the deferred cleanup still clears storage.
    cleanup();
    await Promise.resolve();
    expect(
      localStorage.getItem("planora-workspace-cache-v1:guard-user:today"),
    ).toBeNull();
  });

  it("fails closed when another identity signs in while private UI is open", () => {
    render(
      <PrivateSessionGuard userId="guard-user" locale="es">
        <p>Private workspace</p>
      </PrivateSessionGuard>,
    );
    act(() =>
      auth.callback?.("SIGNED_IN", { user: { id: "other" } } as Session),
    );
    expect(screen.queryByText("Private workspace")).toBeNull();
    expect(canUseClientSession("guard-user")).toBe(false);
    cleanup();
  });

  it("reacts to another tab clearing private data after account deletion", () => {
    render(
      <PrivateSessionGuard userId="guard-user" locale="en">
        <p>Private workspace</p>
      </PrivateSessionGuard>,
    );
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "planora-private-session-revoked-v1",
          newValue: JSON.stringify({ userId: "guard-user", nonce: "remote" }),
        }),
      ),
    );
    expect(screen.queryByText("Private workspace")).toBeNull();
    cleanup();
  });
});
