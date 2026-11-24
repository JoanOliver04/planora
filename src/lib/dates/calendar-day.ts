export function isCalendarDay(value: string | null): value is string {
  if (!value || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
  );
}

export function shiftCalendarDay(value: string, days: number) {
  const instant = new Date(`${value}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}
