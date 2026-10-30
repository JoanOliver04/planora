export type BrowserErrorRecord = {
  kind: "error" | "unhandledrejection";
  name: string;
  message: string;
  stack?: string;
};

/** Install before application scripts. WebKit's pageerror also includes browser
 * resource diagnostics, so assert actual window errors and unhandled rejections.
 */
export function installBrowserErrorCapture() {
  const sink = (
    globalThis as unknown as {
      __planoraQaError: (record: BrowserErrorRecord) => Promise<void>;
    }
  ).__planoraQaError;
  const report = (record: BrowserErrorRecord) => {
    void sink(record).catch(() => undefined);
  };
  const onError = (event: Event) => {
    if (!(event instanceof ErrorEvent)) return;
    report({
      kind: "error",
      name: event.error?.name ?? "Error",
      message: event.message,
      stack: event.error?.stack,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    report({
      kind: "unhandledrejection",
      name: reason?.name ?? "Error",
      message: reason?.message ?? String(reason),
      stack: reason?.stack,
    });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
