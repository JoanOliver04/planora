/** Keep read/modify/write operations on shared browser storage together. */
export async function withOfflineLock<T>(
  name: string,
  work: () => T | Promise<T>,
): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("planora:" + name, work);
  }
  return work();
}
