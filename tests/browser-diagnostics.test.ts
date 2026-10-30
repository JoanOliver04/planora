import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginBrowserCleanup,
  installBrowserErrorCapture,
  isBrowserCleanup,
} from "../e2e/browser-diagnostics";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.unstubAllGlobals();
});

function capture() {
  const report = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("__planoraQaError", report);
  dispose = installBrowserErrorCapture();
  return report;
}

describe("actual browser JavaScript errors", () => {
  it("only marks the explicitly closing page as cleanup", () => {
    const closing = {},
      active = {};
    expect(isBrowserCleanup(closing)).toBe(false);
    beginBrowserCleanup(closing);
    expect(isBrowserCleanup(closing)).toBe(true);
    expect(isBrowserCleanup(active)).toBe(false);
  });
  it("captures an uncaught window error", () => {
    const report = capture();
    const error = new TypeError("application failure");
    window.dispatchEvent(
      new ErrorEvent("error", { message: error.message, error }),
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "error",
        name: "TypeError",
        message: error.message,
      }),
    );
  });
  it("captures an unhandled promise rejection", () => {
    const report = capture();
    const event = new Event("unhandledrejection");
    Object.defineProperty(event, "reason", {
      value: new Error("async failure"),
    });
    window.dispatchEvent(event);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "unhandledrejection",
        message: "async failure",
      }),
    );
  });
  it("captures syntax errors without an Error object", () => {
    const report = capture();
    window.dispatchEvent(
      new ErrorEvent("error", { message: "Unexpected token" }),
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error", message: "Unexpected token" }),
    );
  });
  it("does not mislabel a resource event as a JavaScript exception", () => {
    const report = capture();
    window.dispatchEvent(new Event("error"));
    expect(report).not.toHaveBeenCalled();
  });
  it("removes listeners when disposed", () => {
    const report = capture();
    dispose!();
    window.dispatchEvent(
      new ErrorEvent("error", { message: "after disposal" }),
    );
    expect(report).not.toHaveBeenCalled();
  });
});
