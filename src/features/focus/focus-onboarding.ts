/**
 * First-visit Focus onboarding is device-local (like other device prefs).
 * Never auto-creates categories or inserts presets without the user choosing.
 */

export const FOCUS_ONBOARDING_KEY = "planora-focus-onboarding-v1";
export const FOCUS_ONBOARDING_EVENT = "planora-focus-onboarding";

export type FocusOnboardingState = {
  /** User dismissed the intro ("Not now") or completed a first-path action. */
  introDismissed: boolean;
  /** Timestamp of last dismiss (ISO), optional analytics-free breadcrumb. */
  dismissedAt: string | null;
};

export const defaultFocusOnboardingState: FocusOnboardingState = {
  introDismissed: false,
  dismissedAt: null,
};

/** Stable snapshot for useSyncExternalStore (must not allocate every read). */
let cachedRaw: string | null | undefined;
let cachedState: FocusOnboardingState = defaultFocusOnboardingState;

export function loadFocusOnboardingState(): FocusOnboardingState {
  if (typeof window === "undefined") return defaultFocusOnboardingState;
  try {
    const raw = window.localStorage.getItem(FOCUS_ONBOARDING_KEY);
    if (raw === cachedRaw) return cachedState;
    cachedRaw = raw;
    if (!raw) {
      cachedState = defaultFocusOnboardingState;
      return cachedState;
    }
    const parsed = JSON.parse(raw) as Partial<FocusOnboardingState>;
    cachedState = {
      introDismissed: parsed.introDismissed === true,
      dismissedAt:
        typeof parsed.dismissedAt === "string" ? parsed.dismissedAt : null,
    };
    return cachedState;
  } catch {
    cachedRaw = undefined;
    cachedState = defaultFocusOnboardingState;
    return cachedState;
  }
}

export function saveFocusOnboardingState(next: FocusOnboardingState) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(next);
    window.localStorage.setItem(FOCUS_ONBOARDING_KEY, raw);
    cachedRaw = raw;
    cachedState = next;
    window.dispatchEvent(new CustomEvent(FOCUS_ONBOARDING_EVENT));
  } catch {
    // private mode / quota
  }
}

export function dismissFocusOnboarding() {
  saveFocusOnboardingState({
    introDismissed: true,
    dismissedAt: new Date().toISOString(),
  });
}

export function reopenFocusOnboarding() {
  saveFocusOnboardingState({
    introDismissed: false,
    dismissedAt: null,
  });
}

export function subscribeFocusOnboarding(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener(FOCUS_ONBOARDING_EVENT, handler);
  window.addEventListener("storage", (event) => {
    if (event.key === FOCUS_ONBOARDING_KEY || event.key === null) handler();
  });
  return () => {
    window.removeEventListener(FOCUS_ONBOARDING_EVENT, handler);
  };
}

/**
 * Show the first-visit intro only when the user has no Focus history
 * and has not dismissed it on this device.
 */
export function shouldShowFocusIntro(input: {
  hasHistory: boolean;
  introDismissed: boolean;
}): boolean {
  if (input.hasHistory) return false;
  return !input.introDismissed;
}

export type FocusFirstPath =
  | "quick25"
  | "focus50"
  | "stopwatch"
  | "createPreset"
  | "plan:programming"
  | "plan:english"
  | "plan:piano"
  | "plan:reading";
