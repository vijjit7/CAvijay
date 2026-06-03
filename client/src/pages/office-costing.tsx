import { useEffect, useMemo, useState } from "react";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/lib/audit-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, IndianRupee, Paperclip, Trash2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EXPENSE_CATEGORIES, PAYMENT_MODES, type Expense, type ExpenseStatus, type ExpensePayment } from "@shared/schema";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const fmt = (n: number | string) => inr.format(typeof n === "string" ? parseFloat(n) || 0 : n);

const statusVariant: Record<ExpenseStatus, { label: string; cls: string }> = {
  pending:  { label: "Pending",  cls: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", cls: "bg-blue-100 text-blue-800" },
  paid:     { label: "Paid",     cls: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-800" },
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Manual part-payment helpers: total recorded against a bill and the net still due.
const paymentsOf = (e: Expense): ExpensePayment[] => (e.payments as ExpensePayment[] | undefined) ?? [];
const paidSum = (e: Expense) => paymentsOf(e).reduce((s, p) => s + (Number(p.amount) || 0), 0);
const netDue = (e: Expense) => Math.max(0, (parseFloat(String(e.amount)) || 0) - paidSum(e));
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

export default function OfficeCostingPage() {
  const { user } = useAuth();
  const { associates } = useAudit();
  const { toast } = useToast();

  const isApprover = user?.id === "ADMIN" || user?.id === "PROP";
  if (!isApprover) {
    return (
      <AuditLayout>
        <div className="p-6">
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Office Costing is available to approvers only.</p>
          </Card>
        </div>
      </AuditLayout>
    );
  }

  const APPROVER_LABEL: Record<string, string> = { ADMIN: "Admin", PROP: "Vijay Togaru" };
  const myId = user!.id;
  const otherApproverId = myId === "ADMIN" ? "PROP" : "ADMIN";
  const ADMIN_SELF_APPROVE_LIMIT = 200;

  const months = useMemo(() => monthOptions(12), []);
  const [tab, setTab] = useState("approvals");
  const [month, setMonth] = useState(monthISO());

  // Approvals tab state
  const [statusFilter, setStatusFilter] = useState<"all" | ExpenseStatus>("pending");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [rejecting, setRejecting] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Per-bill payments view (read-only — money flows in via bulk payments)
  const [viewing, setViewing] = useState<Expense | null>(null);

  // Balance summary (outstanding owed + unadjusted advance/credit)
  const [balance, setBalance] = useState<{ outstandingTotal: number; creditBalance: number; bulkPayments: any[] }>({
    outstandingTotal: 0, creditBalance: 0, bulkPayments: [],
  });

  // Bulk (lump-sum) payment dialog state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(todayISO());
  const [bulkVia, setBulkVia] = useState<string>(PAYMENT_MODES[0]);
  const [bulkAmt, setBulkAmt] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ recorded: number; allocatedCount: number; creditBalance: number } | null>(null);

  // My Submissions tab state
  const [own, setOwn] = useState<Expense[]>([]);
  const [ownLoading, setOwnLoading] = useState(true);
  const [oDate, setODate] = useState(todayISO());
  const [oCat, setOCat] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [oAmt, setOAmt] = useState("");
  const [oDesc, setODesc] = useState("");
  const [oApprover, setOApprover] = useState<string>(myId);  // default: self
  const [oFile, setOFile] = useState<File | null>(null);
  const [oSubmitting, setOSubmitting] = useState(false);

  const oAmtNum = parseFloat(oAmt);
  const adminSelfBlocked = myId === "ADMIN" && Number.isFinite(oAmtNum) && oAmtNum > ADMIN_SELF_APPROVE_LIMIT;
  const APPROVER_OPTIONS = [
    { id: myId, label: `${APPROVER_LABEL[myId]} (self)`, disabled: adminSelfBlocked },
    { id: otherApproverId, label: APPROVER_LABEL[otherApproverId], disabled: false },
  ];
  useEffect(() => {
    if (adminSelfBlocked && oApprover === myId) setOApprover(otherApproverId);
  }, [adminSelfBlocked, oApprover, myId, otherApproverId]);

  // Monthly report state
  const [report, setReport] = useState<any | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [summary, setSummary] = useState<{ month: string; label: string; own: number; reimbursement: number; total: number }[]>([]);

  async function loadApprovals() {
    setLoadingApprovals(true);
    try {
      const params = new URLSearchParams({ month });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (userFilter !== "all") params.set("userId", userFilter);
      const [r, all] = await Promise.all([
        fetch(`/api/expenses?${params}`, { credentials: "include" }),
        fetch(`/api/expenses?month=${month}`, { credentials: "include" }),
      ]);
      if (r.ok) setAllExpenses(await r.json());
      if (all.ok) setMonthExpenses(await all.json());
    } finally {
      setLoadingApprovals(false);
    }
  }
  async function loadOwn() {
    setOwnLoading(true);
    try {
      const r = await fetch(`/api/expenses/mine?month=${month}`, { credentials: "include" });
      if (r.ok) setOwn(await r.json());
    } finally {
      setOwnLoading(false);
    }
  }
  async function loadReport() {
    setReportLoading(true);
    try {
      const [r, s] = await Promise.all([
        fetch(`/api/expenses/monthly?month=${month}`, { credentials: "include" }),
        fetch(`/api/expenses/summary?months=12`, { credentials: "include" }),
      ]);
      if (r.ok) setReport(await r.json());
      if (s.ok) { const j = await s.json(); setSummary(j.months || []); }
    } finally {
      setReportLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "approvals") { loadApprovals(); loadBalance(); }
    else if (tab === "own") loadOwn();
    else if (tab === "report") loadReport();
    /* eslint-disable-next-line */
  }, [tab, month, statusFilter, userFilter]);

  async function act(id: number, action: "approve" | "mark-paid") {
    const r = await fetch(`/api/expenses/${id}/${action}`, { method: "PATCH", credentials: "include" });
    if (r.ok) { toast({ title: action === "approve" ? "Approved" : "Marked paid" }); loadApprovals(); }
    else { const e = await r.json().catch(() => ({})); toast({ title: "Action failed", description: e.error, variant: "destructive" }); }
  }
  async function reject() {
    if (!rejecting) return;
    if (!rejectReason.trim()) { toast({ title: "Reason required", variant: "destructive" }); return; }
    const r = await fetch(`/api/expenses/${rejecting.id}/reject`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    if (r.ok) { toast({ title: "Rejected" }); setRejecting(null); setRejectReason(""); loadApprovals(); }
    else { const e = await r.json().catch(() => ({})); toast({ title: "Reject failed", description: e.error, variant: "destructive" }); }
  }
  async function delAdmin(id: number) {
    if (!confirm("Delete this expense?")) return;
    const r = await fetch(`/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast({ title: "Deleted" }); loadApprovals(); loadOwn(); }
  }

  async function loadBalance() {
    const r = await fetch(`/api/expenses/balance`, { credentials: "include" });
    if (r.ok) setBalance(await r.json());
  }
  function openBulk() {
    setBulkDate(todayISO());
    setBulkVia(PAYMENT_MODES[0]);
    setBulkAmt("");
    setBulkResult(null);
    setBulkSubmitting(false);
    setBulkOpen(true);
  }
  async function recordBulk() {
    const amt = parseFloat(bulkAmt);
    if (!bulkDate) { toast({ title: "Payment date required", variant: "destructive" }); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setBulkSubmitting(true);
    try {
      const r = await fetch(`/api/expenses/bulk-payment`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: bulkDate, paidVia: bulkVia, amount: amt }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setBulkResult({ recorded: data.recorded, allocatedCount: data.allocatedCount, creditBalance: data.creditBalance });
        toast({ title: "Payment recorded", description: `Cleared ${data.allocatedCount} bill(s) FIFO. Advance left: ${fmt(data.creditBalance)}` });
        loadApprovals();
        loadBalance();
      } else {
        toast({ title: "Payment failed", description: data.error, variant: "destructive" });
      }
    } finally {
      setBulkSubmitting(false);
    }
  }

  async function submitOwn() {
    if (!oDate || !oCat || !oAmt) {
      toast({ title: "Missing fields", variant: "destructive" }); return;
    }
    const amt = parseFloat(oAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" }); return;
    }
    if (!oFile && !oDesc.trim()) {
      toast({
        title: "Soft copy or reason required",
        description: "Attach a soft copy of the bill, or describe the reason why the soft copy is not available.",
        variant: "destructive",
      });
      return;
    }
    setOSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("date", oDate);
      fd.append("category", oCat);
      fd.append("amount", String(amt));
      fd.append("description", oDesc);
      fd.append("approverId", oApprover);
      if (oFile) fd.append("bill", oFile);
      const r = await fetch("/api/expenses", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed");
      toast({ title: oApprover === myId ? "Saved (auto-approved)" : `Sent to ${APPROVER_LABEL[oApprover]} for approval` });
      setOAmt(""); setODesc(""); setOFile(null);
      const fi = document.getElementById("own-file") as HTMLInputElement | null;
      if (fi) fi.value = "";
      loadOwn();
      if (tab === "approvals") loadApprovals();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setOSubmitting(false);
    }
  }

  function exportCSV() {
    if (!report) return;
    const rows: string[][] = [["Date","User","Nature","Description","Amount (INR)","Status","Own Cost"]];
    for (const e of report.entries as Expense[]) {
      rows.push([e.date, userName(e.userId), e.category, e.description || "", String(e.amount), e.status, e.isOwnCost ? "yes" : "no"]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `office-costing-${report.month}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const allUsersForFilter = useMemo(() => {
    const list = [
      { id: "ADMIN", name: "Admin" },
      { id: "PROP",  name: "Vijay Togaru" },
      ...associates.map((a: any) => ({ id: a.id, name: a.name })),
    ];
    return list;
  }, [associates]);

  function userName(id: string) {
    if (APPROVER_LABEL[id]) return APPROVER_LABEL[id];
    return associates.find((a: any) => a.id === id)?.name || id;
  }

  // All bills the admin has approved this month (approved + already paid),
  // computed across the whole month regardless of the table's status filter.
  const approvedBills = useMemo(
    () => monthExpenses.filter(e => e.status === "approved" || e.status === "paid"),
    [monthExpenses],
  );
  const sumAmount = (list: Expense[]) =>
    list.reduce((s, e) => s + (parseFloat(String(e.amount)) || 0), 0);
  const approvedTotal = sumAmount(approvedBills);
  const approvedAwaiting = sumAmount(approvedBills.filter(e => !e.isOwnCost && e.status === "approved"));
  const approvedPaid = sumAmount(approvedBills.filter(e => e.status === "paid" || (e.isOwnCost && e.status === "approved")));

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><IndianRupee size={22} /> Office Costing</h1>
            <p className="text-muted-foreground">Approve associate bills, log daily costs, and review the month.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Month:</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="own">My Submissions</TabsTrigger>
            <TabsTrigger value="report">Monthly Report</TabsTrigger>
          </TabsList>

          {/* APPROVALS */}
          <TabsContent value="approvals" className="space-y-4">
            {/* Total approved this month — gives the admin control over the
                month's approved spend regardless of the status filter below. */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-blue-700/80 font-medium">
                    Total approved this month
                  </div>
                  <div className="text-2xl font-bold text-blue-900">{fmt(approvedTotal)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {approvedBills.length} approved bill{approvedBills.length === 1 ? "" : "s"} ·{" "}
                    {months.find(m => m.value === month)?.label}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Paid / settled</div>
                    <div className="text-base font-semibold text-green-700">{fmt(approvedPaid)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Awaiting payment</div>
                    <div className="text-base font-semibold text-amber-700">{fmt(approvedAwaiting)}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setStatusFilter("approved")}>
                    View approved
                  </Button>
                </div>
              </div>
            </Card>

            {/* Outstanding owed + advance, with the bulk (lump-sum) payment entry.
                Payments are made in bulk and adjusted FIFO across approved bills. */}
            <Card className="p-4 bg-slate-50 border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-8">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-amber-700/80 font-medium">Outstanding to pay</div>
                    <div className="text-2xl font-bold text-amber-700">{fmt(balance.outstandingTotal)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">across all approved bills (all months)</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-green-700/80 font-medium">Advance / credit</div>
                    <div className="text-2xl font-bold text-green-700">{fmt(balance.creditBalance)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">paid but not yet adjusted</div>
                  </div>
                </div>
                <Button onClick={openBulk}>
                  <IndianRupee size={16} className="mr-1" /> Record bulk payment
                </Button>
              </div>
            </Card>

            <Card className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Status:</Label>
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">User:</Label>
                <Select value={userFilter} onValueChange={setUserFilter}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {allUsersForFilter.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Nature</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Bill</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingApprovals ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : allExpenses.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No expenses match the filter.</TableCell></TableRow>
                  ) : allExpenses.map(e => {
                    const s = statusVariant[e.status as ExpenseStatus];
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{e.date}</TableCell>
                        <TableCell>{userName(e.userId)}{e.isOwnCost && <span className="text-xs text-muted-foreground ml-1">(own)</span>}</TableCell>
                        <TableCell>{e.category}</TableCell>
                        <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {fmt(e.amount)}
                          {!e.isOwnCost && paidSum(e) > 0 && (
                            <div className="text-xs font-normal text-muted-foreground">
                              paid {fmt(paidSum(e))}
                              {netDue(e) > 0 && <> · <span className="text-amber-700 font-medium">due {fmt(netDue(e))}</span></>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {e.billFileUrl ? (
                            <a href={e.billFileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                              <Paperclip size={14} /> view
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>
                          {e.status === "approved" && !e.isOwnCost && paidSum(e) > 0 && netDue(e) > 0 && (
                            <div className="text-xs text-amber-700 mt-1">Partially paid</div>
                          )}
                          {e.status === "rejected" && e.rejectionReason && (
                            <div className="text-xs text-red-600 mt-1">{e.rejectionReason}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {e.status === "pending" && e.approverId === myId && (
                              <>
                                <Button size="icon" variant="ghost" className="text-green-700 hover:bg-green-50" onClick={() => act(e.id, "approve")} title="Approve"><Check size={16} /></Button>
                                <Button size="icon" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => { setRejecting(e); setRejectReason(""); }} title="Reject"><X size={16} /></Button>
                              </>
                            )}
                            {e.status === "pending" && e.approverId !== myId && (
                              <span className="text-xs text-muted-foreground italic">awaiting {APPROVER_LABEL[e.approverId] || e.approverId}</span>
                            )}
                            {e.status === "approved" && !e.isOwnCost && (
                              <Button size="sm" variant="ghost" onClick={() => setViewing(e)} title="View payments">
                                {paidSum(e) > 0 ? `${fmt(netDue(e))} due` : "Unpaid"}
                              </Button>
                            )}
                            {e.status === "paid" && !e.isOwnCost && (
                              <Button size="sm" variant="ghost" onClick={() => setViewing(e)} title="View payments">Payments</Button>
                            )}
                            {e.status === "approved" && e.isOwnCost && (
                              <span className="text-xs text-muted-foreground italic">settled</span>
                            )}
                            <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => delAdmin(e.id)}><Trash2 size={16} /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* MY SUBMISSIONS */}
          <TabsContent value="own" className="space-y-4">
            <Card className="p-4">
              <h2 className="font-semibold mb-1">Submit an office expense</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Pick yourself as approver for an instant entry. Pick the other approver to send it for their review.
                {myId === "ADMIN" && <> Admin can only self-approve bills up to ₹200; anything higher must go to Vijay Togaru.</>}
              </p>
              <div className="grid gap-3 md:grid-cols-6">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={oDate} onChange={e => setODate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nature</Label>
                  <Select value={oCat} onValueChange={setOCat}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input type="number" min="0" step="0.01" value={oAmt} onChange={e => setOAmt(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Approver</Label>
                  <Select value={oApprover} onValueChange={setOApprover}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPROVER_OPTIONS.map(a => (
                        <SelectItem key={a.id} value={a.id} disabled={a.disabled}>
                          {a.label}{a.disabled ? " — not allowed > ₹200" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Soft copy of bill</Label>
                  <Input id="own-file" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => setOFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={submitOwn} disabled={oSubmitting}>
                    {oSubmitting ? "Saving…" : oApprover === myId ? "Add (auto-approve)" : `Send to ${APPROVER_LABEL[oApprover]}`}
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <Label className="text-xs">
                  {oFile ? "Description (optional)" : "Reason — required when no soft copy is attached"}
                  {!oFile && <span className="text-red-600"> *</span>}
                </Label>
                <Input
                  value={oDesc}
                  onChange={e => setODesc(e.target.value)}
                  placeholder={oFile ? "(optional)" : "Why is the soft copy of the bill not available?"}
                />
                {!oFile && (
                  <p className="text-xs text-amber-700">
                    No soft copy attached — please explain why the bill soft copy is not provided.
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Nature</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Approver</TableHead>
                    <TableHead>Bill</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : own.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No submissions for this month.</TableCell></TableRow>
                  ) : own.map(e => {
                    const s = statusVariant[e.status as ExpenseStatus];
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{e.date}</TableCell>
                        <TableCell>{e.category}</TableCell>
                        <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(e.amount)}</TableCell>
                        <TableCell>{userName(e.approverId)}{e.approverId === myId && <span className="text-xs text-muted-foreground ml-1">(self)</span>}</TableCell>
                        <TableCell>
                          {e.billFileUrl ? (
                            <a href={e.billFileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                              <Paperclip size={14} /> view
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>
                          {e.status === "rejected" && e.rejectionReason && (
                            <div className="text-xs text-red-600 mt-1">{e.rejectionReason}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => delAdmin(e.id)}><Trash2 size={16} /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* MONTHLY REPORT */}
          <TabsContent value="report" className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={exportCSV} disabled={!report}>
                <Download size={16} className="mr-2" /> Export CSV
              </Button>
            </div>

            {reportLoading || !report ? (
              <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
            ) : (
              <>
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Last 12 months — office spending</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm bg-orange-500" />Own office costs
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />Reimbursements paid
                      </span>
                    </div>
                  </div>
                  <div className="h-72 w-full">
                    {summary.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data yet.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={summary} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`} />
                          <Tooltip
                            cursor={{ fill: "rgba(0,0,0,0.04)" }}
                            formatter={(value: any) => fmt(Number(value))}
                            labelFormatter={(l: any) => `Month: ${l}`}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="own" stackId="a" name="Own office costs" fill="#f97316" radius={[0, 0, 0, 0]}>
                            {summary.map((m, i) => (
                              <Cell key={i} cursor="pointer" onClick={() => setMonth(m.month)} />
                            ))}
                          </Bar>
                          <Bar dataKey="reimbursement" stackId="a" name="Reimbursements paid" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                            {summary.map((m, i) => (
                              <Cell key={i} cursor="pointer" onClick={() => setMonth(m.month)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Tip: click a bar to jump to that month's detailed breakdown below.</p>
                </Card>

                <div className="grid gap-3 md:grid-cols-5">
                  <Card className="p-4"><div className="text-xs text-muted-foreground">Office daily costs (own)</div><div className="text-lg font-semibold">{fmt(report.summary.adminDailyCosts)}</div></Card>
                  <Card className="p-4"><div className="text-xs text-muted-foreground">Reimbursements paid</div><div className="text-lg font-semibold">{fmt(report.summary.reimbursementsPaid)}</div></Card>
                  <Card className="p-4"><div className="text-xs text-muted-foreground">Awaiting payment</div><div className="text-lg font-semibold">{fmt(report.summary.awaitingPayment)}</div></Card>
                  <Card className="p-4"><div className="text-xs text-muted-foreground">Pending approval</div><div className="text-lg font-semibold">{fmt(report.summary.pendingApproval)}</div></Card>
                  <Card className="p-4 bg-slate-50"><div className="text-xs text-muted-foreground">Month total (paid + own)</div><div className="text-lg font-bold">{fmt(report.summary.monthTotal)}</div></Card>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h3 className="font-semibold mb-3">By category</h3>
                    <Table>
                      <TableBody>
                        {Object.entries(report.byCategory as Record<string, number>)
                          .sort((a, b) => b[1] - a[1])
                          .map(([cat, amt]) => (
                          <TableRow key={cat}>
                            <TableCell>{cat}</TableCell>
                            <TableCell className="text-right font-medium">{fmt(amt)}</TableCell>
                          </TableRow>
                        ))}
                        {Object.keys(report.byCategory).length === 0 && (
                          <TableRow><TableCell className="text-muted-foreground text-center">No data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                  <Card className="p-4">
                    <h3 className="font-semibold mb-3">By person</h3>
                    <Table>
                      <TableBody>
                        {Object.entries(report.byPerson as Record<string, { name: string; amount: number }>)
                          .sort((a, b) => b[1].amount - a[1].amount)
                          .map(([uid, info]) => (
                          <TableRow key={uid}>
                            <TableCell>{info.name}</TableCell>
                            <TableCell className="text-right font-medium">{fmt(info.amount)}</TableCell>
                          </TableRow>
                        ))}
                        {Object.keys(report.byPerson).length === 0 && (
                          <TableRow><TableCell className="text-muted-foreground text-center">No data</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

        </Tabs>

        <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject this bill?</DialogTitle>
              <DialogDescription>
                {rejecting && <>{userName(rejecting.userId)} · {rejecting.category} · {fmt(rejecting.amount)}</>}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason</Label>
              <Textarea id="reject-reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Why is this bill being rejected?" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={reject}>Reject</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Per-bill payments — read-only view of the FIFO-allocated payments */}
        <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Payments for this bill</DialogTitle>
              <DialogDescription>
                {viewing && <>{userName(viewing.userId)} · {viewing.category} · approved {fmt(viewing.amount)}</>}
              </DialogDescription>
            </DialogHeader>

            {viewing && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-xs text-muted-foreground">Approved</div>
                    <div className="font-semibold">{fmt(viewing.amount)}</div>
                  </div>
                  <div className="rounded-md bg-green-50 p-2">
                    <div className="text-xs text-muted-foreground">Paid till date</div>
                    <div className="font-semibold text-green-700">{fmt(paidSum(viewing))}</div>
                  </div>
                  <div className="rounded-md bg-amber-50 p-2">
                    <div className="text-xs text-muted-foreground">Net to be paid</div>
                    <div className="font-semibold text-amber-700">{fmt(netDue(viewing))}</div>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Paid via</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentsOf(viewing).length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-3 text-sm">No payments adjusted yet. Use “Record bulk payment”.</TableCell></TableRow>
                      ) : paymentsOf(viewing).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>{p.date}</TableCell>
                          <TableCell>{p.paidVia}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Payments are made in bulk and adjusted FIFO (oldest bill first) across all approved bills.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk (lump-sum) payment — allocated FIFO across outstanding approved bills */}
        <Dialog open={bulkOpen} onOpenChange={(o) => !o && setBulkOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record bulk payment</DialogTitle>
              <DialogDescription>
                Adjusted FIFO (oldest approved bill first) across all associates. Any leftover is kept as an advance.
              </DialogDescription>
            </DialogHeader>

            {bulkResult ? (
              <div className="space-y-4">
                <div className="rounded-md bg-green-50 p-4 text-center space-y-1">
                  <div className="text-sm text-muted-foreground">Recorded {fmt(bulkResult.recorded)}</div>
                  <div className="font-medium">Cleared / part-paid {bulkResult.allocatedCount} bill{bulkResult.allocatedCount === 1 ? "" : "s"} (FIFO)</div>
                  <div className="text-sm">Advance / credit carried: <span className="font-semibold text-green-700">{fmt(bulkResult.creditBalance)}</span></div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setBulkOpen(false)}>Done</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-md bg-amber-50 p-2">
                    <div className="text-xs text-muted-foreground">Outstanding</div>
                    <div className="font-semibold text-amber-700">{fmt(balance.outstandingTotal)}</div>
                  </div>
                  <div className="rounded-md bg-green-50 p-2">
                    <div className="text-xs text-muted-foreground">Current advance</div>
                    <div className="font-semibold text-green-700">{fmt(balance.creditBalance)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Payment date</Label>
                    <Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Paid via</Label>
                    <Select value={bulkVia} onValueChange={setBulkVia}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount paid (₹)</Label>
                  <Input type="number" min="0" step="0.01" value={bulkAmt} onChange={e => setBulkAmt(e.target.value)} placeholder="Total lump sum paid this week" autoFocus />
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
                  <Button onClick={recordBulk} disabled={bulkSubmitting}>{bulkSubmitting ? "Adjusting…" : "Record & adjust FIFO"}</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AuditLayout>
  );
}
