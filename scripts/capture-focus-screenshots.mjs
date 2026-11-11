/** Backwards-compatible entry point. Uses the same isolated, local-only runner. */
import { main } from "./capture-docs-screenshots.mjs";
import { redact } from "./screenshots/environment.mjs";

main(["--group", "focus", ...process.argv.slice(2)]).catch((error) => {
  console.error(redact(error.stack || error.message));
  process.exitCode = 1;
});
