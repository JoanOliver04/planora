import test from "node:test";
import assert from "node:assert/strict";
import { assertCaptureBase } from "./environment.mjs";
import { createFixture, cleanupFixtureAccounts } from "./fixtures.mjs";

test("capture refuses remote origins, credentials and app paths", () => {
  for (const url of [
    "https://planora.vercel.app",
    "http://localhost.evil.test:3110",
    "http://user:password@localhost:3110",
    "http://localhost:3110/es",
    "http://localhost:3110/?url=hosted",
  ]) {
    assert.throws(() => assertCaptureBase(url));
  }
  assert.equal(
    assertCaptureBase("http://127.0.0.1:3110/"),
    "http://127.0.0.1:3110",
  );
});

test("fixture creation cannot reach hosted or unrelated local databases", async () => {
  for (const api of [
    "https://example.supabase.co",
    "http://127.0.0.1:54321",
    "http://127.0.0.1:57321/unexpected",
  ]) {
    await assert.rejects(
      createFixture({ api }, "es"),
      /isolated documentation instance/,
    );
  }
});

test("account cleanup cannot reach hosted or unrelated local databases", async () => {
  for (const api of ["https://example.supabase.co", "http://127.0.0.1:54321"]) {
    await assert.rejects(
      cleanupFixtureAccounts({ api }),
      /isolated documentation instance/,
    );
  }
});
