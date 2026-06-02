// De-duplication of bank transactions for the Receipts & Payments statement.
//
// The same statement file can end up imported twice — e.g. a running statement
// that spans several months uploaded once tagged "May" and again tagged "June",
// or re-uploaded with the bank name typed in a different case. Because each
// upload becomes its own statement record, the shared rows get stored twice and
// the consolidated Receipts & Payments statement would double-count them.
//
// Bank narrations carry highly specific references (UPI/IMPS/RTGS/cheque numbers)
// and every row carries a running balance, so two rows that share the same date,
// narration, debit, credit AND balance are — in practice — the very same ledger
// line re-imported, not two coincidentally-identical transactions. We collapse
// such rows to a single entry wherever the statement is drawn.

type DedupeFields = {
  date?: string | null;
  narration?: string | null;
  debit?: string | number | null;
  credit?: string | number | null;
  balance?: string | number | null;
};

export function transactionDedupeKey(t: DedupeFields): string {
  const num = (x: unknown) =>
    x == null || x === "" ? "" : String(Math.round(parseFloat(String(x)) * 100));
  return [
    (t.date || "").slice(0, 10),
    (t.narration || "").trim().toLowerCase().replace(/\s+/g, " "),
    num(t.debit),
    num(t.credit),
    num(t.balance),
  ].join("|");
}

// Returns a new array with duplicate transactions removed, keeping the first
// occurrence. Order is preserved.
export function dedupeTransactions<T extends DedupeFields>(txns: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of txns) {
    const key = transactionDedupeKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
