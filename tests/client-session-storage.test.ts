import { beforeEach, describe, expect, it } from "vitest";
import { activateClientSession } from "@/lib/security/client-session";

beforeEach(() => localStorage.clear());

describe("private account hints", () => {
  it("preserves drafts on a normal same-account refresh and clears them for another account", () => {
    activateClientSession("first-account");
    localStorage.setItem("planora-focus-recents", "private task title");
    localStorage.setItem("planora-onboarding-v1", "private schedule draft");
    activateClientSession("first-account");
    expect(localStorage.getItem("planora-focus-recents")).toBe(
      "private task title",
    );
    expect(localStorage.getItem("planora-onboarding-v1")).toBe(
      "private schedule draft",
    );
    activateClientSession("second-account");
    expect(localStorage.getItem("planora-focus-recents")).toBeNull();
    expect(localStorage.getItem("planora-onboarding-v1")).toBeNull();
  });
});
