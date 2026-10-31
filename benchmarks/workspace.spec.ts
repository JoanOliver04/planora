import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test, expect } from "../e2e/fixtures";
import { withLocalWorkspace } from "../e2e/local-workspace";
import { localDate } from "../src/lib/dates/timezone";

test("measure cold private routes with a populated disposable workspace", async ({
  browser,
  context,
  baseURL,
}) => {
  const output = process.env.PLANORA_PERFORMANCE_OUTPUT;
  test.skip(!output, "Explicit performance output path required");
  const results: unknown[] = [];
  const publicDocuments: unknown[] = [];
  const publicContext = await browser.newContext({ serviceWorkers: "block" });
  publicContext.setDefaultTimeout(15_000);
  publicContext.setDefaultNavigationTimeout(30_000);
  try {
    const publicPage = await publicContext.newPage();
    for (const route of ["/es", "/es/demo/today", "/es/login"]) {
      console.info(`[performance] public ${route}`);
      await publicPage.goto(`${baseURL}${route}`);
      const size = await publicPage.evaluate(() => {
        const navigation = performance.getEntriesByType(
          "navigation",
        )[0] as PerformanceNavigationTiming;
        return {
          encodedBytes: navigation.encodedBodySize,
          decodedBytes: navigation.decodedBodySize,
        };
      });
      publicDocuments.push({ route, ...size });
    }
  } finally {
    await publicContext.close();
  }
  console.info("[performance] create disposable workspace");
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const schedule = await db.from("schedules").select("id").single();
    expect(schedule.error).toBeNull();
    const tasks = await db
      .from("tasks")
      .insert(
        Array.from({ length: 60 }, (_, index) => ({
          user_id: userId,
          schedule_id: schedule.data!.id,
          title: `Benchmark task ${String(index).padStart(3, "0")}`,
          task_kind: "habit",
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          start_date: "2026-01-01",
          sort_order: index,
        })),
      )
      .select("id");
    expect(tasks.error).toBeNull();
    const today = localDate("Europe/Madrid");
    const completions = await db.from("task_completions").insert(
      tasks.data!.flatMap((task) =>
        Array.from({ length: 14 }, (_, index) => {
          const date = new Date(`${today}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() - index - 1);
          return {
            user_id: userId,
            task_id: task.id,
            occurrence_date: date.toISOString().slice(0, 10),
            task_snapshot: { title: "Benchmark task" },
          };
        }),
      ),
    );
    expect(completions.error).toBeNull();
    console.info("[performance] seeded 60 tasks and 840 completions");
    const auth = await context.storageState();
    for (const route of ["today", "week", "settings", "history"]) {
      for (let run = 0; run < 3; run++) {
        console.info(`[performance] ${route} sample ${run + 1}`);
        const isolated = await browser.newContext({
          storageState: auth,
          viewport: { width: 390, height: 844 },
          serviceWorkers: "block",
        });
        isolated.setDefaultTimeout(15_000);
        isolated.setDefaultNavigationTimeout(30_000);
        try {
          const page = await isolated.newPage();
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          const cdp = await isolated.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          await page.goto(`${baseURL}/en/${route}`);
          await expect(page.locator("main h1").first()).toBeVisible();
          const readyMs = await page.evaluate(() => performance.now());
          await page.waitForLoadState("networkidle");
          const resources = await page.evaluate(() =>
            performance.getEntriesByType("resource").map((entry) => {
              const resource = entry as PerformanceResourceTiming;
              return {
                path: new URL(resource.name).pathname,
                encodedBytes: resource.encodedBodySize,
              };
            }),
          );
          const js = resources.filter(
            (resource) =>
              resource.path.startsWith("/_next/") &&
              resource.path.endsWith(".js"),
          );
          let dialogReadyMs: number | undefined;
          if (route === "today") {
            console.info("[performance] open task editor");
            const start = performance.now();
            await page
              .getByRole("button", { name: "Add", exact: true })
              .click();
            const dialog = page.getByRole("dialog");
            await expect(
              dialog.getByRole("textbox", { name: "Title", exact: true }),
            ).toBeVisible();
            dialogReadyMs = performance.now() - start;
            await page.keyboard.press("Escape");
          }
          expect(errors).toEqual([]);
          results.push({
            route,
            run,
            readyMs,
            dialogReadyMs,
            jsEncodedBytes: js.reduce(
              (sum, resource) => sum + resource.encodedBytes,
              0,
            ),
            jsRequests: js.length,
            resources,
          });
        } finally {
          await isolated.close();
        }
      }
    }
  });
  await mkdir(dirname(output!), { recursive: true });
  await writeFile(
    output!,
    JSON.stringify(
      {
        workload: {
          tasks: 60,
          completions: 840,
          cpuThrottle: 4,
          samplesPerRoute: 3,
          cache: "cold",
          network: "loopback",
        },
        results,
        publicDocuments,
      },
      null,
      2,
    ),
  );
});
