import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Public security checks never load hosted credentials or reuse a developer's
// running server. Administrative integration tests use their separate guard.
export default defineConfig({
  ...base,
  testMatch: ["security-headers.spec.ts", "bootstrap.spec.ts", "app.spec.ts"],
  use: { ...base.use, baseURL: "http://127.0.0.1:3107" },
  webServer: {
    command: "npm run build && npm start -- --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3107",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-security-test-placeholder",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
