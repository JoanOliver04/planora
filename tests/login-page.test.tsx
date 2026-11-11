import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Login from "@/app/[locale]/login/page";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("redirect:" + path);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  createClient: async () => ({ auth }),
}));
vi.mock("next-intl/server", () => ({
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/components/navigation", () => ({ Logo: () => null }));
vi.mock("@/features/auth/google-button", () => ({
  GoogleButton: () => <button>Google</button>,
}));
vi.mock("@/components/notification-toaster", () => ({
  NotificationToaster: () => null,
}));
afterEach(cleanup);
const props = () => ({
  params: Promise.resolve({ locale: "en" }),
  searchParams: Promise.resolve({ error: "oauth" }),
});
describe("sign-in page", () => {
  it("lets the authenticated redirect escape the auth error handler", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "local-user" } } },
    });
    await expect(Login(props())).rejects.toThrow("redirect:/en/today");
  });
  it("keeps sign-in and error recovery available when the auth service fails", async () => {
    auth.getSession.mockRejectedValue(new Error("network unavailable"));
    render(await Login(props()));
    expect(screen.getByRole("button", { name: "Google" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("oauthError");
  });
});
