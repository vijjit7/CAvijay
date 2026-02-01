import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, Trash2, Edit, ClipboardPaste, ExternalLink, Inbox, ChevronDown, Download } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

type MisEntry = {
  id: number;
  associateId: string;
  sno: number;
  leadId: string;
  customerName: string;
  businessName: string | null;
  contactDetails: string | null;
  customerAddress: string | null;
  inDate: string | null;
  outDate: string | null;
  initiatedPerson: string | null;
  product: string | null;
  pdPerson: string | null;
  pdTyping: string | null;
  pdPersonId: string | null;
  pdTypingId: string | null;
  location: string | null;
  status: string | null;
  workflowStatus: string | null;
  assignedAt: string | null;
  createdAt: string;
};

type Associate = {
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
};

export default function MisPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<MisEntry | null>(null);
  const [manualEntryDialogOpen, setManualEntryDialogOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    leadId: "",
    customerName: "",
    businessName: "",
    contactDetails: "",
    customerAddress: "",
    inDate: "",
    product: "",
    location: "",
    initiatedPerson: "",
    workNature: "",
  });
  
  // Ref for horizontal auto-scroll on MIS table
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnimationRef = useRef<number | null>(null);

  // Auto-scroll when mouse is near edges
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const edgeZone = 80; // pixels from edge to trigger scroll
    const scrollSpeed = 8;

    // Cancel any existing animation
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }

    // Scroll right when near right edge
    if (mouseX > rect.width - edgeZone) {
      const scrollRight = () => {
        if (container.scrollLeft < container.scrollWidth - container.clientWidth) {
          container.scrollLeft += scrollSpeed;
          scrollAnimationRef.current = requestAnimationFrame(scrollRight);
        }
      };
      scrollAnimationRef.current = requestAnimationFrame(scrollRight);
    }
    // Scroll left when near left edge
    else if (mouseX < edgeZone) {
      const scrollLeft = () => {
        if (container.scrollLeft > 0) {
          container.scrollLeft -= scrollSpeed;
          scrollAnimationRef.current = requestAnimationFrame(scrollLeft);
        }
      };
      scrollAnimationRef.current = requestAnimationFrame(scrollLeft);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Filter states - arrays for multi-select
  const [filterLeadId, setFilterLeadId] = useState<string[]>([]);
  const [filterApplicant, setFilterApplicant] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterPdPerson, setFilterPdPerson] = useState<string[]>([]);
  const [filterInDate, setFilterInDate] = useState<string[]>([]);
  const [filterOutDate, setFilterOutDate] = useState<string[]>([]);
  const [filterBranch, setFilterBranch] = useState<string[]>([]);
  const [filterInitiatedBy, setFilterInitiatedBy] = useState<string[]>([]);
  const [filterWorkNature, setFilterWorkNature] = useState<string[]>([]);
  
  // Download states
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadMonth, setDownloadMonth] = useState<string>("");
  const [downloadYear, setDownloadYear] = useState<string>("");

  // Fetch centralized MIS (all entries from all associates)
  const { data: misEntries = [], isLoading } = useQuery<MisEntry[]>({
    queryKey: ["/api/mis"],
    queryFn: async () => {
      const res = await fetch("/api/mis");
      if (!res.ok) throw new Error("Failed to fetch MIS entries");
      return res.json();
    },
  });

  // Fetch associates to show contributor names and populate dropdowns
  const { data: associates = [] } = useQuery<Associate[]>({
    queryKey: ["/api/associates"],
    queryFn: async () => {
      const res = await fetch("/api/associates");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const getAssociateName = (associateId: string | null) => {
    if (!associateId) return "-";
    const associate = associates.find(a => a.id === associateId);
    return associate?.name || associateId;
  };

  const createSingleMutation = useMutation({
    mutationFn: async (entry: any) => {
      const res = await fetch("/api/mis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...entry, associateId: user?.id }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errorMessage = `Failed to create entry (${res.status})`;
        try {
          const errorData = JSON.parse(text);
          if (errorData.error) errorMessage = errorData.error;
        } catch {
          if (text.length < 200) errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mis"] });
      toast({ title: "Success", description: "MIS entry added successfully" });
      setManualEntryDialogOpen(false);
      setManualEntry({
        leadId: "",
        customerName: "",
        businessName: "",
        contactDetails: "",
        customerAddress: "",
        inDate: "",
        product: "",
        location: "",
        initiatedPerson: "",
        workNature: "",
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createBulkMutation = useMutation({
    mutationFn: async (entries: any[]) => {
      const res = await fetch("/api/mis/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ associateId: user?.id, entries }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errorMessage = `Failed to create entries (${res.status})`;
        try {
          const errorData = JSON.parse(text);
          if (errorData.error) errorMessage = errorData.error;
        } catch {
          if (text.length < 200) errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mis"] });
      const added = data.entries?.length || 0;
      const skipped = data.skipped || 0;
      if (skipped > 0) {
        toast({ title: "Success", description: `${added} entries added. ${skipped} duplicate Lead ID(s) skipped.` });
      } else {
        toast({ title: "Success", description: `${added} MIS entries added successfully` });
      }
      setPasteDialogOpen(false);
      setPasteContent("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const res = await fetch(`/api/mis/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update entry (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mis"] });
      toast({ title: "Success", description: "MIS entry updated" });
      setEditDialogOpen(false);
      setEditEntry(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/mis/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete entry (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mis"] });
      toast({ title: "Success", description: "MIS entry deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const parsePastedContent = (content: string) => {
    const lines = content.trim().split("\n");
    const entries: any[] = [];

    // Extract initiated person from email header pattern like "to me, enakollu.ashok" or "to enakollu.ashok, me"
    let initiatedPerson: string | null = null;
    // Extract work nature from patterns like 'A new "LIP"' or 'A new "Home Loan"'
    let workNature: string | null = null;
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase().trim();
      
      // Match patterns: "to me, username" or "to username, me" or "to username"
      const toMatch = lowerLine.match(/^to\s+(.+)$/);
      if (toMatch && !initiatedPerson) {
        const recipients = toMatch[1].split(",").map(r => r.trim());
        // Find the recipient that's not "me"
        for (const recipient of recipients) {
          if (recipient !== "me" && recipient.length > 0) {
            initiatedPerson = recipient;
            break;
          }
        }
      }
      
      // Match patterns: 'A new LIP' or 'A new "LIP"' or 'new AIP' or 'new PD'
      const workNatureMatch = line.match(/[Aa]\s*new\s+["']?([A-Z]{2,4})["']?\s/i);
      if (workNatureMatch && !workNature) {
        workNature = workNatureMatch[1].trim().toUpperCase();
      }
    }

    for (const line of lines) {
      // Skip lines that contain URLs, email signatures, or are too short
      if (line.includes("http://") || line.includes("https://") || 
          line.includes("piramalfinance.com") || line.includes("vendorOwner") ||
          line.toLowerCase().includes("thanks,") || line.toLowerCase().includes("piramal finance") ||
          line.toLowerCase().includes("click on the link") || line.toLowerCase().includes("for further details")) {
        continue;
      }

      // Try tab-separated first
      let parts = line.split("\t");
      
      // If not enough tab parts, try multiple spaces (common when copying from some email clients)
      if (parts.length < 5) {
        parts = line.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 0);
      }
      
      if (parts.length < 5) continue;

      // Email format: Product | Business Name | Entity Type | Name of Applicant | Lead ID | Branch | Initiation Date/Time | Mobile Number | Address
      const [product, businessName, entityType, applicantName, leadId, branch, initiationDateTime, mobileNumber, address] = parts;

      // Skip header row
      if (product?.toLowerCase() === "product" || leadId?.toLowerCase() === "lead id" || 
          applicantName?.toLowerCase().includes("name of applicant")) {
        continue;
      }

      // Validate leadId format - should start with letters and contain alphanumeric chars
      const leadIdClean = leadId?.trim() || "";
      if (!leadIdClean || leadIdClean.length < 5 || !/^[A-Z]{2,}/i.test(leadIdClean)) {
        continue;
      }

      if (!applicantName) continue;

      // Clean up phone number
      const cleanPhone = mobileNumber?.trim().replace(/^(ph:|phone:|tel:|mob:|mobile:)/i, "").trim() || null;

      entries.push({
        leadId: leadIdClean,
        customerName: applicantName?.trim() || "",  // Applicant Name
        businessName: businessName?.trim() || null,
        contactDetails: cleanPhone,  // Phone Number
        customerAddress: address?.trim() || null,
        inDate: initiationDateTime?.trim() || null,
        outDate: null,
        initiatedPerson: initiatedPerson,
        product: product?.trim() || null,
        workNature: workNature,
        pdPerson: null,
        location: branch?.trim() || null,  // Branch
        status: "Pending",
      });
    }

    return entries;
  };

  const handlePasteSubmit = () => {
    const entries = parsePastedContent(pasteContent);
    if (entries.length === 0) {
      toast({ title: "Error", description: "No valid entries found. Check format.", variant: "destructive" });
      return;
    }
    // Backend handles duplicate checking - send all entries
    createBulkMutation.mutate(entries);
  };

  const handleManualEntrySubmit = () => {
    if (!manualEntry.leadId.trim() || !manualEntry.customerName.trim()) {
      toast({ title: "Error", description: "Lead ID and Customer Name are required", variant: "destructive" });
      return;
    }
    createSingleMutation.mutate(manualEntry);
  };

  const handleEdit = (entry: MisEntry) => {
    setEditEntry(entry);
    setEditDialogOpen(true);
  };

  const handleEditSave = () => {
    if (!editEntry) return;
    updateMutation.mutate({
      id: editEntry.id,
      updates: {
        leadId: editEntry.leadId,
        customerName: editEntry.customerName,
        businessName: editEntry.businessName,
        contactDetails: editEntry.contactDetails,
        customerAddress: editEntry.customerAddress,
        inDate: editEntry.inDate,
        outDate: editEntry.outDate,
        initiatedPerson: editEntry.initiatedPerson,
        product: editEntry.product,
        pdPerson: editEntry.pdPerson,
        pdPersonId: editEntry.pdPersonId,
        workflowStatus: editEntry.workflowStatus,
        location: editEntry.location,
        status: editEntry.status,
      },
    });
  };

  // Get entries assigned to current user for Intray
  const intrayEntries = misEntries.filter(entry => 
    entry.pdPersonId === user?.id && 
    entry.workflowStatus === "assigned"
  );

  // Extract unique values for each filterable column
  const uniqueValues = useMemo(() => ({
    leadId: Array.from(new Set(misEntries.map(e => e.leadId).filter(Boolean))).sort() as string[],
    applicant: Array.from(new Set(misEntries.map(e => e.customerName).filter(Boolean))).sort() as string[],
    status: Array.from(new Set(misEntries.map(e => e.status).filter(Boolean))).sort() as string[],
    pdPerson: Array.from(new Set(misEntries.map(e => e.pdPersonId).filter(Boolean))).sort() as string[],
    inDate: Array.from(new Set(misEntries.map(e => e.inDate).filter(Boolean))).sort() as string[],
    outDate: ["(Blanks)", ...Array.from(new Set(misEntries.map(e => e.outDate).filter(Boolean))).sort()] as string[],
    branch: Array.from(new Set(misEntries.map(e => e.location).filter(Boolean))).sort() as string[],
    initiatedBy: Array.from(new Set(misEntries.map(e => e.initiatedPerson).filter(Boolean))).sort() as string[],
    workNature: Array.from(new Set(misEntries.map(e => (e as any).workNature).filter(Boolean))).sort() as string[],
  }), [misEntries]);

  // Toggle filter value helper
  const toggleFilter = (current: string[], value: string, setter: (val: string[]) => void) => {
    if (current.includes(value)) {
      setter(current.filter(v => v !== value));
    } else {
      setter([...current, value]);
    }
  };

  // Filtered MIS entries based on filter states (now arrays)
  const filteredMisEntries = misEntries.filter(entry => {
    // Search filter - matches Lead ID or Applicant Name
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const matchesLeadId = entry.leadId?.toLowerCase().includes(query);
      const matchesApplicant = entry.customerName?.toLowerCase().includes(query);
      if (!matchesLeadId && !matchesApplicant) {
        return false;
      }
    }
    
    if (filterLeadId.length > 0 && !filterLeadId.includes(entry.leadId)) {
      return false;
    }
    if (filterApplicant.length > 0 && !filterApplicant.includes(entry.customerName)) {
      return false;
    }
    if (filterStatus.length > 0 && !filterStatus.includes(entry.status || "")) {
      return false;
    }
    if (filterPdPerson.length > 0 && !filterPdPerson.includes(entry.pdPersonId || "")) {
      return false;
    }
    if (filterInDate.length > 0 && !filterInDate.includes(entry.inDate || "")) {
      return false;
    }
    if (filterOutDate.length > 0) {
      const entryOutDate = entry.outDate || "";
      const hasBlanksFilter = filterOutDate.includes("(Blanks)");
      const otherFilters = filterOutDate.filter(f => f !== "(Blanks)");
      
      const matchesBlanks = hasBlanksFilter && entryOutDate.trim() === "";
      const matchesOther = otherFilters.length > 0 && otherFilters.includes(entryOutDate);
      
      if (!matchesBlanks && !matchesOther) {
        return false;
      }
    }
    if (filterBranch.length > 0 && !filterBranch.includes(entry.location || "")) {
      return false;
    }
    if (filterInitiatedBy.length > 0 && !filterInitiatedBy.includes(entry.initiatedPerson || "")) {
      return false;
    }
    if (filterWorkNature.length > 0 && !filterWorkNature.includes((entry as any).workNature || "")) {
      return false;
    }
    return true;
  });

  const getStatusBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "in progress":
        return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
      case "cancelled":
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      case "pending":
      default:
        return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
    }
  };

  const monthNameToNumberMap: { [key: string]: string } = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
    "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12"
  };

  const getMonthYearKey = (inDate: string | null): string => {
    if (!inDate) return "unknown";
    const dateParts = inDate.split(/[-/]/);
    if (dateParts.length >= 3) {
      const middlePart = dateParts[1].toLowerCase();
      if (monthNameToNumberMap[middlePart.substring(0, 3)]) {
        const month = monthNameToNumberMap[middlePart.substring(0, 3)];
        const year = dateParts[2].length === 4 ? dateParts[2] : "20" + dateParts[2];
        return `${year}-${month}`;
      } else if (dateParts[0].length === 4) {
        return `${dateParts[0]}-${dateParts[1].padStart(2, "0")}`;
      } else if (dateParts[2].length === 4) {
        return `${dateParts[2]}-${dateParts[1].padStart(2, "0")}`;
      }
    }
    return "unknown";
  };

  const entrySnoMap = useMemo(() => {
    const snoMap = new Map<number, number>();
    const monthCounters: { [key: string]: number } = {};
    
    const sortedEntries = [...misEntries].sort((a, b) => {
      const keyA = getMonthYearKey(a.inDate);
      const keyB = getMonthYearKey(b.inDate);
      if (keyA !== keyB) return keyA.localeCompare(keyB);
      return a.id - b.id;
    });
    
    sortedEntries.forEach(entry => {
      const monthKey = getMonthYearKey(entry.inDate);
      if (!monthCounters[monthKey]) {
        monthCounters[monthKey] = 0;
      }
      monthCounters[monthKey]++;
      snoMap.set(entry.id, monthCounters[monthKey]);
    });
    
    return snoMap;
  }, [misEntries]);

  const months = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const years = ["2025", "2026", "2027", "2028", "2029", "2030"];

  const monthNameToNumber: { [key: string]: string } = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
    "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12"
  };

  const handleDownload = () => {
    if (!downloadMonth || !downloadYear) {
      toast({ title: "Error", description: "Please select both month and year", variant: "destructive" });
      return;
    }

    const monthLabel = months.find(m => m.value === downloadMonth)?.label || downloadMonth;
    
    const filteredForDownload = misEntries.filter(entry => {
      if (!entry.inDate) return false;
      const dateParts = entry.inDate.split(/[-/]/);
      let entryMonth = "";
      let entryYear = "";
      
      if (dateParts.length >= 3) {
        const middlePart = dateParts[1].toLowerCase();
        if (monthNameToNumber[middlePart.substring(0, 3)]) {
          entryMonth = monthNameToNumber[middlePart.substring(0, 3)];
          entryYear = dateParts[2].length === 4 ? dateParts[2] : "20" + dateParts[2];
        } else if (dateParts[0].length === 4) {
          entryYear = dateParts[0];
          entryMonth = dateParts[1].padStart(2, "0");
        } else if (dateParts[2].length === 4) {
          entryYear = dateParts[2];
          entryMonth = dateParts[1].padStart(2, "0");
        } else if (dateParts[2].length === 2) {
          entryYear = "20" + dateParts[2];
          entryMonth = dateParts[1].padStart(2, "0");
        }
      }
      
      return entryMonth === downloadMonth && entryYear === downloadYear;
    });

    if (filteredForDownload.length === 0) {
      toast({ title: "No Data", description: `No entries found for ${monthLabel} ${downloadYear}`, variant: "destructive" });
      return;
    }

    const headers = ["SNO", "Lead ID", "Applicant", "Business", "Phone", "Address", "Branch", "In Date", "Out Date", "Work Nature", "Initiated By", "PD Person", "Status"];
    
    const csvRows = [headers.join(",")];
    filteredForDownload.forEach((entry, index) => {
      const row = [
        index + 1,
        `"${entry.leadId}"`,
        `"${entry.customerName}"`,
        `"${entry.businessName || ""}"`,
        `"${entry.contactDetails || ""}"`,
        `"${(entry.customerAddress || "").replace(/"/g, '""')}"`,
        `"${entry.location || ""}"`,
        `"${entry.inDate || ""}"`,
        `"${entry.outDate || ""}"`,
        `"${(entry as any).workNature || ""}"`,
        `"${entry.initiatedPerson || ""}"`,
        `"${getAssociateName(entry.pdPersonId)}"`,
        `"${entry.status || ""}"`,
      ];
      csvRows.push(row.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MIS_${monthLabel}_${downloadYear}.csv`;
    link.click();
    
    toast({ title: "Success", description: `Downloaded ${filteredForDownload.length} entries for ${monthLabel} ${downloadYear}` });
    setDownloadDialogOpen(false);
  };

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-page-title">MIS - Work Allocation</h1>
            <p className="text-slate-500">Track your assigned work from email allocations</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="gap-2" 
              data-testid="button-view-mis"
              onClick={() => document.getElementById('mis-table')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <ExternalLink className="h-4 w-4" />
              View MIS ({misEntries.length})
            </Button>
            <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-download-mis">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Download MIS Data</DialogTitle>
                  <DialogDescription>
                    Select month and year to download MIS entries. SNO will start from 1 for the selected month.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Month</label>
                    <Select value={downloadMonth} onValueChange={setDownloadMonth}>
                      <SelectTrigger data-testid="select-download-month">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map(month => (
                          <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Year</label>
                    <Select value={downloadYear} onValueChange={setDownloadYear}>
                      <SelectTrigger data-testid="select-download-year">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDownloadDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleDownload} data-testid="button-confirm-download">
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-paste-data">
                  <ClipboardPaste className="h-4 w-4" />
                  Paste Email Data
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Paste Work Allocation Data</DialogTitle>
                <DialogDescription>
                  Copy the table data from your Piramal email and paste it below. The system will automatically assign serial numbers.
                  Expected format: Product, Business Name, Entity Type, Applicant Name, Lead ID, Branch, Initiation Date, Mobile Number, Address
                </DialogDescription>
              </DialogHeader>
              <Textarea
                placeholder="Paste your tab-separated data here..."
                className="min-h-[200px] font-mono text-sm"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                data-testid="input-paste-content"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setPasteDialogOpen(false)} data-testid="button-cancel-paste">
                  Cancel
                </Button>
                <Button onClick={handlePasteSubmit} disabled={createBulkMutation.isPending} data-testid="button-submit-paste">
                  {createBulkMutation.isPending ? "Adding..." : "Add Entries"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            <Dialog open={manualEntryDialogOpen} onOpenChange={setManualEntryDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="button-manual-entry">
                  <Plus className="h-4 w-4" />
                  Manual Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Manual MIS Entry</DialogTitle>
                  <DialogDescription>
                    Add a work allocation entry manually. SNO will be auto-assigned.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Lead ID *</label>
                    <Input
                      placeholder="e.g., BLSA00012345"
                      value={manualEntry.leadId}
                      onChange={(e) => setManualEntry({ ...manualEntry, leadId: e.target.value })}
                      data-testid="input-manual-leadid"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Customer Name *</label>
                    <Input
                      placeholder="Applicant name"
                      value={manualEntry.customerName}
                      onChange={(e) => setManualEntry({ ...manualEntry, customerName: e.target.value })}
                      data-testid="input-manual-customer"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Business Name</label>
                    <Input
                      placeholder="Business/Company name"
                      value={manualEntry.businessName}
                      onChange={(e) => setManualEntry({ ...manualEntry, businessName: e.target.value })}
                      data-testid="input-manual-business"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Contact Details</label>
                    <Input
                      placeholder="Phone number"
                      value={manualEntry.contactDetails}
                      onChange={(e) => setManualEntry({ ...manualEntry, contactDetails: e.target.value })}
                      data-testid="input-manual-contact"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium mb-1 block">Address</label>
                    <Textarea
                      placeholder="Customer address"
                      value={manualEntry.customerAddress}
                      onChange={(e) => setManualEntry({ ...manualEntry, customerAddress: e.target.value })}
                      className="min-h-[60px]"
                      data-testid="input-manual-address"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">In Date</label>
                    <Input
                      placeholder="DD/MM/YYYY"
                      value={manualEntry.inDate}
                      onChange={(e) => setManualEntry({ ...manualEntry, inDate: e.target.value })}
                      data-testid="input-manual-indate"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Product</label>
                    <Input
                      placeholder="e.g., LIP, Home Loan"
                      value={manualEntry.product}
                      onChange={(e) => setManualEntry({ ...manualEntry, product: e.target.value })}
                      data-testid="input-manual-product"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Branch/Location</label>
                    <Input
                      placeholder="Branch name"
                      value={manualEntry.location}
                      onChange={(e) => setManualEntry({ ...manualEntry, location: e.target.value })}
                      data-testid="input-manual-location"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Initiated By</label>
                    <Input
                      placeholder="Person who initiated"
                      value={manualEntry.initiatedPerson}
                      onChange={(e) => setManualEntry({ ...manualEntry, initiatedPerson: e.target.value })}
                      data-testid="input-manual-initiated"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Work Nature</label>
                    <Input
                      placeholder="e.g., LIP, Home Loan, LAP"
                      value={manualEntry.workNature}
                      onChange={(e) => setManualEntry({ ...manualEntry, workNature: e.target.value })}
                      data-testid="input-manual-worknature"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setManualEntryDialogOpen(false)} data-testid="button-cancel-manual">
                    Cancel
                  </Button>
                  <Button onClick={handleManualEntrySubmit} disabled={createSingleMutation.isPending} data-testid="button-submit-manual">
                    {createSingleMutation.isPending ? "Adding..." : "Add Entry"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Intray Section - Shows entries assigned to current user */}
        {!user?.isAdmin && intrayEntries.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <Inbox className="h-5 w-5" />
                Your Intray ({intrayEntries.length})
              </CardTitle>
              <CardDescription>
                Cases assigned to you for PD. Upload report to clear from intray.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs px-2">Lead ID</TableHead>
                      <TableHead className="text-xs px-2">Applicant</TableHead>
                      <TableHead className="text-xs px-2">Business</TableHead>
                      <TableHead className="text-xs px-2">Phone</TableHead>
                      <TableHead className="text-xs px-2">Address</TableHead>
                      <TableHead className="text-xs px-2">Branch</TableHead>
                      <TableHead className="text-xs px-2">Product</TableHead>
                      <TableHead className="text-xs px-2">Initiated By</TableHead>
                      <TableHead className="text-xs px-2">Assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intrayEntries.map((entry) => (
                      <TableRow key={entry.id} className="bg-white" data-testid={`row-intray-${entry.id}`}>
                        <TableCell className="font-mono font-medium text-xs px-2">{entry.leadId}</TableCell>
                        <TableCell className="text-xs px-2">{entry.customerName}</TableCell>
                        <TableCell className="text-xs px-2">{entry.businessName || "-"}</TableCell>
                        <TableCell className="text-xs px-2">{entry.contactDetails || "-"}</TableCell>
                        <TableCell className="text-[9px] px-1 w-[350px] leading-tight" title={entry.customerAddress || ""}>
                          <div className="line-clamp-2">{entry.customerAddress || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs px-2">{entry.location || "-"}</TableCell>
                        <TableCell className="text-xs px-2">{entry.product || "-"}</TableCell>
                        <TableCell className="text-xs px-2 text-slate-600">{entry.initiatedPerson || "-"}</TableCell>
                        <TableCell className="text-xs px-2 text-slate-600">
                          {entry.assignedAt ? new Date(entry.assignedAt).toLocaleDateString() : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card id="mis-table">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Work Allocation List</CardTitle>
                <CardDescription>
                  Showing {filteredMisEntries.length} of {misEntries.length} entries
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Search Lead ID or Applicant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-[280px]"
                  data-testid="input-search-mis"
                />
                {searchQuery && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSearchQuery("")}
                    data-testid="button-clear-search"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-slate-500">Loading...</div>
            ) : misEntries.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No MIS entries yet. Click "Paste Email Data" to add work allocations.
              </div>
            ) : (
              <div 
                ref={scrollContainerRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="overflow-x-auto cursor-ew-resize"
              >
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px] text-xs px-2">SNO</TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterLeadId.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-lead-id-trigger">
                              Lead ID <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter Lead ID</span>
                              {filterLeadId.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterLeadId([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {uniqueValues.leadId.map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterLeadId.includes(value)} onCheckedChange={() => toggleFilter(filterLeadId, value, setFilterLeadId)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterApplicant.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-applicant-trigger">
                              Applicant <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter Applicant</span>
                              {filterApplicant.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterApplicant([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {uniqueValues.applicant.map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterApplicant.includes(value)} onCheckedChange={() => toggleFilter(filterApplicant, value, setFilterApplicant)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-2">Business</TableHead>
                      <TableHead className="text-xs px-2">Phone</TableHead>
                      <TableHead className="text-xs px-2">Address</TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterBranch.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-branch-trigger">
                              Branch <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter Branch</span>
                              {filterBranch.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterBranch([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {uniqueValues.branch.map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterBranch.includes(value)} onCheckedChange={() => toggleFilter(filterBranch, value, setFilterBranch)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterInDate.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-in-date-trigger">
                              In Date <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter In Date</span>
                              {filterInDate.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterInDate([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {uniqueValues.inDate.map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterInDate.includes(value)} onCheckedChange={() => toggleFilter(filterInDate, value, setFilterInDate)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterOutDate.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-out-date-trigger">
                              Out Date <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter Out Date</span>
                              {filterOutDate.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterOutDate([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {uniqueValues.outDate.map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterOutDate.includes(value)} onCheckedChange={() => toggleFilter(filterOutDate, value, setFilterOutDate)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterWorkNature.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-work-nature-trigger">
                              Work Nature <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter Work Nature</span>
                              {filterWorkNature.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterWorkNature([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {uniqueValues.workNature.map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterWorkNature.includes(value)} onCheckedChange={() => toggleFilter(filterWorkNature, value, setFilterWorkNature)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterInitiatedBy.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-initiated-by-trigger">
                              Initiated By <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter Initiated By</span>
                              {filterInitiatedBy.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterInitiatedBy([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {uniqueValues.initiatedBy.map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterInitiatedBy.includes(value)} onCheckedChange={() => toggleFilter(filterInitiatedBy, value, setFilterInitiatedBy)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterPdPerson.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-pd-person-trigger">
                              PD Person <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter PD Person</span>
                              {filterPdPerson.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterPdPerson([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-48">
                              <div className="space-y-1">
                                {associates.filter(a => !a.isAdmin).map(associate => (
                                  <label key={associate.id} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterPdPerson.includes(associate.id)} onCheckedChange={() => toggleFilter(filterPdPerson, associate.id, setFilterPdPerson)} />
                                    <span className="truncate">{associate.name}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="text-xs px-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={`flex items-center gap-1 hover:text-slate-900 ${filterStatus.length > 0 ? 'text-blue-600 font-semibold' : ''}`} data-testid="filter-status-trigger">
                              Status <ChevronDown className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-medium">Filter Status</span>
                              {filterStatus.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilterStatus([])}>Clear</Button>
                              )}
                            </div>
                            <ScrollArea className="h-32">
                              <div className="space-y-1">
                                {["Pending", "In Progress", "Completed"].map(value => (
                                  <label key={value} className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded cursor-pointer text-xs">
                                    <Checkbox checked={filterStatus.includes(value.toLowerCase())} onCheckedChange={() => toggleFilter(filterStatus, value.toLowerCase(), setFilterStatus)} />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                      </TableHead>
                      <TableHead className="w-[70px] text-xs px-2">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMisEntries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-mis-${entry.id}`}>
                        <TableCell className="font-mono text-xs px-2">{entrySnoMap.get(entry.id) || entry.sno}</TableCell>
                        <TableCell className="font-mono font-medium text-xs px-2">{entry.leadId}</TableCell>
                        <TableCell className="text-xs px-2">{entry.customerName}</TableCell>
                        <TableCell className="text-xs px-2">{entry.businessName || "-"}</TableCell>
                        <TableCell className="text-xs px-2">{entry.contactDetails || "-"}</TableCell>
                        <TableCell className="text-[9px] px-1 w-[350px] leading-tight" title={entry.customerAddress || ""}>
                          <div className="line-clamp-2">{entry.customerAddress || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs px-2">{entry.location || "-"}</TableCell>
                        <TableCell className="text-xs px-2 whitespace-nowrap">{entry.inDate || "-"}</TableCell>
                        <TableCell className="text-xs px-2 whitespace-nowrap">{entry.outDate || "-"}</TableCell>
                        <TableCell className="text-xs px-2">{(entry as any).workNature || "-"}</TableCell>
                        <TableCell className="text-xs px-2 text-slate-600">{entry.initiatedPerson || "-"}</TableCell>
                        <TableCell className="text-xs px-2 text-slate-600">{getAssociateName(entry.pdPersonId)}</TableCell>
                        <TableCell className="text-xs px-2">{getStatusBadge(entry.status)}</TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(entry)}
                              data-testid={`button-edit-${entry.id}`}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => deleteMutation.mutate(entry.id)}
                              data-testid={`button-delete-${entry.id}`}
                            >
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit MIS Entry</DialogTitle>
              <DialogDescription>Update the work allocation details</DialogDescription>
            </DialogHeader>
            {editEntry && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Lead ID</label>
                  <Input
                    value={editEntry.leadId}
                    onChange={(e) => setEditEntry({ ...editEntry, leadId: e.target.value })}
                    data-testid="input-edit-leadId"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Applicant Name</label>
                  <Input
                    value={editEntry.customerName}
                    onChange={(e) => setEditEntry({ ...editEntry, customerName: e.target.value })}
                    data-testid="input-edit-customerName"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Business Name</label>
                  <Input
                    value={editEntry.businessName || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, businessName: e.target.value })}
                    data-testid="input-edit-businessName"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone Number</label>
                  <Input
                    value={editEntry.contactDetails || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, contactDetails: e.target.value })}
                    data-testid="input-edit-contactDetails"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Address</label>
                  <Input
                    value={editEntry.customerAddress || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, customerAddress: e.target.value })}
                    data-testid="input-edit-customerAddress"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">In Date</label>
                  <Input
                    value={editEntry.inDate || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, inDate: e.target.value })}
                    data-testid="input-edit-inDate"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Out Date</label>
                  <Input
                    value={editEntry.outDate || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, outDate: e.target.value })}
                    data-testid="input-edit-outDate"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Initiated Person</label>
                  <Input
                    value={editEntry.initiatedPerson || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, initiatedPerson: e.target.value })}
                    data-testid="input-edit-initiatedPerson"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Product</label>
                  <Input
                    value={editEntry.product || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, product: e.target.value })}
                    data-testid="input-edit-product"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">PD Person</label>
                  <Select
                    value={editEntry.pdPersonId || "unassigned"}
                    onValueChange={(value) => {
                      const pdPersonId = value === "unassigned" ? null : value;
                      const associate = associates.find(a => a.id === value);
                      setEditEntry({ 
                        ...editEntry, 
                        pdPersonId,
                        pdPerson: associate?.name || null,
                        workflowStatus: pdPersonId ? "assigned" : "unassigned"
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-edit-pdPerson">
                      <SelectValue placeholder="Select PD Person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">-- Not Assigned --</SelectItem>
                      {associates.filter(a => !a.isAdmin).map((associate) => (
                        <SelectItem key={associate.id} value={associate.id}>
                          {associate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Branch</label>
                  <Input
                    value={editEntry.location || ""}
                    onChange={(e) => setEditEntry({ ...editEntry, location: e.target.value })}
                    data-testid="input-edit-location"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={editEntry.status || "Pending"}
                    onValueChange={(value) => setEditEntry({ ...editEntry, status: value })}
                  >
                    <SelectTrigger data-testid="select-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleEditSave} disabled={updateMutation.isPending} data-testid="button-save-edit">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuditLayout>
  );
}
