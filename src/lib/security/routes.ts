const privateSegments = new Set([
  "today",
  "week",
  "tasks",
  "events",
  "history",
  "statistics",
  "reminders",
  "schedules",
  "categories",
  "templates",
  "settings",
  "data",
  "more",
]);

export function isPrivateAppPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length >= 2 &&
    (segments[0] === "es" || segments[0] === "en") &&
    privateSegments.has(segments[1])
  );
}
