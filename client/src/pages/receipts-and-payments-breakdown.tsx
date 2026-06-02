import { useEffect, useMemo, useState } from "react";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer, Landmark } from "lucide-react";
import { useLocation } from "wouter";
import type { BankStatement, BankTransaction } from "@shared/schema";

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

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

type Item = {
  txnId: number;
  date: string;
  bankName: string;
  account: string | null;
  narration: string;
  amount: number;
};

export default function ReceiptsAndPaymentsBreakdownPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { month, category, kind } = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return {
      month: sp.get("month") || "",
      category: sp.get("category") || "",
      kind: ((sp.get("kind") || "receipts") === "payments" ? "payments" : "receipts") as "receipts" | "payments",
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [txnsByStmt, setTxnsByStmt] = useState<Record<number, BankTransaction[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!month || !category) { setError("Missing month or category parameter."); setLoading(false); return; }
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
  }, [month, category]);

  const { items, total } = useMemo(() => {
    const monthPrefix = month ? `${month}-` : "";
    const isInMonth = (d: string) => !!monthPrefix && d.startsWith(monthPrefix);
    const out: Item[] = [];
    for (const s of statements) {
      const list = txnsByStmt[s.id] || [];
      for (const t of list) {
        if (!isInMonth(t.date)) continue;
        const cat = t.category || "Unclassified";
        if (cat !== category) continue;
        const amt = kind === "receipts" ? toNum(t.credit) : toNum(t.debit);
        if (amt <= 0) continue;
        out.push({
          txnId: t.id,
          date: t.date,
          bankName: s.bankName,
          account: s.accountNumber || null,
          narration: t.narration,
          amount: amt,
        });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || a.bankName.localeCompare(b.bankName) || a.txnId - b.txnId);
    const total = out.reduce((s, r) => s + r.amount, 0);
    return { items: out, total };
  }, [statements, txnsByStmt, month, category, kind]);

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

  const back = () => setLocation(`/receipts-and-payments/statement?month=${encodeURIComponent(month)}`);
  const kindLabel = kind === "receipts" ? "Receipts" : "Payments";

  return (
    <AuditLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
          <Button variant="ghost" size="sm" onClick={back}>
            <ChevronLeft size={16} className="mr-1" /> Back to Statement
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{monthLabel(month)}</span>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer size={14} className="mr-1" /> Print
            </Button>
          </div>
        </div>

        <Card className="p-6 print:shadow-none print:border-0">
          <div className="flex items-center gap-2 mb-1">
            <Landmark size={20} />
            <h1 className="text-lg font-semibold">{category}</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {kindLabel} · {monthLabel(month)} · {items.length} {items.length === 1 ? "entry" : "entries"} across {new Set(items.map(i => `${i.bankName}|${i.account ?? ""}`)).size} bank account{new Set(items.map(i => `${i.bankName}|${i.account ?? ""}`)).size === 1 ? "" : "s"}
          </p>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No transactions match {category} in {monthLabel(month)}.</div>
          ) : (
            <div className="border rounded overflow-hidden">
              <div className="grid grid-cols-[6rem_minmax(7rem,1fr)_minmax(8rem,1.4fr)_minmax(0,3fr)_auto] gap-3 bg-slate-800 text-white text-xs font-semibold px-3 py-2">
                <span>Date</span>
                <span>Bank</span>
                <span>Account</span>
                <span>Narration</span>
                <span className="text-right">Amount (Rs)</span>
              </div>
              <div className="divide-y">
                {items.map(it => (
                  <div
                    key={it.txnId}
                    className="grid grid-cols-[6rem_minmax(7rem,1fr)_minmax(8rem,1.4fr)_minmax(0,3fr)_auto] gap-3 px-3 py-2 text-sm"
                  >
                    <span className="tabular-nums text-muted-foreground">{fmtDate(it.date)}</span>
                    <span>{it.bankName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{it.account ?? "—"}</span>
                    <span className="text-muted-foreground break-words">{it.narration || "—"}</span>
                    <span className="tabular-nums text-right">{fmt(it.amount)}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[6rem_minmax(7rem,1fr)_minmax(8rem,1.4fr)_minmax(0,3fr)_auto] gap-3 px-3 py-2 text-sm font-bold bg-slate-50">
                  <span className="col-span-4">Total</span>
                  <span className="tabular-nums text-right">{fmt(total)}</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AuditLayout>
  );
}
