export function mergeRowsById<T extends { id: string }>(
  base: T[],
  incoming: T[],
) {
  const result = new Map(base.map((item) => [item.id, item]));
  incoming.forEach((item) => result.set(item.id, item));
  return [...result.values()];
}
