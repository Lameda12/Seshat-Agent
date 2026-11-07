import { RequestError } from "./security";
export type ExportPage = { rows: unknown[]; total: number };
// Do not assume PostgREST returns the requested page size: project row caps differ.
export async function collectExportPages(
  read: (offset: number) => Promise<ExportPage>,
  maxRows = 10000,
  maxBytes = 5000000,
) {
  const rows: unknown[] = [];
  let total: number | undefined;
  let bytes = 0;
  while (true) {
    const page = await read(rows.length);
    if (total !== undefined && page.total !== total)
      throw new RequestError(409, "Data changed during export; retry");
    total = page.total;
    if (total > maxRows)
      throw new RequestError(413, "Use paginated export for large tables");
    if (!page.rows.length && rows.length < total)
      throw new RequestError(503, "Export would be incomplete");
    for (const row of page.rows) {
      bytes += new TextEncoder().encode(JSON.stringify(row)).length;
      if (bytes > maxBytes)
        throw new RequestError(413, "Use paginated export for large tables");
      rows.push(row);
    }
    if (rows.length >= total) return rows;
  }
}
