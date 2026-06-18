import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MapPin, Plus, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Associate = {
  id: string;
  name: string;
  username: string;
  onLeave?: boolean;
};

type AssociatePincode = {
  id: number;
  associateId: string;
  pincode: string;
  createdAt: string;
};

export default function PincodeMappingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverAssoc, setDragOverAssoc] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addValues, setAddValues] = useState<Record<string, string>>({});

  const { data: associates = [] } = useQuery<Associate[]>({
    queryKey: ["/api/associates"],
    queryFn: async () => {
      const res = await fetch("/api/associates");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: mappings = [], isLoading } = useQuery<AssociatePincode[]>({
    queryKey: ["/api/associate-locations"],
    queryFn: async () => {
      const res = await fetch("/api/associate-locations");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Admin-only page.
  if (!user?.isAdmin) {
    return <Redirect to="/" />;
  }

  async function readError(res: Response, fallback: string) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (data.error) return data.error;
    } catch {
      if (text && text.length < 200) return text;
    }
    return fallback;
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/associate-locations"] });

  const isValidPincode = (v: string) => /^\d{6}$/.test(v);

  const createMutation = useMutation({
    mutationFn: async (input: { associateId: string; pincode: string }) => {
      const res = await fetch("/api/associate-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to add pincode"));
      return res.json();
    },
    onSuccess: (_d, vars) => {
      invalidate();
      setAddValues((p) => ({ ...p, [vars.associateId]: "" }));
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ id, associateId }: { id: number; associateId: string }) => {
      const res = await fetch(`/api/associate-locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ associateId }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to move pincode"));
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, pincode }: { id: number; pincode: string }) => {
      const res = await fetch(`/api/associate-locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pincode }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update pincode"));
      return res.json();
    },
    onSuccess: () => { invalidate(); setEditingId(null); setEditValue(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/associate-locations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Failed to delete pincode"));
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const leaveMutation = useMutation({
    mutationFn: async ({ id, onLeave }: { id: string; onLeave: boolean }) => {
      const res = await fetch(`/api/associates/${id}/leave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onLeave }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update leave status"));
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/associates"] });
      toast({
        title: vars.onLeave ? "Associate paused" : "Associate active",
        description: vars.onLeave
          ? "New cases will not be auto-allocated to them while on leave."
          : "New cases will be auto-allocated to them again.",
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Pincodes grouped under each associate, sorted numerically.
  const groups = useMemo(() => {
    return associates.map((a) => ({
      associate: a,
      pincodes: mappings
        .filter((m) => m.associateId === a.id)
        .sort((x, y) => x.pincode.localeCompare(y.pincode)),
    }));
  }, [associates, mappings]);

  const submitEdit = (id: number) => {
    const v = editValue.trim();
    if (!isValidPincode(v)) {
      toast({ title: "Invalid pincode", description: "Enter exactly 6 digits", variant: "destructive" });
      return;
    }
    editMutation.mutate({ id, pincode: v });
  };

  const handleAdd = (associateId: string) => {
    const v = (addValues[associateId] || "").trim();
    if (!v) return;
    if (!isValidPincode(v)) {
      toast({ title: "Invalid pincode", description: "Enter exactly 6 digits", variant: "destructive" });
      return;
    }
    createMutation.mutate({ associateId, pincode: v });
  };

  const handleDrop = (associateId: string) => {
    setDragOverAssoc(null);
    const id = draggingId;
    setDraggingId(null);
    if (id == null) return;
    const loc = mappings.find((m) => m.id === id);
    if (loc && loc.associateId !== associateId) {
      reassignMutation.mutate({ id, associateId });
    }
  };

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <MapPin className="h-6 w-6 text-blue-600" />
              Pincode Mapping
            </h1>
            <p className="text-slate-500">
              Each associate handles the pincodes listed under them. New cases are auto-allocated by
              matching the pincode in the customer address. Drag a pincode onto another associate to move it.
              Switch an associate off when they're on leave to pause new allocations to them.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">{mappings.length} pincodes</Badge>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map(({ associate, pincodes }) => {
              const isOver = dragOverAssoc === associate.id;
              return (
                <Card
                  key={associate.id}
                  className={`${isOver ? "ring-2 ring-blue-400 border-blue-300" : ""} ${associate.onLeave ? "bg-slate-50 border-dashed" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverAssoc(associate.id); }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverAssoc(null); }}
                  onDrop={() => handleDrop(associate.id)}
                  data-testid={`assoc-card-${associate.id}`}
                >
                  <CardHeader className="pb-3 space-y-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <span className={associate.onLeave ? "text-slate-500" : ""}>{associate.name}</span>
                        {associate.onLeave && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">On leave</Badge>
                        )}
                      </span>
                      <Badge variant="outline">{pincodes.length}</Badge>
                    </CardTitle>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {associate.onLeave ? "Paused — no new cases" : "Active — receiving cases"}
                      </span>
                      <Switch
                        checked={!associate.onLeave}
                        onCheckedChange={(checked) => leaveMutation.mutate({ id: associate.id, onLeave: !checked })}
                        disabled={leaveMutation.isPending}
                        aria-label={`Toggle ${associate.name} on leave`}
                        data-testid={`leave-toggle-${associate.id}`}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="max-h-[320px] overflow-y-auto pr-1 space-y-1">
                      {pincodes.length === 0 && (
                        <p className="text-xs text-slate-400 italic py-2">
                          No pincodes. Drag one here or add below.
                        </p>
                      )}
                      {pincodes.map((loc) => (
                        <div
                          key={loc.id}
                          draggable={editingId !== loc.id}
                          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDraggingId(loc.id); }}
                          onDragEnd={() => { setDraggingId(null); setDragOverAssoc(null); }}
                          className={`group flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-sm ${
                            draggingId === loc.id ? "opacity-40" : "hover:bg-slate-50"
                          } ${editingId === loc.id ? "" : "cursor-grab active:cursor-grabbing"}`}
                          data-testid={`loc-${loc.id}`}
                        >
                          {editingId === loc.id ? (
                            <>
                              <Input
                                autoFocus
                                inputMode="numeric"
                                maxLength={6}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitEdit(loc.id);
                                  if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                                }}
                                className="h-7 text-sm"
                              />
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600"
                                onClick={() => submitEdit(loc.id)}
                                data-testid={`loc-save-${loc.id}`}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500"
                                onClick={() => { setEditingId(null); setEditValue(""); }}>
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                              <span className="flex-1 truncate" title={loc.pincode}>{loc.pincode}</span>
                              <Button size="icon" variant="ghost"
                                className="h-7 w-7 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100"
                                onClick={() => { setEditingId(loc.id); setEditValue(loc.pincode); }}
                                data-testid={`loc-edit-${loc.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost"
                                className="h-7 w-7 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                                onClick={() => deleteMutation.mutate(loc.id)}
                                data-testid={`loc-delete-${loc.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 pt-1">
                      <Input
                        placeholder="Add pincode…"
                        inputMode="numeric"
                        maxLength={6}
                        value={addValues[associate.id] || ""}
                        onChange={(e) => setAddValues((p) => ({ ...p, [associate.id]: e.target.value.replace(/\D/g, "") }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(associate.id); }}
                        className="h-8 text-sm"
                        data-testid={`loc-add-input-${associate.id}`}
                      />
                      <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"
                        onClick={() => handleAdd(associate.id)}
                        disabled={createMutation.isPending}
                        data-testid={`loc-add-btn-${associate.id}`}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AuditLayout>
  );
}
