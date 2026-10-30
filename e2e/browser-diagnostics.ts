/** WebKit reports some cancelled fetches as pageerror without a JS stack.
 * https://github.com/microsoft/playwright/issues/43120
 * Recognize only the browser's malformed error name and known test origins.
 * Ordinary JavaScript exceptions and errors with a stack remain failures.
 */
export function isWebKitResourceDiagnostic(
  error: { name: string; message: string; stack?: string },
  browserName: string,
  origins: string[],
) {
  if (browserName !== "webkit" || error.stack) return false;
  const protocol = error.name.match(/^Fetch API cannot load (https?)$/)?.[1];
  const resource = error.message.match(
    /^(\/\S+) due to access control checks\.$/,
  )?.[1];
  if (!protocol || !resource) return false;
  try {
    // Playwright splitErrorMessage discards the first slash after "http:".
    const target = new URL(`${protocol}:/${resource}`);
    return origins.includes(target.origin);
  } catch {
    return false;
  }
}
