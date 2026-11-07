import Papa from "papaparse";
import { money, transaction, Transaction } from "./engine";
export type Mapping = {
  date: string;
  amount: string;
  merchant: string;
  category: string;
};
export function preview(text: string, mapping: Mapping, currency: string) {
  if (new TextEncoder().encode(text).length > 1_000_000)
    throw Error("CSV must be under 1 MB");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.data.length > 2000) throw Error("Maximum 2000 rows");
  const errors = parsed.errors.map(
    (e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`,
  );
  const rows: Transaction[] = [];
  parsed.data.forEach((raw, i) => {
    try {
      const amount = money(raw[mapping.amount] ?? "");
      const row = transaction.parse({
        id: `row-${i}`,
        date: raw[mapping.date],
        amount,
        currency,
        merchant: raw[mapping.merchant],
        category: raw[mapping.category] || "Uncategorized",
        kind: amount < 0 ? "purchase" : "income",
        account: "cash",
        pending: false,
        source: JSON.stringify(raw),
      });
      rows.push(row);
    } catch {
      errors.push(`Row ${i + 2}: invalid date, amount, or merchant`);
    }
  });
  return { rows, errors, headers: parsed.meta.fields ?? [], raw: text };
}
export async function fileId(text: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(hash), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export function mergeImport(
  existing: Transaction[],
  rows: Transaction[],
  hash: string,
) {
  if (existing.some((t) => t.id.startsWith(hash + ":"))) return existing;
  if (existing.length + rows.length > 10000)
    throw Error("Maximum 10000 transactions per budget");
  return [...existing, ...rows.map((t, i) => ({ ...t, id: `${hash}:${i}` }))];
}
