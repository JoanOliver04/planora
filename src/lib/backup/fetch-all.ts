const PAGE_SIZE = 1_000;
const MAX_EXPORT_ROWS = 100_000;

export async function fetchAllRows<Row>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
) {
  const rows: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
    if (rows.length >= MAX_EXPORT_ROWS)
      throw new Error("Export is too large to complete safely");
    from += PAGE_SIZE;
  }
}
