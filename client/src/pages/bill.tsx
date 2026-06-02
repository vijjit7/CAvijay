import { useEffect, useMemo, useState } from "react";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, FileText, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseStatus } from "@shared/schema";

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
function monthISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthOptions(count = 12): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: monthISO(d),
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

export default function BillPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>(monthISO());

  // form
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [approverId, setApproverId] = useState<string>("ADMIN");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const APPROVERS: { id: string; label: string }[] = [
    { id: "ADMIN", label: "Admin" },
    { id: "PROP",  label: "Vijay Togaru" },
  ];
  const approverName = (id: string) => APPROVERS.find(a => a.id === id)?.label || id;

  const months = useMemo(() => monthOptions(12), []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/expenses/mine?month=${encodeURIComponent(filterMonth)}`, { credentials: "include" });
      if (r.ok) setItems(await r.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterMonth]);

  async function submit() {
    if (!date || !category || !amount) {
      toast({ title: "Missing fields", description: "Date, nature and amount are required.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Invalid amount", description: "Enter a positive number.", variant: "destructive" });
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please reduce size and upload (≤ 5 MB).", variant: "destructive" });
      return;
    }
    if (!file && !description.trim()) {
      toast({
        title: "Soft copy or reason required",
        description: "Attach a soft copy of the bill, or describe the reason why the soft copy is not available.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("date", date);
      fd.append("category", category);
      fd.append("amount", String(amt));
      fd.append("description", description);
      fd.append("approverId", approverId);
      if (file) fd.append("bill", file);
      const r = await fetch("/api/expenses", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Failed to submit bill");
      }
      toast({ title: "Bill submitted", description: `${fmt(amt)} — awaiting approval.` });
      setAmount(""); setDescription(""); setFile(null);
      const fi = document.getElementById("bill-file") as HTMLInputElement | null;
      if (fi) fi.value = "";
      load();
    } catch (e: any) {
      toast({ title: "Submit failed", description: e?.message || "Try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this pending bill?")) return;
    const r = await fetch(`/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast({ title: "Deleted" }); load(); }
    else { toast({ title: "Delete failed", variant: "destructive" }); }
  }

  const totals = useMemo(() => {
    const sum = (s: ExpenseStatus) =>
      items.filter(i => i.status === s).reduce((a, b) => a + parseFloat(String(b.amount) || "0"), 0);
    return {
      total: items.reduce((a, b) => a + parseFloat(String(b.amount) || "0"), 0),
      pending: sum("pending"),
      approved: sum("approved"),
      paid: sum("paid"),
    };
  }, [items]);

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Bill</h1>
          <p className="text-muted-foreground">Submit your office expense bills for approval.</p>
        </div>

        <Card className="p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><FileText size={18} /> Add a Bill</h2>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="b-date">Date</Label>
              <Input id="b-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nature of Expense</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-amt">Bill Amount (₹)</Label>
              <Input id="b-amt" type="number" min="0" step="0.01" value={amount}
                     onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Select approver</Label>
              <Select value={approverId} onValueChange={setApproverId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPROVERS.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-file">Soft copy of Bill</Label>
              <Input id="bill-file" type="file" accept=".jpg,.jpeg,.png,.pdf"
                     onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">jpg / png / pdf · ≤ 5 MB · please reduce size before upload</p>
            </div>
          </div>
          <div className="mt-4 md:col-span-5 grid gap-2">
            <Label htmlFor="b-desc">
              {file
                ? "Description (optional)"
                : "Reason — required when no soft copy is attached"}
              {!file && <span className="text-red-600"> *</span>}
            </Label>
            <Input id="b-desc" value={description} onChange={e => setDescription(e.target.value)}
                   placeholder={file ? "e.g., Cab to client site" : "Why is the soft copy of the bill not available?"} />
            {!file && (
              <p className="text-xs text-amber-700">
                No soft copy attached — please explain why the bill soft copy is not provided.
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Bill"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold">History</h2>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Month:</Label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold">{fmt(totals.total)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Pending</div><div className="font-semibold">{fmt(totals.pending)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Approved</div><div className="font-semibold">{fmt(totals.approved)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Paid</div><div className="font-semibold">{fmt(totals.paid)}</div></Card>
          </div>

          <div className="border rounded-md">
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
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No bills in this month yet.</TableCell></TableRow>
                ) : items.map(e => {
                  const s = statusVariant[e.status as ExpenseStatus];
                  return (
                    <TableRow key={e.id}>
                      <TableCell>{e.date}</TableCell>
                      <TableCell>{e.category}</TableCell>
                      <TableCell className="text-muted-foreground">{e.description || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(e.amount)}</TableCell>
                      <TableCell>{approverName(e.approverId)}</TableCell>
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
                        {e.status === "pending" && (
                          <Button variant="ghost" size="icon" onClick={() => remove(e.id)} className="text-destructive hover:bg-destructive/10">
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AuditLayout>
  );
}
