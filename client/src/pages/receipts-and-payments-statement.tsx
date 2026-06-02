import { useEffect, useMemo, useState } from "react";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer, Landmark, Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { useLocation } from "wouter";
import type { BankStatement, BankTransaction } from "@shared/schema";
import { dedupeTransactions } from "@/lib/txn-dedup";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => inr.format(n);

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function periodLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const first = new Date(y, mo - 1, 1);
  const last = new Date(y, mo, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(first.getDate())}-${pad(mo)}-${y} to ${pad(last.getDate())}-${pad(mo)}-${y}`;
}

type Row = { label: string; amount: number; bold?: boolean; indent?: boolean; linkTo?: string };
type Insight = {
  kind: 'positive' | 'warning' | 'info' | 'critical';
  headline: string;
  detail?: string;
  action?: string;
};

// Categories that move money internally / aren't real income or expense.
const NON_OPERATIONAL = new Set(['Internal Transfer', 'Wife AC', 'Investment addition', 'Investment withdrawal']);

function priorMonthsList(month: string, count: number, available: string[]): string[] {
  return available.filter(m => m < month).sort().slice(-count);
}

export default function ReceiptsAndPaymentsStatementPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const month = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("month") || "";
  }, []);

  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [txnsByStmt, setTxnsByStmt] = useState<Record<number, BankTransaction[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!month) { setError("Missing month parameter."); setLoading(false); return; }
      setLoading(true);
      try {
        const r = await fetch(`/api/bank-statements`, { credentials: "include" });
        if (!r.ok) throw new Error("Failed to load statements");
        const stmts: BankStatement[] = await r.json();
        if (cancelled) return;
        setStatements(stmts);
        const txnEntries = await Promise.all(stmts.map(async s => {
          const rr = await fetch(`/api/bank-statements/${s.id}/transactions`, { credentials: "include" });
          if (!rr.ok) return [s.id, [] as BankTransaction[]] as const;
          const j = await rr.json();
          return [s.id, (j.transactions || []) as BankTransaction[]] as const;
        }));
        if (cancelled) return;
        const map: Record<number, BankTransaction[]> = {};
        for (const [id, list] of txnEntries) map[id] = list;
        setTxnsByStmt(map);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [month]);

  const { receiptsRows, paymentsRows, receiptsTotal, paymentsTotal, hasData } = useMemo(() => {
    // Group all txns by bank+account key, tagged with the source statement for fallback metadata.
    type EnrichedTxn = BankTransaction & { _bankName: string; _account: string | null };
    const byKey = new Map<string, { bankName: string; account: string | null; txns: EnrichedTxn[]; stmtsForMonth: BankStatement[] }>();
    for (const s of statements) {
      const acct = s.accountNumber || null;
      const key = `${s.bankName.toLowerCase().trim()}|${acct ?? ''}`;
      if (!byKey.has(key)) byKey.set(key, { bankName: s.bankName, account: acct, txns: [], stmtsForMonth: [] });
      const bucket = byKey.get(key)!;
      if (s.month === month) bucket.stmtsForMonth.push(s);
      const list = txnsByStmt[s.id] || [];
      for (const t of list) {
        bucket.txns.push({ ...t, _bankName: s.bankName, _account: acct });
      }
    }

    const monthPrefix = month ? `${month}-` : '';
    const isInMonth = (d: string) => !!monthPrefix && d.startsWith(monthPrefix);
    const cmp = (a: EnrichedTxn, b: EnrichedTxn) =>
      a.date.localeCompare(b.date) || (a.rowIndex - b.rowIndex) || (a.id - b.id);

    const openingByBank: { name: string; amount: number }[] = [];
    const closingByBank: { name: string; amount: number }[] = [];
    let openingTotal = 0;
    let closingTotal = 0;

    for (const [, group] of byKey) {
      // Drop duplicate rows within the account before deriving opening/closing
      // (the same statement re-uploaded would otherwise appear twice).
      const sorted = dedupeTransactions([...group.txns].sort(cmp));
      const monthTxns = sorted.filter(t => isInMonth(t.date));
      const hasMonthStmt = group.stmtsForMonth.length > 0;
      if (monthTxns.length === 0 && !hasMonthStmt) continue;

      let opening: number;
      let closing: number;
      if (monthTxns.length > 0) {
        // Derive from the first/last transaction dated within the selected month.
        // The statement record's stored opening/closing reflects the file's range,
        // which may extend before the 1st (a file covering Apr+May uploaded as May
        // would store April's opening) — so it cannot be trusted for month-scoped
        // reporting when in-month transactions are present.
        const first = monthTxns[0];
        const last = monthTxns[monthTxns.length - 1];
        opening = toNum(first.balance) - toNum(first.credit) + toNum(first.debit);
        closing = toNum(last.balance);
      } else {
        // No transactions dated in the month — trust the user-declared opening/
        // closing on the statement tagged with this month.
        opening = group.stmtsForMonth.reduce((sum, s) => sum + toNum(s.openingBalance), 0);
        closing = group.stmtsForMonth.reduce((sum, s) => sum + toNum(s.closingBalance), 0);
      }

      openingByBank.push({ name: group.bankName, amount: opening });
      closingByBank.push({ name: group.bankName, amount: closing });
      openingTotal += opening;
      closingTotal += closing;
    }

    // Category totals are summed from a globally de-duplicated transaction set
    // so a row imported in two statements is counted once.
    const allTxns: EnrichedTxn[] = [];
    for (const [, group] of byKey) allTxns.push(...group.txns);
    const dedupedTxns = dedupeTransactions(allTxns);

    const creditsByCat: Record<string, number> = {};
    const debitsByCat: Record<string, number> = {};
    for (const t of dedupedTxns) {
      if (!isInMonth(t.date)) continue;
      const cat = t.category || "Unclassified";
      const cr = toNum(t.credit);
      const db = toNum(t.debit);
      if (cr > 0) creditsByCat[cat] = (creditsByCat[cat] || 0) + cr;
      if (db > 0) debitsByCat[cat] = (debitsByCat[cat] || 0) + db;
    }

    const hasData = openingByBank.length > 0 || Object.keys(creditsByCat).length > 0 || Object.keys(debitsByCat).length > 0;

    const sortEntries = (obj: Record<string, number>) =>
      Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0]));

    const linkFor = (cat: string, kind: "receipts" | "payments") =>
      `/receipts-and-payments/breakdown?month=${encodeURIComponent(month)}&kind=${kind}&category=${encodeURIComponent(cat)}`;

    const receiptsRows: Row[] = [];
    receiptsRows.push({ label: "Opening Balance", amount: openingTotal, bold: true });
    for (const b of openingByBank) receiptsRows.push({ label: b.name, amount: b.amount, indent: true });
    for (const [cat, amt] of sortEntries(creditsByCat)) {
      receiptsRows.push({ label: cat, amount: amt, linkTo: linkFor(cat, "receipts") });
    }

    const paymentsRows: Row[] = [];
    for (const [cat, amt] of sortEntries(debitsByCat)) {
      paymentsRows.push({ label: cat, amount: amt, linkTo: linkFor(cat, "payments") });
    }
    for (const b of closingByBank) paymentsRows.push({ label: b.name, amount: b.amount, indent: true });
    paymentsRows.push({ label: "Closing Balance", amount: closingTotal, bold: true });

    const receiptsTotal = openingTotal + Object.values(creditsByCat).reduce((a, b) => a + b, 0);
    const paymentsTotal = closingTotal + Object.values(debitsByCat).reduce((a, b) => a + b, 0);

    return { receiptsRows, paymentsRows, receiptsTotal, paymentsTotal, hasData };
  }, [statements, txnsByStmt, month]);

  const insights = useMemo<Insight[]>(() => {
    if (!month) return [];
    type Agg = { credits: number; debits: number; opExpense: number; opIncome: number; byCatCredit: Record<string, number>; byCatDebit: Record<string, number>; unclassified: number };
    const blank = (): Agg => ({ credits: 0, debits: 0, opExpense: 0, opIncome: 0, byCatCredit: {}, byCatDebit: {}, unclassified: 0 });
    const byMonth = new Map<string, Agg>();
    // De-duplicate across all statements so trend comparisons aren't skewed by
    // the same statement imported under more than one month.
    const allTxns = dedupeTransactions(statements.flatMap(s => txnsByStmt[s.id] || []));
    {
      for (const t of allTxns) {
        const m = (t.date || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(m)) continue;
        if (!byMonth.has(m)) byMonth.set(m, blank());
        const agg = byMonth.get(m)!;
        const cr = toNum(t.credit);
        const db = toNum(t.debit);
        const cat = t.category || 'Unclassified';
        if (cr > 0) {
          agg.credits += cr;
          agg.byCatCredit[cat] = (agg.byCatCredit[cat] || 0) + cr;
          if (!NON_OPERATIONAL.has(cat)) agg.opIncome += cr;
        }
        if (db > 0) {
          agg.debits += db;
          agg.byCatDebit[cat] = (agg.byCatDebit[cat] || 0) + db;
          if (!NON_OPERATIONAL.has(cat)) agg.opExpense += db;
        }
        if (cat === 'Unclassified') agg.unclassified += cr + db;
      }
    }

    const cur = byMonth.get(month);
    if (!cur || (cur.credits === 0 && cur.debits === 0)) return [];
    const priors = priorMonthsList(month, 3, Array.from(byMonth.keys()));
    if (priors.length === 0) {
      return [{
        kind: 'info',
        headline: 'No prior-month data to compare against',
        action: 'Upload statements for earlier months to enable trend insights.',
      }];
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const pct = (cur: number, base: number) => base > 0 ? ((cur - base) / base) * 100 : (cur > 0 ? 100 : 0);
    const priorIncome = avg(priors.map(m => byMonth.get(m)!.opIncome));
    const priorExpense = avg(priors.map(m => byMonth.get(m)!.opExpense));
    const results: Insight[] = [];

    // Operating income trend
    if (priorIncome > 0) {
      const change = pct(cur.opIncome, priorIncome);
      if (change >= 10) {
        results.push({
          kind: 'positive',
          headline: `Operating income up ${Math.round(change)}% vs ${priors.length}-month avg`,
          detail: `${fmt(cur.opIncome)} this month vs ${fmt(priorIncome)} average.`,
        });
      } else if (change <= -10) {
        results.push({
          kind: 'warning',
          headline: `Operating income down ${Math.round(-change)}% vs ${priors.length}-month avg`,
          detail: `${fmt(cur.opIncome)} this month vs ${fmt(priorIncome)} average.`,
          action: 'Check the Revenue rows below for client-specific drops and follow up on outstanding invoices.',
        });
      }
    }

    // Operating expense trend
    if (priorExpense > 0) {
      const change = pct(cur.opExpense, priorExpense);
      if (change >= 10) {
        results.push({
          kind: 'warning',
          headline: `Operating expenses up ${Math.round(change)}% vs ${priors.length}-month avg`,
          detail: `${fmt(cur.opExpense)} this month vs ${fmt(priorExpense)} average.`,
          action: 'Inspect the top expense categories below for one-off items or duplicates.',
        });
      } else if (change <= -10) {
        results.push({
          kind: 'positive',
          headline: `Operating expenses down ${Math.round(-change)}% vs ${priors.length}-month avg`,
          detail: `${fmt(cur.opExpense)} this month vs ${fmt(priorExpense)} average.`,
        });
      }
    }

    // Top expense category increases (exclude non-operational)
    type CatDelta = { cat: string; cur: number; prior: number; delta: number; pct: number };
    const expCats = new Set<string>();
    for (const k of Object.keys(cur.byCatDebit)) if (!NON_OPERATIONAL.has(k)) expCats.add(k);
    for (const m of priors) for (const k of Object.keys(byMonth.get(m)!.byCatDebit)) if (!NON_OPERATIONAL.has(k)) expCats.add(k);
    const expChanges: CatDelta[] = [];
    expCats.forEach(cat => {
      const c = cur.byCatDebit[cat] || 0;
      const p = avg(priors.map(m => byMonth.get(m)!.byCatDebit[cat] || 0));
      const delta = c - p;
      if (Math.abs(delta) >= 1000) expChanges.push({ cat, cur: c, prior: p, delta, pct: pct(c, p) });
    });
    expChanges.sort((a, b) => b.delta - a.delta);
    for (const c of expChanges.filter(x => x.delta > 0).slice(0, 2)) {
      const pctTag = c.prior > 0 ? `+${Math.round(c.pct)}%` : 'new this month';
      results.push({
        kind: 'warning',
        headline: `${c.cat} up by ${fmt(c.delta)} (${pctTag})`,
        detail: `${fmt(c.cur)} this month vs ${fmt(c.prior)} prior avg.`,
        action: `Click "${c.cat}" in the Payment column for line-item detail.`,
      });
    }

    // Revenue drops
    const revCats = new Set<string>();
    for (const k of Object.keys(cur.byCatCredit)) if (k.startsWith('Revenue')) revCats.add(k);
    for (const m of priors) for (const k of Object.keys(byMonth.get(m)!.byCatCredit)) if (k.startsWith('Revenue')) revCats.add(k);
    const revDrops: CatDelta[] = [];
    revCats.forEach(cat => {
      const c = cur.byCatCredit[cat] || 0;
      const p = avg(priors.map(m => byMonth.get(m)!.byCatCredit[cat] || 0));
      const delta = c - p;
      if (p > 0 && delta <= -1000) revDrops.push({ cat, cur: c, prior: p, delta, pct: pct(c, p) });
    });
    revDrops.sort((a, b) => a.delta - b.delta);
    for (const c of revDrops.slice(0, 2)) {
      const client = c.cat.replace(/^Revenue\s*-?\s*/i, '').trim() || 'this client';
      results.push({
        kind: 'warning',
        headline: `${c.cat} down ${fmt(-c.delta)} (${Math.round(c.pct)}%)`,
        detail: `${fmt(c.cur)} this month vs ${fmt(c.prior)} prior avg.`,
        action: `Follow up with ${client} on pending invoices or recurring billing.`,
      });
    }

    // Net cash flow
    const netCur = cur.opIncome - cur.opExpense;
    const netPrior = avg(priors.map(m => byMonth.get(m)!.opIncome - byMonth.get(m)!.opExpense));
    if (netCur < 0) {
      results.push({
        kind: netPrior >= 0 ? 'critical' : 'warning',
        headline: `Negative operating cash flow this month (${fmt(netCur)})`,
        detail: `Prior ${priors.length}-month avg was ${fmt(netPrior)}.`,
        action: 'Defer non-essential payments, accelerate collections, or transfer from reserves.',
      });
    }

    // Unclassified flag
    if (cur.unclassified > 0) {
      const totalActivity = cur.credits + cur.debits;
      const share = totalActivity > 0 ? (cur.unclassified / totalActivity) * 100 : 0;
      if (share >= 3) {
        results.push({
          kind: 'info',
          headline: `${fmt(cur.unclassified)} in unclassified transactions (${share.toFixed(1)}% of activity)`,
          action: 'Open the bank statement on the Receipts & Payments page and classify each row, or add a rule in server/bank-txn-rules.ts.',
        });
      }
    }

    return results;
  }, [statements, txnsByStmt, month]);

  if (user?.id !== "PROP") {
    return (
      <AuditLayout>
        <div className="p-6">
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Receipts &amp; Payments is available to the Proprietor only.</p>
          </Card>
        </div>
      </AuditLayout>
    );
  }

  const balanced = Math.abs(receiptsTotal - paymentsTotal) < 0.01;

  return (
    <AuditLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/receipts-and-payments")}>
            <ChevronLeft size={16} className="mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{monthLabel(month)}</span>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer size={14} className="mr-1" /> Print
            </Button>
          </div>
        </div>

        <Card className="p-6 print:shadow-none print:border-0">
          <div className="flex items-center gap-2 mb-4">
            <Landmark size={20} />
            <h1 className="text-lg font-semibold">Receipt and Payment Statement for the Period from {periodLabel(month)}</h1>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">{error}</div>
          ) : !hasData ? (
            <div className="text-center py-8 text-muted-foreground">No transactions dated in {monthLabel(month)} across any uploaded bank statement.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatementColumn title="Receipt" rows={receiptsRows} total={receiptsTotal} totalLabel="Total" />
                <StatementColumn title="Payment" rows={paymentsRows} total={paymentsTotal} totalLabel="Total" />
              </div>
              {!balanced && (
                <div className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 print:hidden">
                  Totals do not match: Receipts {fmt(receiptsTotal)} vs Payments {fmt(paymentsTotal)} (difference {fmt(receiptsTotal - paymentsTotal)}). Check that Internal Transfers are tagged on both legs and every transaction is classified.
                </div>
              )}
            </>
          )}
        </Card>

        {!loading && !error && hasData && insights.length > 0 && (
          <Card className="p-6 print:hidden">
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Lightbulb size={18} className="text-amber-500" />
              Insights &amp; Suggested Actions
            </h2>
            <div className="space-y-2">
              {insights.map((ins, i) => <InsightRow key={i} insight={ins} />)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Compared against the prior 3 months of available data. Non-operational categories (Internal Transfer, Wife AC, Investments) are excluded from income/expense totals.
            </p>
          </Card>
        )}
      </div>
    </AuditLayout>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const styles = {
    positive: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: TrendingUp },
    warning: { wrap: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
    info: { wrap: 'border-slate-200 bg-slate-50 text-slate-800', Icon: Info },
    critical: { wrap: 'border-rose-200 bg-rose-50 text-rose-900', Icon: TrendingDown },
  }[insight.kind];
  const Icon = styles.Icon;
  return (
    <div className={`flex gap-3 p-3 border rounded ${styles.wrap}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{insight.headline}</div>
        {insight.detail && <div className="text-xs mt-0.5 opacity-80">{insight.detail}</div>}
        {insight.action && <div className="text-xs mt-1.5 italic">→ {insight.action}</div>}
      </div>
    </div>
  );
}

function StatementColumn({ title, rows, total, totalLabel }: { title: string; rows: Row[]; total: number; totalLabel: string }) {
  const [, setLocation] = useLocation();
  return (
    <div className="border rounded overflow-hidden">
      <div className="grid grid-cols-[1fr_auto] bg-slate-800 text-white text-sm font-semibold px-3 py-2">
        <span>{title}</span>
        <span>Amount (Rs)</span>
      </div>
      <div className="divide-y">
        {rows.map((r, i) => {
          const className = `grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm w-full text-left ${r.bold ? "font-semibold" : ""} ${r.linkTo ? "hover:bg-slate-50 cursor-pointer print:hover:bg-transparent" : ""}`;
          const content = (
            <>
              <span className={r.indent ? "pl-4 text-muted-foreground" : ""}>
                {r.label}
                {r.linkTo && <span className="ml-1 text-xs text-blue-600 print:hidden">›</span>}
              </span>
              <span className="tabular-nums text-right">{fmt(r.amount)}</span>
            </>
          );
          if (r.linkTo) {
            return (
              <button
                key={`${title}-${i}-${r.label}`}
                type="button"
                className={className}
                onClick={() => setLocation(r.linkTo!)}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={`${title}-${i}-${r.label}`} className={className}>
              {content}
            </div>
          );
        })}
        <div className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm font-bold bg-slate-50">
          <span>{totalLabel}</span>
          <span className="tabular-nums text-right">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
