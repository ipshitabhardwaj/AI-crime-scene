import "server-only";

/**
 * Supabase's API returns at most 1,000 rows per request by default.
 * With 70 teams × 18 evidence items the tag table alone is ~1,300 rows,
 * so every "read all rows" query must page. Pass a function that builds
 * the query for a given range; rows are fetched until a short page arrives.
 */
type PageResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function selectAll<T>(page: (from: number, to: number) => PageResult, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data: raw, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const data = (raw ?? []) as T[];
    out.push(...data);
    if (data.length < pageSize) return out;
  }
}
