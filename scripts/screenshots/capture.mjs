import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, WORK, redact } from "./environment.mjs";
import { dayOffset, TIMEZONE } from "./fixtures.mjs";

const translations = Object.fromEntries(
  await Promise.all(
    ["es", "en"].map(async (locale) => [
      locale,
      JSON.parse(
        await readFile(join(ROOT, "src", "messages", locale + ".json"), "utf8"),
      ),
    ]),
  ),
);
const pauseFrame = (page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
const english = (scene) => scene.locale === "en";
const pick = (scene, es, en) => (english(scene) ? en : es);

async function scrollTo(page, selector) {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await page.evaluate(() => window.scrollBy(0, -16));
  await pauseFrame(page);
  return target;
}

async function fillIfPresent(parent, selector, value) {
  const field = parent.locator(selector).first();
  if (await field.count()) await field.fill(value);
}

export async function prepareScene(page, scene, fixture) {
  const workspace = translations[scene.locale].Workspace;
  const focus = translations[scene.locale].Focus;
  const dialog = page.getByRole("dialog");
  switch (scene.action) {
    case "none":
      break;
    case "landing-cta":
      await scrollTo(page, ".landing-final");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      break;
    case "today-global":
      await scrollTo(page, ":nth-match(.task-group, 2)");
      break;
    case "today-mobile":
      await scrollTo(page, ".progress-card");
      break;
    case "history-mobile":
      await scrollTo(page, ".history-list");
      break;
    case "settings-mobile":
      await scrollTo(page, ".personalization");
      break;
    case "week-date": {
      const next = page
        .getByRole("button", { name: /siguiente|next/i })
        .first();
      await next.click();
      break;
    }
    case "tasks-habits":
      await page
        .getByRole("combobox", { name: workspace.sortBy, exact: true })
        .selectOption("name");
      break;
    case "tasks-global":
      await page
        .getByRole("combobox", { name: workspace.category, exact: true })
        .selectOption(fixture.categories.health.id);
      break;
    case "tasks-mobile":
      await page
        .getByRole("combobox", { name: workspace.category, exact: true })
        .selectOption(fixture.categories.work.id);
      break;
    case "task-edit":
      await page
        .getByRole("button", {
          name: workspace.edit + " " + fixture.tasks.build.title,
          exact: true,
        })
        .click();
      await expect(dialog).toBeVisible();
      break;
    case "task-create":
      await page
        .getByRole("button", { name: workspace.add, exact: true })
        .click();
      await expect(dialog).toBeVisible();
      await dialog
        .locator('input[name="title"]')
        .fill(
          pick(
            scene,
            "Preparar la retrospectiva del proyecto",
            "Prepare the project retrospective",
          ),
        );
      await fillIfPresent(dialog, 'input[name="emoji"]', "📝");
      await dialog
        .locator('select[name="categoryId"]')
        .selectOption(fixture.categories.work.id);
      await fillIfPresent(
        dialog,
        'textarea[name="description"]',
        pick(
          scene,
          "Recoger aprendizajes y elegir una mejora pequeña para la próxima semana.",
          "Gather what we learned and choose one small improvement for next week.",
        ),
      );
      break;
    case "event-create":
      await page
        .getByRole("button", { name: workspace.add, exact: true })
        .click();
      await expect(dialog).toBeVisible();
      await dialog
        .locator('input[name="title"]')
        .fill(pick(scene, "Revisión del portfolio", "Portfolio review"));
      await dialog.locator('input[name="emoji"]').fill("✨");
      await dialog
        .locator('input[name="eventDate"]')
        .fill(dayOffset(fixture.day, 3));
      await dialog
        .locator('select[name="categoryId"]')
        .selectOption(fixture.categories.work.id);
      if (await dialog.locator('input[type="checkbox"]').isChecked())
        await dialog.locator('input[type="checkbox"]').uncheck();
      await fillIfPresent(dialog, 'input[name="startTime"]', "11:00");
      await fillIfPresent(dialog, 'input[name="endTime"]', "11:45");
      break;
    case "history-detail":
      await scrollTo(page, ":nth-match(.history-day, 3)");
      break;
    case "statistics-detail":
    case "focus-statistics":
      await expect(page.locator(".focus-stats-panel").last()).toBeVisible();
      await expect(
        page.locator(".focus-stats-panel[aria-busy=true]"),
      ).toHaveCount(0);
      await scrollTo(page, ".focus-stats-panel");
      scene.crop = ".focus-stats-panel";
      break;
    case "schedule-edit":
      await page
        .getByRole("button", {
          name: workspace.edit + " " + fixture.schedules[0].name,
          exact: true,
        })
        .click();
      await expect(dialog).toBeVisible();
      break;
    case "reminders-configured":
    case "alarms":
      scene.crop = 'section[aria-labelledby="configured-reminders"]';
      break;
    case "notification-preferences":
      scene.crop =
        ".notification-preferences:has(.notification-preferences-heading)";
      break;
    case "reminder-create": {
      const section = page.locator("section.reminder-form").filter({
        has: page.getByRole("heading", {
          name: pick(scene, "Tarea o evento", "Task or event"),
          exact: true,
        }),
      });
      await section.scrollIntoViewIfNeeded();
      const input = section.locator('input[role="combobox"]');
      await input.fill(fixture.tasks.release.title);
      await page
        .getByRole("option", { name: new RegExp(fixture.tasks.release.title) })
        .click();
      scene.crop = "section.reminder-form:not(.alarm-form)";
      break;
    }
    case "alarm-create": {
      const section = page.locator(".alarm-form");
      await section.scrollIntoViewIfNeeded();
      await section
        .getByRole("textbox", {
          name: pick(scene, "Nombre", "Name"),
          exact: true,
        })
        .fill(
          pick(scene, "Una pausa para respirar", "A little room to breathe"),
        );
      await section
        .locator('input[type="date"]')
        .fill(dayOffset(fixture.day, 1));
      await section.locator('input[type="time"]').fill("16:30");
      await section.getByRole("combobox").selectOption("daily");
      await section.getByRole("heading").click();
      scene.crop = ".alarm-form";
      break;
    }
    case "focus-start":
      await page
        .getByRole("button", { name: focus.actions.startSession, exact: true })
        .click();
      await expect(dialog).toBeVisible();
      await dialog
        .getByLabel(focus.config.intention, { exact: true })
        .fill(
          pick(
            scene,
            "Avanzar en el panel del proyecto",
            "Move the project dashboard forward",
          ),
        );
      break;
    case "focus-intro":
      await page
        .getByRole("button", { name: focus.onboarding.startFirst, exact: true })
        .click();
      await expect(
        page.locator(".focus-onboarding-paths").first(),
      ).toBeVisible();
      break;
    case "focus-preset": {
      const preset = page
        .locator(".focus-preset-card")
        .filter({ hasText: fixture.presets.deep.name });
      await preset
        .getByRole("button", { name: focus.presets.edit, exact: true })
        .click();
      await expect(dialog).toBeVisible();
      break;
    }
    case "focus-plan-editor": {
      const preset = page
        .locator(".focus-preset-card")
        .filter({ hasText: fixture.presets.plan.name });
      await preset
        .getByRole("button", { name: focus.presets.edit, exact: true })
        .click();
      await expect(dialog).toBeVisible();
      await page.locator(".focus-plan-item").first().scrollIntoViewIfNeeded();
      scene.crop = ".focus-plan-item";
      break;
    }
    case "focus-presets":
      await page
        .getByRole("button", { name: focus.presets.manage, exact: true })
        .click();
      await scrollTo(page, ".focus-preset-manage");
      break;
    case "focus-goals":
      await page
        .getByRole("button", { name: focus.goals.manage, exact: true })
        .click();
      await page
        .locator(".focus-goal-manage .focus-preset-manage-main")
        .nth(1)
        .click();
      scene.crop = ".focus-goal-editor";
      break;
    case "focus-blocks":
      await scrollTo(page, ".focus-plan-live");
      scene.crop = ".focus-active-view";
      break;
    case "focus-summary":
    case "focus-summary-review": {
      await page
        .getByRole("button", { name: focus.engine.complete, exact: true })
        .click();
      await expect(page.locator(".focus-complete-card")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator(".focus-active-view")).toHaveCount(0);
      if (scene.action === "focus-summary-review") {
        const reflection = page.locator(".focus-review-optional");
        await reflection
          .getByLabel(focus.review.nextStep, { exact: true })
          .fill("Polish the empty state and check keyboard navigation.");
        await reflection
          .locator("fieldset")
          .nth(0)
          .getByRole("button", { name: "4", exact: true })
          .click();
        await reflection
          .locator("fieldset")
          .nth(1)
          .getByRole("button", { name: "4", exact: true })
          .click();
        await reflection
          .getByRole("button", {
            name: focus.review.outcomes.progress,
            exact: true,
          })
          .click();
        scene.crop = ".focus-review-optional";
      } else {
        const reflection = page.locator(
          ".focus-complete-card details[open] > summary",
        );
        while (await reflection.count()) await reflection.first().click();
        scene.crop = ".focus-complete-card";
      }
      break;
    }
    case "quick-capture":
      await page
        .locator('input[name="quickTask"]')
        .fill(
          pick(
            scene,
            "Portfolio mañana a las 11:00",
            "Portfolio tomorrow at 11:00",
          ),
        );
      await expect(page.locator(".quick-task")).toContainText("Portfolio");
      await page.locator('input[name="quickTask"]').press("Home");
      break;
    case "search":
      await page
        .getByRole("textbox", { name: workspace.searchTitle, exact: true })
        .fill("English");
      await expect(page.locator(".search-result").first()).toBeVisible();
      break;
    default:
      throw new Error("Unknown capture action: " + scene.action);
  }
  if (scene.id === "56") {
    await page
      .getByRole("button", {
        name: focus.activeView.enterFocusMode,
        exact: true,
      })
      .click();
  }
}

async function visibilityAudit(page, crop) {
  const region = crop ? await page.locator(crop).first().elementHandle() : null;
  return page.evaluate((region) => {
    const frame = region?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      right: innerWidth,
      bottom: innerHeight,
    };
    const intersects = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.right > frame.left &&
        rect.left < frame.right &&
        rect.bottom > frame.top &&
        rect.top < frame.bottom
      );
    };
    const all = (selector) =>
      Array.from((region || document).querySelectorAll(selector)).filter(
        intersects,
      );
    const brokenImages = all("img")
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute("src"));
    const loading = all(
      '.bootstrap-screen,.bootstrap-recovery,[aria-busy="true"],.loading-spinner,.skeleton',
    ).map((element) => element.className);
    const alerts = all('[role="alert"],[data-sonner-toast]')
      .map((element) => element.textContent?.trim())
      .filter(Boolean);
    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"],[role="alertdialog"]'),
    ).filter(intersects).length;
    const empty = all(".empty,.focus-empty").map((element) =>
      element.textContent?.trim(),
    );
    const nav = document.querySelector(".mobile-nav");
    const navRect =
      nav && getComputedStyle(nav).display !== "none"
        ? nav.getBoundingClientRect()
        : null;
    const clippedControls = all('button,input,select,[role="switch"]')
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < frame.left - 1 || rect.right > frame.right + 1;
      })
      .map((element) =>
        (
          element.getAttribute("aria-label") ||
          element.textContent ||
          element.tagName
        ).trim(),
      );
    return {
      width: innerWidth,
      height: innerHeight,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      brokenImages,
      loading,
      alerts,
      dialogs,
      empty,
      clippedControls,
      nav: navRect
        ? { top: navRect.top, height: navRect.height, bottom: navRect.bottom }
        : null,
      theme: document.documentElement.classList.contains("dark")
        ? "dark"
        : "light",
      locale: document.documentElement.lang,
      scrollY,
    };
  }, region);
}

async function compose(page, scene) {
  if (scene.crop) return;
  const navHeight =
    scene.device === "mobile"
      ? await page.locator(".mobile-nav").evaluateAll((elements) => {
          const nav = elements.find(
            (element) => getComputedStyle(element).display !== "none",
          );
          return nav?.getBoundingClientRect().height || 0;
        })
      : 0;
  let bottom;
  if (scene.endAt) {
    const target = page.locator(scene.endAt).first();
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    bottom = box.y + box.height;
  } else if (scene.trimUnits) {
    bottom = await page.locator(scene.trimUnits).evaluateAll(
      (elements, limit) => {
        const candidates = elements
          .map((element) => element.getBoundingClientRect())
          .filter(
            (rect) =>
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top >= 0 &&
              rect.bottom <= limit,
          );
        return candidates.length
          ? Math.max(...candidates.map((rect) => rect.bottom))
          : null;
      },
      scene.height - navHeight - 12,
    );
    if (!bottom)
      throw new Error("No complete content unit fits: " + scene.trimUnits);
  }
  if (bottom) {
    const height = Math.ceil(bottom + (scene.endPadding ?? 12) + navHeight);
    if (height < 600 || height > 2200)
      throw new Error(
        "Unexpected editorial boundary: " +
          (scene.endAt || scene.trimUnits) +
          " at " +
          height,
      );
    await page.setViewportSize({ width: scene.width, height });
    scene.height = height;
    await pauseFrame(page);
  }
}

export async function openBrowser() {
  return chromium.launch({ headless: true });
}

export async function captureScene(browser, environment, fixture, sourceScene) {
  const scene = { ...sourceScene };
  const diagnosticDir = join(WORK, "diagnostics");
  await mkdir(diagnosticDir, { recursive: true });
  await fixture.configure(scene.theme, scene);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await fixture.clearEphemeral();
    const live = scene.focusMode ? await fixture.active(scene.focusMode) : null;
    const context = await browser.newContext({
      viewport: { width: scene.width, height: scene.height },
      deviceScaleFactor: scene.scale,
      isMobile: scene.device === "mobile",
      hasTouch: scene.device === "mobile",
      locale: scene.locale === "es" ? "es-ES" : "en-GB",
      timezoneId: TIMEZONE,
      colorScheme: scene.theme,
      reducedMotion: "reduce",
    });
    const errors = [];
    const consoleErrors = [];
    const serverErrors = [];
    const foreignRequests = [];
    await context.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(requestUrl.protocol) &&
        ![environment.base, environment.api].includes(requestUrl.origin)
      ) {
        foreignRequests.push(requestUrl.origin);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    await context.addCookies(fixture.cookies);
    await context.addInitScript(
      ({ theme, intro, clock }) => {
        localStorage.setItem("planora-theme", theme);
        localStorage.setItem(
          "planora-focus-onboarding-v1",
          JSON.stringify({
            introDismissed: !intro,
            dismissedAt: intro ? null : clock,
          }),
        );
        localStorage.setItem(
          "planora-focus-device-preferences-v1",
          JSON.stringify({
            soundEnabled: false,
            soundVolume: 0.35,
            soundId: "soft",
            vibrationEnabled: false,
            systemNotifyEnabled: false,
            wakeLockPreferred: false,
            preferFullscreen: false,
            showCompactBar: true,
            lockScreenBehavior: "continue",
            keyboardShortcutsEnabled: true,
          }),
        );
        localStorage.setItem(
          "planora-notification-preferences-v1",
          JSON.stringify({
            tasks: true,
            events: true,
            summaries: true,
            alarms: true,
            inApp: true,
            system: false,
            sound: false,
            vibration: false,
          }),
        );
      },
      {
        theme: scene.theme,
        intro: Boolean(scene.emptyFocus),
        clock: fixture.clock,
      },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) => {
      if (!page.isClosed()) errors.push(error.message);
    });
    page.on("console", (message) => {
      if (!page.isClosed() && message.type() === "error")
        consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 500)
        serverErrors.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        });
    });
    const clock = live?.clock || fixture.clock;
    try {
      await page.clock.setFixedTime(new Date(clock));
      const path = "/" + scene.locale + (scene.route ? "/" + scene.route : "");
      const response = await page.goto(environment.base + path, {
        waitUntil: "load",
        timeout: 60_000,
      });
      if (!response?.ok()) throw new Error("HTTP " + response?.status());
      const main = page.getByRole("main");
      await expect(main).toHaveCount(1, { timeout: 30_000 });
      await expect(main).toBeVisible();
      await expect(main.locator("h1").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".bootstrap-screen")).toHaveCount(0);
      if (
        scene.route &&
        ![
          "focus",
          "settings",
          "data",
          "statistics",
          "reminders",
          "templates",
          "search",
          "summary",
        ].includes(scene.route)
      ) {
        await expect(page.locator("#main-content")).toBeVisible();
      }
      if (scene.focusMode)
        await expect(
          page.locator(".focus-active-controls button").first(),
        ).toBeEnabled();
      if (["today", "tasks", "week"].includes(scene.route)) {
        await expect(main).toContainText(fixture.tasks.build.title, {
          timeout: 20_000,
        });
      }
      await prepareScene(page, scene, fixture);
      if (scene.overlay && !scene.crop)
        await page.getByRole("dialog").getByRole("heading").first().click();
      await expect(
        page.locator(".focus-stats-panel[aria-busy=true]"),
      ).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await compose(page, scene);
      await page.mouse.move(0, 0);
      await expect(page.locator("[data-sonner-toast]:visible")).toHaveCount(0, {
        timeout: 15_000,
      });
      await pauseFrame(page);
      let audit = await visibilityAudit(page, scene.crop);
      for (let index = 0; audit.brokenImages.length && index < 4; index++) {
        await page.evaluate(() =>
          Promise.all(
            Array.from(document.images)
              .filter((image) => {
                const rect = image.getBoundingClientRect();
                return rect.top < innerHeight && rect.bottom > 0;
              })
              .map((image) => image.decode().catch(() => undefined)),
          ),
        );
        audit = await visibilityAudit(page, scene.crop);
      }
      if (audit.theme !== scene.theme || audit.locale !== scene.locale)
        throw new Error("Theme or language did not settle.");
      if (
        audit.overflow > 1 ||
        audit.loading.length ||
        audit.brokenImages.length ||
        audit.alerts.length ||
        audit.clippedControls.length ||
        audit.dialogs !== (scene.overlay || 0) ||
        (!scene.emptyFocus && audit.empty.length)
      ) {
        throw new Error("Composition checks failed: " + JSON.stringify(audit));
      }
      if (
        errors.length ||
        consoleErrors.length ||
        serverErrors.length ||
        foreignRequests.length
      ) {
        throw new Error(
          "Browser diagnostics: " +
            JSON.stringify({
              errors,
              consoleErrors,
              serverErrors,
              foreignRequests,
            }),
        );
      }
      // A panel detail excludes fixed app chrome, which otherwise covers its
      // final fields when Playwright expands a mobile viewport for the element.
      const panelStyle =
        scene.crop && scene.device === "mobile" && scene.key === "focus-goals"
          ? ".mobile-nav { visibility: hidden !important; }"
          : undefined;
      if (panelStyle)
        scene.captureNote =
          "Panel detail: fixed bottom navigation omitted from the crop.";
      const screenshot = () =>
        scene.crop
          ? page.locator(scene.crop).first().screenshot({
              animations: "disabled",
              caret: "hide",
              style: panelStyle,
            })
          : page.screenshot({
              fullPage: false,
              animations: "disabled",
              caret: "hide",
            });
      let previous = await screenshot();
      let stable = false;
      for (let sample = 0; sample < 4; sample++) {
        await pauseFrame(page);
        const next = await screenshot();
        if (previous.equals(next)) {
          previous = next;
          stable = true;
          break;
        }
        previous = next;
      }
      if (!stable)
        throw new Error(
          "The screenshot did not reach two identical rendered frames.",
        );
      await writeFile(join(ROOT, "docs", "images", scene.filename), previous);
      return {
        ...scene,
        status: "captured",
        attempt,
        clock,
        path,
        bytes: previous.length,
        sha256: createHash("sha256").update(previous).digest("hex"),
        audit,
        errors: [],
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error;
      console.log(
        "[capture] Retry " +
          scene.id +
          " (" +
          attempt +
          "/3): " +
          redact(error.message).slice(0, 450),
      );
      await page
        .screenshot({
          path: join(diagnosticDir, scene.id + "-attempt-" + attempt + ".png"),
          fullPage: false,
        })
        .catch(() => undefined);
      await writeFile(
        join(diagnosticDir, scene.id + "-attempt-" + attempt + ".txt"),
        redact(
          error.stack +
            "\n\n" +
            (await page
              .locator("body")
              .innerText()
              .catch(() => "")),
        ),
      );
    } finally {
      await context.close();
      await fixture.clearEphemeral();
    }
  }
  return {
    ...scene,
    status: "failed",
    error: redact(lastError?.message || "Unknown capture error"),
  };
}
