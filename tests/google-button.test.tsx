import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleButton } from "@/features/auth/google-button";
import messages from "@/messages/es.json";
const auth = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
function show() {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <GoogleButton />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  auth.signInWithOAuth.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:56321");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
describe("Google sign-in recovery", () => {
  it("prevents repeated requests while pending and recovers after provider failure", async () => {
    let reject!: (error: Error) => void;
    auth.signInWithOAuth.mockImplementationOnce(
      () =>
        new Promise((_, failed) => {
          reject = failed;
        }),
    );
    show();
    const button = screen.getByRole("button", { name: /Google/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(auth.signInWithOAuth).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await act(async () => reject(new Error("private provider details")));
    expect(screen.getByRole("alert")).toHaveTextContent(
      messages.Auth.signInError,
    );
    expect(screen.queryByText(/private provider details/)).toBeNull();
    expect(button).toBeEnabled();
    auth.signInWithOAuth.mockResolvedValueOnce({
      data: { url: "https://accounts.google.com/" },
      error: null,
    });
    await act(async () => fireEvent.click(button));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(button).toBeDisabled();
    expect(auth.signInWithOAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/auth/callback?next=/es/today"),
        }),
      }),
    );
  });
  it("offers a localized alternative when sign-in is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    show();
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      messages.Auth.unavailable,
    );
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});
