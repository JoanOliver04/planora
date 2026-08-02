export type NotificationPreferences = {
  tasks: boolean;
  events: boolean;
  summaries: boolean;
  alarms: boolean;
  inApp: boolean;
  system: boolean;
  sound: boolean;
  vibration: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  tasks: true,
  events: true,
  summaries: true,
  alarms: true,
  inApp: true,
  system: true,
  sound: true,
  vibration: true,
};

const storageKey = "planora-notification-preferences-v1";

export function loadNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return defaultNotificationPreferences;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return { ...defaultNotificationPreferences, ...saved };
  } catch {
    return defaultNotificationPreferences;
  }
}

export function saveNotificationPreferences(value: NotificationPreferences) {
  localStorage.setItem(storageKey, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("planora-notification-preferences"));
}
