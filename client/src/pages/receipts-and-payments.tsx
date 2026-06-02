import { useEffect, useMemo, useState } from "react";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Paperclip, Trash2, Upload, ChevronLeft, Landmark, FileText, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { BANK_TXN_CATEGORIES, type BankStatement, type BankTransaction } from "@shared/schema";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const fmt = (n: number | string) => inr.format(typeof n === "string" ? parseFloat(n) || 0 : n);

function monthISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthOptions(count = 12) {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ value: monthISO(d), label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }) });
  }
  return out;
}

export default function ReceiptsAndPaymentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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

  const months = useMemo(() => monthOptions(12), []);
  const [month, setMonth] = useState(monthISO());

  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [stmtsLoading, setStmtsLoading] = useState(false);
  const [selectedStmtId, setSelectedStmtId] = useState<number | null>(null);
  const [selectedStmt, setSelectedStmt] = useState<BankStatement | null>(null);
  const [stmtTxns, setStmtTxns] = useState<BankTransaction[]>([]);
  const [stmtDetailLoading, setStmtDetailLoading] = useState(false);
  const [pendingTxnChanges, setPendingTxnChanges] = useState<Record<number, { category?: string; comment?: string }>>({});
  const [savingTxns, setSavingTxns] = useState(false);
  const [uBank, setUBank] = useState("");
  const [uOpening, setUOpening] = useState("");
  const [uFile, setUFile] = useState<File | null>(null);
  const [uSubmitting, setUSubmitting] = useState(false);

  async function loadStatements() {
    setStmtsLoading(true);
    try {
      const r = await fetch(`/api/bank-statements?month=${month}`, { credentials: "include" });
      if (r.ok) setStatements(await r.json());
      else setStatements([]);
    } finally {
      setStmtsLoading(false);
    }
  }
  async function loadStatementDetail(id: number) {
    setStmtDetailLoading(true);
    try {
      const r = await fetch(`/api/bank-statements/${id}/transactions`, { credentials: "include" });
      if (r.ok) {
        const j = await r.json();
        setSelectedStmt(j.statement);
        setStmtTxns(j.transactions);
      }
    } finally {
      setStmtDetailLoading(false);
    }
  }
  async function tryAutofillOpening(bank: string) {
    const b = bank.trim();
    if (!b || !/^\d{4}-\d{2}$/.test(month)) return;
    const r = await fetch(`/api/bank-statements/prev-closing?bank=${encodeURIComponent(b)}&month=${month}`, { credentials: "include" });
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.closingBalance != null && !uOpening) setUOpening(String(j.closingBalance));
  }
  async function submitStatement() {
    if (!uBank.trim() || !uFile) {
      toast({ title: "Bank name and file are required", variant: "destructive" }); return;
    }
    setUSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("bankName", uBank.trim());
      fd.append("month", month);
      if (uOpening) fd.append("openingBalance", uOpening);
      fd.append("statement", uFile);
      const r = await fetch("/api/bank-statements", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Upload failed");
      const result = await r.json().catch(() => ({} as any));
      if (result?.merged) {
        const desc = `${result.appended} new txn${result.appended === 1 ? '' : 's'} added` +
          (result.skippedDuplicates > 0 ? `, ${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? '' : 's'} skipped` : '');
        toast({ title: "Merged into existing account", description: desc });
      } else {
        toast({ title: "Statement uploaded and parsed" });
      }
      setUBank(""); setUOpening(""); setUFile(null);
      const fi = document.getElementById("stmt-file") as HTMLInputElement | null;
      if (fi) fi.value = "";
      loadStatements();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUSubmitting(false);
    }
  }
  function queueTxnChange(id: number, patch: { category?: string; comment?: string }) {
    setStmtTxns(prev => prev.map(t => t.id === id ? { ...t, ...patch } as BankTransaction : t));
    setPendingTxnChanges(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }
  async function saveTxnChanges(): Promise<boolean> {
    const entries = Object.entries(pendingTxnChanges);
    if (entries.length === 0) return true;
    setSavingTxns(true);
    const failed: number[] = [];
    await Promise.all(entries.map(async ([idStr, patch]) => {
      const id = Number(idStr);
      try {
        const r = await fetch(`/api/bank-transactions/${id}`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!r.ok) failed.push(id);
      } catch { failed.push(id); }
    }));
    setSavingTxns(false);
    if (failed.length === 0) {
      setPendingTxnChanges({});
      toast({ title: `Saved ${entries.length} change${entries.length === 1 ? '' : 's'}` });
      return true;
    }
    const failedSet = new Set(failed);
    setPendingTxnChanges(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => failedSet.has(Number(k)))));
    toast({ title: `${entries.length - failed.length} saved, ${failed.length} failed`, variant: "destructive" });
    if (selectedStmtId != null) loadStatementDetail(selectedStmtId);
    return false;
  }
  async function patchStatement(id: number, patch: { bankName?: string; accountNumber?: string | null; openingBalance?: number; closingBalance?: number }) {
    setStatements(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next: any = { ...s };
      if (patch.bankName !== undefined) next.bankName = patch.bankName;
      if (patch.accountNumber !== undefined) next.accountNumber = patch.accountNumber;
      if (patch.openingBalance !== undefined) next.openingBalance = String(patch.openingBalance);
      if (patch.closingBalance !== undefined) next.closingBalance = String(patch.closingBalance);
      return next;
    }));
    const r = await fetch(`/api/bank-statements/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      toast({ title: "Save failed", description: (await r.json().catch(() => ({}))).error, variant: "destructive" });
      loadStatements();
    }
  }
  async function reclassifyStatement(id: number) {
    const r = await fetch(`/api/bank-statements/${id}/reclassify`, { method: "POST", credentials: "include" });
    if (!r.ok) {
      toast({ title: "Reclassify failed", description: (await r.json().catch(() => ({}))).error, variant: "destructive" });
      return;
    }
    const j = await r.json();
    toast({ title: `Re-applied rules`, description: `${j.updated} of ${j.total} transactions updated.` });
    loadStatementDetail(id);
  }
  async function deleteStatement(id: number) {
    if (!confirm("Delete this bank statement and all its transactions?")) return;
    const r = await fetch(`/api/bank-statements/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) {
      toast({ title: "Deleted" });
      if (selectedStmtId === id) { setSelectedStmtId(null); setSelectedStmt(null); setStmtTxns([]); }
      loadStatements();
    }
  }

  const sortedTxns = useMemo(() => {
    const isUnclassified = (t: BankTransaction) => !t.category || t.category === 'Unclassified';
    return [...stmtTxns].sort((a, b) => {
      const au = isUnclassified(a) ? 0 : 1;
      const bu = isUnclassified(b) ? 0 : 1;
      if (au !== bu) return au - bu;
      return (a.rowIndex - b.rowIndex) || (a.id - b.id);
    });
  }, [stmtTxns]);

  useEffect(() => { loadStatements(); /* eslint-disable-next-line */ }, [month]);
  useEffect(() => {
    setPendingTxnChanges({});
    if (selectedStmtId != null) loadStatementDetail(selectedStmtId);
    else { setSelectedStmt(null); setStmtTxns([]); }
    /* eslint-disable-next-line */
  }, [selectedStmtId]);

  useEffect(() => {
    const hasPending = Object.keys(pendingTxnChanges).length > 0;
    if (!hasPending) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingTxnChanges]);

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Landmark size={22} /> Receipts &amp; Payments</h1>
            <p className="text-muted-foreground">Upload monthly bank statements and classify each transaction.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Month:</Label>
              <Select value={month} onValueChange={(m) => { setSelectedStmtId(null); setMonth(m); }}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="default"
              className="w-[228px]"
              onClick={() => setLocation(`/receipts-and-payments/statement?month=${month}`)}
            >
              <FileText size={14} className="mr-1" /> Draw Receipts and Payments AC
            </Button>
          </div>
        </div>

        {selectedStmtId == null ? (
          <>
            <Card className="p-4">
              <h2 className="font-semibold mb-1 flex items-center gap-2"><Upload size={16} /> Upload bank statement</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Upload a CSV or Excel file for the selected month. Account number is auto-extracted from the file. Opening balance auto-fills from the previous month's closing for the same bank. Edit account number or balances inline in the table below after upload.
              </p>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Bank name</Label>
                  <Input
                    value={uBank}
                    onChange={e => setUBank(e.target.value)}
                    onBlur={e => tryAutofillOpening(e.target.value)}
                    placeholder="e.g., HDFC - Current"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Opening balance (₹)</Label>
                  <Input
                    type="number" step="0.01" value={uOpening}
                    onChange={e => setUOpening(e.target.value)}
                    placeholder="auto-detected"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">File (.csv / .xls / .xlsx)</Label>
                  <Input id="stmt-file" type="file" accept=".csv,.xls,.xlsx" onChange={e => setUFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={submitStatement} disabled={uSubmitting}>
                    {uSubmitting ? "Uploading…" : "Upload"}
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account no.</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stmtsLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : statements.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No bank statements uploaded for this month.</TableCell></TableRow>
                  ) : statements.map(s => (
                    <TableRow key={s.id} className="hover:bg-slate-50">
                      <TableCell
                        className="font-medium cursor-pointer text-blue-700 hover:underline"
                        onClick={() => setSelectedStmtId(s.id)}
                      >
                        {s.bankName}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs font-mono w-32"
                          defaultValue={s.accountNumber ?? ''}
                          placeholder="—"
                          onClick={e => e.stopPropagation()}
                          onBlur={e => {
                            const v = e.target.value.trim();
                            if (v !== (s.accountNumber ?? '')) patchStatement(s.id, { accountNumber: v || null });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="h-8 text-xs text-right"
                          type="number" step="0.01"
                          defaultValue={s.openingBalance}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => {
                            const n = parseFloat(e.target.value);
                            if (Number.isFinite(n) && n !== parseFloat(String(s.openingBalance))) {
                              patchStatement(s.id, { openingBalance: n });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="h-8 text-xs text-right font-semibold"
                          type="number" step="0.01"
                          defaultValue={s.closingBalance}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => {
                            const n = parseFloat(e.target.value);
                            if (Number.isFinite(n) && n !== parseFloat(String(s.closingBalance))) {
                              patchStatement(s.id, { closingBalance: n });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {s.sourceFileUrl && (
                          <a href={s.sourceFileUrl} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                            <Paperclip size={14} /> file
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={e => { e.stopPropagation(); deleteStatement(s.id); }}>
                          <Trash2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                disabled={savingTxns}
                onClick={async () => {
                  // Auto-save any pending classification edits before navigating
                  // back. If a save fails, stay on the page so the user can see
                  // the failure (saveTxnChanges keeps failed entries in state).
                  const ok = await saveTxnChanges();
                  if (!ok) return;
                  setSelectedStmtId(null);
                }}
              >
                <ChevronLeft size={16} className="mr-1" /> Back to statements
              </Button>
              <div className="flex items-center gap-3 flex-wrap">
                {selectedStmt && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{selectedStmt.bankName}</span>
                    {selectedStmt.accountNumber && <> · A/c <span className="font-mono text-foreground">{selectedStmt.accountNumber}</span></>} ·
                    Opening <span className="font-medium">{fmt(selectedStmt.openingBalance)}</span> ·
                    Closing <span className="font-semibold text-foreground">{fmt(selectedStmt.closingBalance)}</span>
                  </div>
                )}
                <Button
                  size="sm"
                  variant={Object.keys(pendingTxnChanges).length > 0 ? "default" : "outline"}
                  disabled={Object.keys(pendingTxnChanges).length === 0 || savingTxns}
                  onClick={saveTxnChanges}
                >
                  <Save size={14} className="mr-1" />
                  {savingTxns
                    ? "Saving…"
                    : Object.keys(pendingTxnChanges).length > 0
                      ? `Save (${Object.keys(pendingTxnChanges).length})`
                      : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingTxns}
                  onClick={() => {
                    if (Object.keys(pendingTxnChanges).length > 0) {
                      if (!confirm("You have unsaved changes. Save before re-applying rules? Click Cancel to discard.")) {
                        setPendingTxnChanges({});
                      } else {
                        saveTxnChanges().then(() => { if (selectedStmtId != null) reclassifyStatement(selectedStmtId); });
                        return;
                      }
                    }
                    if (selectedStmtId != null) reclassifyStatement(selectedStmtId);
                  }}
                >
                  Re-apply rules
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <strong>Rule:</strong> any transfer between your own bank accounts must be classified as <em>Internal Transfer</em> (both legs — the debit on the source account and the matching credit on the destination).
            </div>

            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="min-w-[210px]">Classification</TableHead>
                    <TableHead className="min-w-[180px]">Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stmtDetailLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : sortedTxns.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No transactions.</TableCell></TableRow>
                  ) : sortedTxns.map(t => {
                    const isUnclassified = !t.category || t.category === 'Unclassified';
                    return (
                    <TableRow key={t.id} className={isUnclassified ? '' : 'bg-slate-50/60 text-muted-foreground'}>
                      <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                      <TableCell className="text-sm">{t.narration}</TableCell>
                      <TableCell className="text-right text-red-700">{t.debit ? fmt(t.debit) : "—"}</TableCell>
                      <TableCell className="text-right text-green-700">{t.credit ? fmt(t.credit) : "—"}</TableCell>
                      <TableCell className="text-right">{t.balance ? fmt(t.balance) : "—"}</TableCell>
                      <TableCell>
                        <Select value={t.category} onValueChange={(v) => queueTxnChange(t.id, { category: v })}>
                          <SelectTrigger className={`h-8 text-xs ${pendingTxnChanges[t.id]?.category !== undefined ? 'ring-2 ring-amber-400' : ''}`}><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72 overflow-y-auto">
                            {BANK_TXN_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className={`h-8 text-xs ${pendingTxnChanges[t.id]?.comment !== undefined ? 'ring-2 ring-amber-400' : ''}`}
                          defaultValue={t.comment}
                          onBlur={(e) => { if (e.target.value !== t.comment) queueTxnChange(t.id, { comment: e.target.value }); }}
                          placeholder="(optional)"
                        />
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </AuditLayout>
  );
}
