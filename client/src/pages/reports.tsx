import AuditLayout from "@/components/layout/audit-layout";
import { useAudit } from "@/lib/audit-context";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Filter, ArrowRightLeft, Calendar, Info, AlertCircle, CheckCircle, Camera, ShieldCheck, Activity, Image as ImageIcon, AlertTriangle, Scale, BrainCircuit, Clock, Timer, Trash2, Download, RefreshCw, FileText, Edit } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { format, parse, isValid } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ReportsPage() {
  const { reports, associates, deleteReport } = useAudit();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rescoringId, setRescoringId] = useState<string | null>(null);
  const [editingInitiation, setEditingInitiation] = useState<string | null>(null);
  const [initiationDate, setInitiationDate] = useState("");
  const [savingInitiation, setSavingInitiation] = useState(false);
  const [editingDelay, setEditingDelay] = useState<string | null>(null);
  const [delayReason, setDelayReason] = useState("");
  const [delayRemark, setDelayRemark] = useState("");
  const [savingDelay, setSavingDelay] = useState(false);
  const queryClient = useQueryClient();

  // MIS Edit state
  const [editingMisEntry, setEditingMisEntry] = useState<any | null>(null);
  const [editMisStatus, setEditMisStatus] = useState("");
  const [editMisOutDate, setEditMisOutDate] = useState("");
  const [editMisOutTime, setEditMisOutTime] = useState("");
  const [savingMis, setSavingMis] = useState(false);

  // MIS update mutation
  const updateMisMutation = useMutation({
    mutationFn: async (data: { id: number; updates: any }) => {
      const res = await fetch(`/api/mis/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.updates),
      });
      if (!res.ok) throw new Error("Failed to update MIS entry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      setEditingMisEntry(null);
      setSavingMis(false);
    },
    onError: () => {
      setSavingMis(false);
    }
  });

  // Date filter for MIS cases (default: first of month to today)
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [misFromDate, setMisFromDate] = useState(format(firstDayOfMonth, "yyyy-MM-dd"));
  const [misToDate, setMisToDate] = useState(format(today, "yyyy-MM-dd"));

  // Fetch MIS entries for current associate
  const { data: misEntries = [] } = useQuery<any[]>({
    queryKey: ["/api/mis"],
    queryFn: async () => {
      const res = await fetch("/api/mis");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Parse MIS date helper
  const parseMisDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    
    // Try DD/MM/YYYY format
    let parsed = parse(dateStr, "dd/MM/yyyy", new Date());
    if (isValid(parsed)) return parsed;
    
    // Try DD-MM-YYYY format
    parsed = parse(dateStr, "dd-MM-yyyy", new Date());
    if (isValid(parsed)) return parsed;
    
    // Try ISO format
    parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
    
    return null;
  };

  // Filter MIS entries for current associate within date range
  const myMisData = useMemo(() => {
    if (!user?.id || user?.isAdmin) return { total: 0, completed: 0, pending: 0 };
    
    const fromDate = new Date(misFromDate);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(misToDate);
    toDate.setHours(23, 59, 59, 999);

    const myEntries = misEntries.filter(entry => {
      if (entry.pdPersonId !== user.id) return false;
      
      const entryDate = parseMisDate(entry.inDate);
      if (!entryDate) return false;
      
      return entryDate >= fromDate && entryDate <= toDate;
    });

    const total = myEntries.length;
    const completed = myEntries.filter(e => e.outDate && e.outDate.trim() !== "" && e.status !== "Cancelled").length;
    const cancelled = myEntries.filter(e => e.status === "Cancelled").length;
    const pending = total - completed - cancelled;

    return { total, completed, pending, cancelled };
  }, [misEntries, user, misFromDate, misToDate]);

  const TAT_DELAY_REASONS = [
    "Customer not available",
    "Address not traceable",
    "Delayed initiation",
    "Heavy workload",
    "Travel/Distance constraints",
    "Document pending",
    "Weather conditions",
    "Other"
  ];

  const handleSaveTATDelay = async (reportId: string) => {
    setSavingDelay(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/tat-delay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: delayReason || null, remark: delayRemark || null })
      });
      
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
        setEditingDelay(null);
        setDelayReason("");
        setDelayRemark("");
      }
    } catch (error) {
      console.error('Failed to update TAT delay:', error);
    } finally {
      setSavingDelay(false);
    }
  };

  const handleSaveInitiationDate = async (reportId: string) => {
    if (!initiationDate) return;
    
    setSavingInitiation(true);
    try {
      const dateOnly = new Date(`${initiationDate}T00:00:00`);
      const response = await fetch(`/api/reports/${reportId}/initiation-time`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initiationTime: dateOnly.toISOString() })
      });
      
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
        setEditingInitiation(null);
        setInitiationDate("");
      }
    } catch (error) {
      console.error('Failed to update initiation date:', error);
    } finally {
      setSavingInitiation(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const success = await deleteReport(id);
    setDeletingId(null);
    if (success) {
      setSelectedReports(prev => prev.filter(r => r !== id));
    }
  };

  const handleRescore = async (id: string) => {
    setRescoringId(id);
    try {
      const response = await fetch(`/api/reports/${id}/rescore`, {
        method: 'POST',
      });
      
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      } else {
        const error = await response.json();
        console.error('Failed to rescore report:', error);
      }
    } catch (error) {
      console.error('Failed to rescore report:', error);
    } finally {
      setRescoringId(null);
    }
  };

  // Debug: Log to help diagnose production issues
  console.log('[REPORTS PAGE] Total reports loaded:', reports.length);
  
  const filteredReports = reports.filter(r => 
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAssociate = (associateId: string) => {
    return associates.find(a => a.id === associateId);
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-600";
    if (score >= 70) return "text-amber-600";
    return "text-rose-600";
  };

  const getProgressColor = (score: number) => {
    if (score >= 90) return "bg-emerald-500";
    if (score >= 70) return "bg-amber-500";
    return "bg-rose-500";
  };

  // Find MIS entry by leadId
  const getMisEntryByLeadId = (leadId: string | null) => {
    if (!leadId) return null;
    return misEntries.find((m: any) => m.leadId?.toLowerCase() === leadId.toLowerCase());
  };

  // Handle opening MIS edit dialog
  const handleEditMis = (report: any) => {
    const misEntry = getMisEntryByLeadId(report.leadId);
    if (misEntry) {
      setEditingMisEntry(misEntry);
      setEditMisStatus(misEntry.status || "Pending");
      setEditMisOutDate(misEntry.outDate || "");
      setEditMisOutTime(misEntry.outTime || "");
    }
  };

  // Handle saving MIS updates
  const handleSaveMis = () => {
    if (!editingMisEntry) return;
    setSavingMis(true);
    updateMisMutation.mutate({
      id: editingMisEntry.id,
      updates: {
        status: editMisStatus,
        outDate: editMisOutDate,
        outTime: editMisOutTime,
      }
    });
  };

  const toggleSelection = (id: string) => {
    if (selectedReports.includes(id)) {
      setSelectedReports(selectedReports.filter(r => r !== id));
    } else {
      if (selectedReports.length < 3) {
        setSelectedReports([...selectedReports, id]);
      }
    }
  };

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports Analysis</h1>
            <p className="text-slate-500">Compare report quality and completeness across associates.</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/compare?ids=${selectedReports.join(',')}`}>
              <Button disabled={selectedReports.length < 2} className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Compare ({selectedReports.length})
              </Button>
            </Link>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
               <SelectTrigger className="w-[180px]">
                 <SelectValue placeholder="Filter by Month" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">All Months</SelectItem>
                 <SelectItem value="october">October 2024</SelectItem>
                 <SelectItem value="november">November 2024</SelectItem>
                 <SelectItem value="december">December 2024</SelectItem>
               </SelectContent>
             </Select>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <Search className="text-slate-400 h-5 w-5" />
          <Input 
            placeholder="Search by Lead ID (e.g., A1_20251101 or bhara01112025)..." 
            className="border-none shadow-none focus-visible:ring-0 px-0"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-lead-id"
          />
        </div>

        {!user?.isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                My Cases (from MIS)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">From:</Label>
                  <Input
                    type="date"
                    value={misFromDate}
                    onChange={(e) => setMisFromDate(e.target.value)}
                    className="w-[150px]"
                    data-testid="input-mis-from-date"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">To:</Label>
                  <Input
                    type="date"
                    value={misToDate}
                    onChange={(e) => setMisToDate(e.target.value)}
                    className="w-[150px]"
                    data-testid="input-mis-to-date"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{myMisData.total}</div>
                  <div className="text-sm text-slate-600">Total Allotted</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{myMisData.completed}</div>
                  <div className="text-sm text-slate-600">Completed</div>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-amber-600">{myMisData.pending}</div>
                  <div className="text-sm text-slate-600">Pending</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">{myMisData.cancelled}</div>
                  <div className="text-sm text-slate-600">Cancelled</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="w-[50px]"></TableHead>
                <TableHead className="w-[300px]">Report Details</TableHead>
                <TableHead>Associate</TableHead>
                <TableHead>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 cursor-help">
                        Comprehensive <Info className="h-3 w-3 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Evaluates risk analysis depth, photo evidence, and due diligence</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead>
                   <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 cursor-help">
                        Decision <Info className="h-3 w-3 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Customer Profile Status & AI Validation</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead>
                   <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 cursor-help">
                        TAT <Info className="h-3 w-3 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Turnaround Time from trigger email to report submission</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead>
                   <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 cursor-help">
                        Delay Reason <Info className="h-3 w-3 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Reason for TAT delay (if applicable)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-right">Overall Score</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => {
                const associate = getAssociate(report.associateId);
                const isSelected = selectedReports.includes(report.id);
                const missingCount = report.metrics ? (report.metrics.totalFields - report.metrics.filledFields) : 0;
                const photoMismatchCount = report.metrics?.photoValidation?.missedDetails.length || 0;
                const missingFieldsList = report.metrics?.missingFields || [];
                const remainingMissingCount = Math.max(0, missingCount - missingFieldsList.length);
                
                return (
                  <TableRow key={report.id} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell>
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(report.id)}
                        disabled={!isSelected && selectedReports.length >= 3}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900">{report.title}</div>
                        <div className="text-xs text-slate-500 font-mono">{report.leadId || report.id}_{format(new Date(report.date), 'ddMMyy')}</div>
                        {report.createdAt && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Uploaded: {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}
                            {report.fileSize && (
                              <span className="ml-2">• {(report.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={associate?.avatar} />
                          <AvatarFallback>{associate?.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <div className="font-medium text-slate-900">{associate?.name}</div>
                          <div className="text-xs text-slate-500">{associate?.role}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <HoverCard openDelay={0} closeDelay={100}>
                        <HoverCardTrigger>
                          <div className="space-y-1 w-[140px] cursor-help">
                            <div className="flex justify-between text-xs items-end">
                              <span className="text-slate-500">
                                {report.metrics?.riskAnalysisDepth || 'Medium'} Risk Analysis
                              </span>
                              <span className={`text-xs flex items-center gap-1 ${photoMismatchCount > 0 ? 'text-amber-600 font-medium' : ''}`}>
                                {photoMismatchCount > 0 && <AlertTriangle className="h-3 w-3" />}
                                <span className="font-bold text-slate-900">{report.scores.comprehensive}%</span>
                              </span>
                            </div>
                            <Progress value={report.scores.comprehensive} className="h-1.5" indicatorClassName={getProgressColor(report.scores.comprehensive)} />
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent side="right" className="w-[320px] p-0 overflow-hidden shadow-lg max-h-[70vh]" align="start">
                          <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 sticky top-0 z-10">
                            <span className="font-semibold text-slate-900 text-xs">Comprehensive Score Breakdown</span>
                          </div>
                          <div className="p-3 space-y-2 overflow-y-auto max-h-[calc(70vh-40px)]">
                            {/* Personal Details with breakdown */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">Personal Details</span>
                                <span className={`font-medium ${(report.scores.comprehensiveBreakdown?.personal ?? 0) === 15 ? 'text-emerald-600' : (report.scores.comprehensiveBreakdown?.personal ?? 0) >= 9 ? 'text-slate-900' : 'text-amber-600'}`}>
                                  {report.scores.comprehensiveBreakdown?.personal ?? 0}/15
                                </span>
                              </div>
                              <Progress value={((report.scores.comprehensiveBreakdown?.personal ?? 0) / 15) * 100} className="h-1" indicatorClassName={(report.scores.comprehensiveBreakdown?.personal ?? 0) === 15 ? 'bg-emerald-500' : (report.scores.comprehensiveBreakdown?.personal ?? 0) >= 9 ? 'bg-blue-500' : 'bg-amber-500'} />
                              <div className="ml-3 mt-1 space-y-0.5 text-[10px] text-slate-500 border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  const pm = report.scores.comprehensiveBreakdown?.personalMatches as Record<string, boolean> | undefined;
                                  const items = [
                                    { name: 'Self Education', key: 'selfEducation' },
                                    { name: 'Spouse Name', key: 'spouseName' },
                                    { name: 'Spouse Education', key: 'spouseEducation' },
                                    { name: 'Spouse Employment', key: 'spouseEmployment' },
                                    { name: 'Mention about Kids', key: 'mentionAboutKids' },
                                    { name: 'Kids Education', key: 'kidsEducation' },
                                    { name: 'Kids School', key: 'kidsSchool' },
                                    { name: 'Residence Vintage', key: 'residenceVintage' },
                                    { name: 'Monthly Rent (if rented)', key: 'monthlyRentIfRented' },
                                    { name: 'Residence Owned/Rented', key: 'residenceOwnedOrRented' }
                                  ];
                                  return items.map((item, idx) => {
                                    const isMet = pm ? pm[item.key] : false;
                                    return (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {item.name}</span>
                                        <span className={isMet ? 'text-emerald-600' : 'text-slate-400'}>{isMet ? '✓' : '—'}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>

                            {/* Business Details with breakdown */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">Business Details</span>
                                <span className={`font-medium ${(report.scores.comprehensiveBreakdown?.business ?? 0) === 30 ? 'text-emerald-600' : (report.scores.comprehensiveBreakdown?.business ?? 0) >= 18 ? 'text-slate-900' : 'text-amber-600'}`}>
                                  {report.scores.comprehensiveBreakdown?.business ?? 0}/30
                                </span>
                              </div>
                              <Progress value={((report.scores.comprehensiveBreakdown?.business ?? 0) / 30) * 100} className="h-1" indicatorClassName={(report.scores.comprehensiveBreakdown?.business ?? 0) === 30 ? 'bg-emerald-500' : (report.scores.comprehensiveBreakdown?.business ?? 0) >= 18 ? 'bg-blue-500' : 'bg-amber-500'} />
                              <div className="ml-3 mt-1 space-y-0.5 text-[10px] text-slate-500 border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  const bm = report.scores.comprehensiveBreakdown?.businessMatches as Record<string, boolean> | undefined;
                                  const coreItems = [
                                    { name: 'Business Name', key: 'businessName' },
                                    { name: 'Nature of Business', key: 'natureOfBusiness' },
                                    { name: 'Existence at Current Place', key: 'existenceCurrentPlace' },
                                    { name: 'Licenses/Registrations', key: 'licensesRegistrations' },
                                    { name: 'Promoter Experience/Qualifications', key: 'promoterExperienceQualifications' },
                                    { name: 'Strategic Vision/Clarity', key: 'strategicVisionClarity' },
                                    { name: 'Employees Seen', key: 'employeesSeen' },
                                    { name: 'Monthly Turnover', key: 'monthlyTurnover' },
                                    { name: 'Client List/Concentration Risk', key: 'clientListConcentrationRisk' },
                                    { name: 'Activity During Visit', key: 'activityDuringVisit' },
                                    { name: 'Monthly Income', key: 'monthlyIncome' },
                                    { name: 'Seasonality', key: 'seasonality' },
                                    { name: 'Infra Supports Turnover', key: 'infraSupportsTurnover' }
                                  ];
                                  const mfgItems = [
                                    { name: 'Mfg: Raw Material Sourcing/Storage', key: 'mfgRawMaterialSourcingStorage' },
                                    { name: 'Mfg: Process Flow', key: 'mfgProcessFlow' },
                                    { name: 'Mfg: Capacity vs Utilization', key: 'mfgCapacityVsUtilization' },
                                    { name: 'Mfg: Machinery/Automation/Maintenance', key: 'mfgMachineryMakeAutomationMaintenance' },
                                    { name: 'Mfg: Inventory FIFO/Aging', key: 'mfgInventoryFifoAging' },
                                    { name: 'Mfg: Quality Control', key: 'mfgQualityControl' }
                                  ];
                                  const tradingItems = [
                                    { name: 'Trading: Product Range/Inventory', key: 'tradingProductRangeInventoryMovement' },
                                    { name: 'Trading: Purchase/Sales Cycle', key: 'tradingPurchaseSalesCycle' },
                                    { name: 'Trading: Warehouse/Stock Seen', key: 'tradingWarehouseStockSeen' }
                                  ];
                                  const svcItems = [
                                    { name: 'Svc: Documentation of Delivery', key: 'svcDocumentationOfDelivery' },
                                    { name: 'Svc: Technology/Systems', key: 'svcTechnologySystems' },
                                    { name: 'Svc: Client List/Contracts/Revenue', key: 'svcClientListContractsRevenueModel' },
                                    { name: 'Svc: Contract-based or Walk-in', key: 'svcContractBasedOrWalkin' }
                                  ];
                                  const hasMfg = mfgItems.some(item => bm?.[item.key]);
                                  const hasTrading = tradingItems.some(item => bm?.[item.key]);
                                  const hasSvc = svcItems.some(item => bm?.[item.key]);
                                  let allItems = [...coreItems];
                                  if (hasMfg) allItems = [...allItems, ...mfgItems];
                                  if (hasTrading) allItems = [...allItems, ...tradingItems];
                                  if (hasSvc) allItems = [...allItems, ...svcItems];
                                  if (!hasMfg && !hasTrading && !hasSvc) allItems = [...allItems, ...mfgItems, ...tradingItems, ...svcItems];
                                  return allItems.map((item, idx) => {
                                    const isMet = bm ? bm[item.key] : false;
                                    return (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {item.name}</span>
                                        <span className={isMet ? 'text-emerald-600' : 'text-slate-400'}>{isMet ? '✓' : '—'}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                            
                            {/* Banking with detailed breakdown */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">Banking</span>
                                <span className={`font-medium ${(report.scores.comprehensiveBreakdown?.banking ?? 0) === 15 ? 'text-emerald-600' : (report.scores.comprehensiveBreakdown?.banking ?? 0) >= 9 ? 'text-slate-900' : 'text-amber-600'}`}>
                                  {report.scores.comprehensiveBreakdown?.banking ?? 0}/15
                                </span>
                              </div>
                              <Progress value={((report.scores.comprehensiveBreakdown?.banking ?? 0) / 15) * 100} className="h-1" indicatorClassName={(report.scores.comprehensiveBreakdown?.banking ?? 0) === 15 ? 'bg-emerald-500' : (report.scores.comprehensiveBreakdown?.banking ?? 0) >= 9 ? 'bg-blue-500' : 'bg-amber-500'} />
                              <div className="ml-3 mt-1 space-y-0.5 text-[10px] text-slate-500 border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  const bkm = report.scores.comprehensiveBreakdown?.bankingMatches as Record<string, boolean> | undefined;
                                  const items = [
                                    { name: 'Primary Banker Name', key: 'primaryBankerName' },
                                    { name: 'Turnover Credited %', key: 'turnoverCreditedPercent' },
                                    { name: 'Banking Tenure', key: 'bankingTenure' },
                                    { name: 'EMIs Routed Bank', key: 'emisRoutedBank' },
                                    { name: 'QR Code Spotted', key: 'qrCodeSpotted' }
                                  ];
                                  return items.map((item, idx) => {
                                    const isMet = bkm ? bkm[item.key] : false;
                                    return (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {item.name}</span>
                                        <span className={isMet ? 'text-emerald-600' : 'text-slate-400'}>{isMet ? '✓' : '—'}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>

                            {/* Networth/Asset with breakdown */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">Networth/Asset</span>
                                <span className={`font-medium ${(report.scores.comprehensiveBreakdown?.networth ?? 0) === 10 ? 'text-emerald-600' : (report.scores.comprehensiveBreakdown?.networth ?? 0) >= 6 ? 'text-slate-900' : 'text-amber-600'}`}>
                                  {report.scores.comprehensiveBreakdown?.networth ?? 0}/10
                                </span>
                              </div>
                              <Progress value={((report.scores.comprehensiveBreakdown?.networth ?? 0) / 10) * 100} className="h-1" indicatorClassName={(report.scores.comprehensiveBreakdown?.networth ?? 0) === 10 ? 'bg-emerald-500' : (report.scores.comprehensiveBreakdown?.networth ?? 0) >= 6 ? 'bg-blue-500' : 'bg-amber-500'} />
                              <div className="ml-3 mt-1 space-y-0.5 text-[10px] text-slate-500 border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  const nm = report.scores.comprehensiveBreakdown?.networthMatches as Record<string, boolean> | undefined;
                                  const items = [
                                    { name: 'Properties Owned', key: 'propertiesOwned' },
                                    { name: 'Vehicles Owned', key: 'vehiclesOwned' },
                                    { name: 'Other Investments', key: 'otherInvestments' },
                                    { name: 'Business Place Owned', key: 'businessPlaceOwned' },
                                    { name: 'Total Networth Available', key: 'totalNetworthAvailable' }
                                  ];
                                  return items.map((item, idx) => {
                                    const isMet = nm ? nm[item.key] : false;
                                    return (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {item.name}</span>
                                        <span className={isMet ? 'text-emerald-600' : 'text-slate-400'}>{isMet ? '✓' : '—'}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>

                            {/* Existing Debt with breakdown */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">Existing Debt</span>
                                <span className={`font-medium ${(report.scores.comprehensiveBreakdown?.existingDebt ?? 0) === 10 ? 'text-emerald-600' : (report.scores.comprehensiveBreakdown?.existingDebt ?? 0) >= 6 ? 'text-slate-900' : 'text-amber-600'}`}>
                                  {report.scores.comprehensiveBreakdown?.existingDebt ?? 0}/10
                                </span>
                              </div>
                              <Progress value={((report.scores.comprehensiveBreakdown?.existingDebt ?? 0) / 10) * 100} className="h-1" indicatorClassName={(report.scores.comprehensiveBreakdown?.existingDebt ?? 0) === 10 ? 'bg-emerald-500' : (report.scores.comprehensiveBreakdown?.existingDebt ?? 0) >= 6 ? 'bg-blue-500' : 'bg-amber-500'} />
                              <div className="ml-3 mt-1 space-y-0.5 text-[10px] text-slate-500 border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  const dm = report.scores.comprehensiveBreakdown?.debtMatches as Record<string, boolean> | undefined;
                                  const items = [
                                    { name: 'Has Existing Loans', key: 'hasExistingLoans' },
                                    { name: 'Loan List Available', key: 'loanListAvailable' },
                                    { name: 'Can Service New Loan', key: 'canServiceNewLoan' },
                                    { name: 'Repayment History Quality', key: 'repaymentHistoryQuality' },
                                    { name: 'Loans Source/Bank/Nature', key: 'loansSourceBankNature' }
                                  ];
                                  return items.map((item, idx) => {
                                    const isMet = dm ? dm[item.key] : false;
                                    return (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {item.name}</span>
                                        <span className={isMet ? 'text-emerald-600' : 'text-slate-400'}>{isMet ? '✓' : '—'}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>

                            {/* End Use with breakdown */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">End Use</span>
                                <span className={`font-medium ${(report.scores.comprehensiveBreakdown?.endUse ?? 0) === 10 ? 'text-emerald-600' : (report.scores.comprehensiveBreakdown?.endUse ?? 0) >= 6 ? 'text-slate-900' : 'text-amber-600'}`}>
                                  {report.scores.comprehensiveBreakdown?.endUse ?? 0}/10
                                </span>
                              </div>
                              <Progress value={((report.scores.comprehensiveBreakdown?.endUse ?? 0) / 10) * 100} className="h-1" indicatorClassName={(report.scores.comprehensiveBreakdown?.endUse ?? 0) === 10 ? 'bg-emerald-500' : (report.scores.comprehensiveBreakdown?.endUse ?? 0) >= 6 ? 'bg-blue-500' : 'bg-amber-500'} />
                              <div className="ml-3 mt-1 space-y-0.5 text-[10px] text-slate-500 border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  const em = report.scores.comprehensiveBreakdown?.endUseMatches as Record<string, boolean> | undefined;
                                  const items = [
                                    { name: 'Agreement Value Available', key: 'agreementValueAvailable' },
                                    { name: 'Advance Paid (Cash/Bank)', key: 'advancePaidCashOrBankAmount' },
                                    { name: 'Will Occupy Post Purchase', key: 'willOccupyPostPurchase' },
                                    { name: 'Mortgage Funds Use', key: 'mortgageFundsUse' },
                                    { name: 'Additional Use Information', key: 'additionalUseInformation' }
                                  ];
                                  return items.map((item, idx) => {
                                    const isMet = em ? em[item.key] : false;
                                    return (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {item.name}</span>
                                        <span className={isMet ? 'text-emerald-600' : 'text-slate-400'}>{isMet ? '✓' : '—'}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>

                            {/* Reference Checks with breakdown */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 font-medium">Reference Checks</span>
                                <span className={`font-medium ${(report.scores.comprehensiveBreakdown?.referenceChecks ?? 0) === 10 ? 'text-emerald-600' : (report.scores.comprehensiveBreakdown?.referenceChecks ?? 0) >= 6 ? 'text-slate-900' : 'text-amber-600'}`}>
                                  {report.scores.comprehensiveBreakdown?.referenceChecks ?? 0}/10
                                </span>
                              </div>
                              <Progress value={((report.scores.comprehensiveBreakdown?.referenceChecks ?? 0) / 10) * 100} className="h-1" indicatorClassName={(report.scores.comprehensiveBreakdown?.referenceChecks ?? 0) === 10 ? 'bg-emerald-500' : (report.scores.comprehensiveBreakdown?.referenceChecks ?? 0) >= 6 ? 'bg-blue-500' : 'bg-amber-500'} />
                              <div className="ml-3 mt-1 space-y-0.5 text-[10px] text-slate-500 border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  const rm = report.scores.comprehensiveBreakdown?.referenceMatches as Record<string, boolean> | undefined;
                                  const items = [
                                    { name: 'Personal/Neighbour Ref', key: 'personalRefNeighbours' },
                                    { name: 'Business/Buyers/Sellers Ref', key: 'businessRefBuyersSellers' },
                                    { name: 'Invoice Verification', key: 'invoiceVerification' }
                                  ];
                                  return items.map((item, idx) => {
                                    const isMet = rm ? rm[item.key] : false;
                                    return (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {item.name}</span>
                                        <span className={isMet ? 'text-emerald-600' : 'text-slate-400'}>{isMet ? '✓' : '—'}</span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                            <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-900">Total Score</span>
                              <span className="text-sm font-bold text-slate-900">{report.scores.comprehensive}/100</span>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      <HoverCard openDelay={0} closeDelay={100}>
                        <HoverCardTrigger>
                          <div className="space-y-1 w-[120px] cursor-help text-left">
                            <Badge 
                              variant="outline" 
                              className={`
                                ${report.decision?.status === 'Positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                  report.decision?.status === 'Negative' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
                                  'bg-amber-50 text-amber-700 border-amber-200'}
                                font-semibold
                              `}
                            >
                              {report.decision?.status || 'Pending'}
                            </Badge>
                            {report.decision?.aiValidation && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                                <BrainCircuit className="h-3 w-3" />
                                <span>{report.decision.aiValidation.confidence}% AI Confidence</span>
                              </div>
                            )}
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent side="right" className="w-[300px] p-0 overflow-hidden shadow-lg" align="start">
                          <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                            <span className="font-semibold text-slate-900 text-xs">Decision Rationale</span>
                            <Badge variant="outline" className="text-[10px] h-5 bg-white">
                              {report.decision?.status}
                            </Badge>
                          </div>
                          <div className="p-3 space-y-3">
                            <div className="space-y-1">
                              <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                <Scale className="h-3 w-3" /> Associate Remarks
                              </span>
                              <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                                "{report.decision?.remarks || 'No remarks provided.'}"
                              </p>
                            </div>
                            
                            {report.decision?.aiValidation && (
                              <div className="space-y-1 pt-2 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                    <BrainCircuit className="h-3 w-3" /> AI Validation
                                  </span>
                                  <span className={`text-[10px] font-bold ${report.decision.aiValidation.confidence > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    {report.decision.aiValidation.confidence}% Match
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 italic">
                                  {report.decision.aiValidation.reasoning}
                                </p>
                              </div>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      <HoverCard openDelay={0} closeDelay={100}>
                        <HoverCardTrigger>
                          <div className="space-y-1 w-[120px] cursor-help">
                            {report.tat?.totalTATHours != null ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-slate-500" />
                                  <span className={`text-sm font-bold ${report.tat.totalTATHours <= 48 ? 'text-emerald-600' : report.tat.totalTATHours <= 120 ? 'text-amber-600' : 'text-rose-600'}`}>
                                    {report.tat.totalTATHours < 24 ? `${report.tat.totalTATHours}h` : `${Math.round(report.tat.totalTATHours / 24 * 10) / 10}d`}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 space-y-0.5">
                                  {report.tat.initiationTime && <div>Init: {format(new Date(report.tat.initiationTime), 'dd/MM/yyyy')}</div>}
                                  {report.tat.visitTime && <div>Visit: {format(new Date(report.tat.visitTime), 'dd/MM HH:mm')}</div>}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Not available</span>
                            )}
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent side="right" className="w-[320px] p-0 overflow-hidden shadow-lg" align="start">
                          <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
                            <span className="font-semibold text-slate-900 text-xs">Turnaround Time Details</span>
                          </div>
                          <div className="p-3 space-y-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-medium">Initiation Date</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-medium text-slate-900">
                                    {report.tat?.initiationTime ? format(new Date(report.tat.initiationTime), 'MMM d, yyyy') : <span className="text-slate-400 italic">Not found</span>}
                                  </span>
                                  <Dialog open={editingInitiation === report.id} onOpenChange={(open) => {
                                    if (open) {
                                      setEditingInitiation(report.id);
                                      if (report.tat?.initiationTime) {
                                        const dt = new Date(report.tat.initiationTime);
                                        setInitiationDate(dt.toISOString().split('T')[0]);
                                      } else {
                                        setInitiationDate("");
                                      }
                                    } else {
                                      setEditingInitiation(null);
                                    }
                                  }}>
                                    <DialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-slate-100" data-testid={`button-edit-initiation-${report.id}`}>
                                        <Pencil className="h-3 w-3 text-slate-400" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-sm">
                                      <DialogHeader>
                                        <DialogTitle>Set Initiation Date</DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                          <Label htmlFor="init-date">Date</Label>
                                          <Input 
                                            id="init-date" 
                                            type="date" 
                                            value={initiationDate} 
                                            onChange={(e) => setInitiationDate(e.target.value)}
                                            data-testid="input-initiation-date"
                                          />
                                        </div>
                                      </div>
                                      <DialogFooter>
                                        <DialogClose asChild>
                                          <Button variant="outline">Cancel</Button>
                                        </DialogClose>
                                        <Button 
                                          onClick={() => handleSaveInitiationDate(report.id)} 
                                          disabled={!initiationDate || savingInitiation}
                                          data-testid="button-save-initiation"
                                        >
                                          {savingInitiation ? 'Saving...' : 'Save'}
                                        </Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-medium">Visit Time</span>
                                <span className="text-xs font-medium text-slate-900">
                                  {report.tat?.visitTime ? format(new Date(report.tat.visitTime), 'MMM d, yyyy h:mm a') : <span className="text-slate-400 italic">Not found</span>}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-medium">Report Date</span>
                                <span className="text-xs font-medium text-slate-900">
                                  {report.tat?.reportDate ? format(new Date(report.tat.reportDate), 'MMM d, yyyy') : report.date}
                                </span>
                              </div>
                            </div>
                            <div className="border-t border-slate-100 pt-2 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <Timer className="h-3 w-3" /> Initiation → Visit
                                </span>
                                <Badge variant={report.tat?.initiationToVisitHours != null && report.tat.initiationToVisitHours <= 24 ? 'default' : 'secondary'} className="text-[10px] h-5">
                                  {report.tat?.initiationToVisitHours != null ? `${report.tat.initiationToVisitHours}h` : 'N/A'}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <Timer className="h-3 w-3" /> Visit → Report
                                </span>
                                <Badge variant={report.tat?.visitToReportHours != null && report.tat.visitToReportHours <= 24 ? 'default' : 'secondary'} className="text-[10px] h-5">
                                  {report.tat?.visitToReportHours != null ? `${report.tat.visitToReportHours}h` : 'N/A'}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                                  <Clock className="h-3 w-3" /> Total TAT
                                </span>
                                <Badge variant={report.tat?.totalTATHours != null && report.tat.totalTATHours <= 48 ? 'default' : report.tat?.totalTATHours != null && report.tat.totalTATHours <= 120 ? 'secondary' : 'destructive'} className="text-[10px] h-5">
                                  {report.tat?.totalTATHours != null ? `${Math.round(report.tat.totalTATHours / 24 * 10) / 10} days` : 'N/A'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      <Dialog open={editingDelay === report.id} onOpenChange={(open) => {
                        if (open) {
                          setEditingDelay(report.id);
                          setDelayReason(report.tatDelayReason || "");
                          setDelayRemark(report.tatDelayRemark || "");
                        } else {
                          setEditingDelay(null);
                          setDelayReason("");
                          setDelayRemark("");
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="flex flex-col items-start gap-1 h-auto py-1 px-2 hover:bg-slate-100"
                            data-testid={`button-delay-reason-${report.id}`}
                          >
                            {report.tatDelayReason ? (
                              <>
                                <span className="text-xs text-slate-700 font-medium">{report.tatDelayReason}</span>
                                {report.tatDelayRemark && (
                                  <span className="text-[10px] text-slate-500 max-w-[120px] truncate">{report.tatDelayRemark}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Pencil className="h-3 w-3" /> Add reason
                              </span>
                            )}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm">
                          <DialogHeader>
                            <DialogTitle>TAT Delay Reason</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="delay-reason">Reason</Label>
                              <Select value={delayReason} onValueChange={setDelayReason}>
                                <SelectTrigger data-testid="select-delay-reason">
                                  <SelectValue placeholder="Select reason..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {TAT_DELAY_REASONS.map((reason) => (
                                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="delay-remark">Remark (optional)</Label>
                              <Input 
                                id="delay-remark"
                                placeholder="Additional details..."
                                value={delayRemark}
                                onChange={(e) => setDelayRemark(e.target.value)}
                                data-testid="input-delay-remark"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button 
                              onClick={() => handleSaveTATDelay(report.id)}
                              disabled={savingDelay}
                              data-testid="button-save-delay"
                            >
                              {savingDelay ? 'Saving...' : 'Save'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`text-xl font-bold font-mono ${getScoreColor(report.scores.overall)}`}>
                        {report.scores.overall}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link href={`/compare?ids=${report.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-details-${report.id}`}>Details</Button>
                        </Link>
                        {getMisEntryByLeadId(report.leadId) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                                  onClick={() => handleEditMis(report)}
                                  data-testid={`button-edit-mis-${report.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit MIS Entry</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => window.open(`/api/reports/${report.id}/download`, '_blank')}
                          data-testid={`button-download-${report.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {user?.isAdmin && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-violet-500 hover:text-violet-700 hover:bg-violet-50"
                            onClick={() => handleRescore(report.id)}
                            disabled={rescoringId === report.id}
                            data-testid={`button-rescore-${report.id}`}
                          >
                            <RefreshCw className={`h-4 w-4 ${rescoringId === report.id ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        {(user?.isAdmin || user?.id === report.associateId) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                disabled={deletingId === report.id}
                                data-testid={`button-delete-${report.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Report</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the report for <strong>{report.leadId || report.id}</strong>? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDelete(report.id)}
                                  className="bg-rose-600 hover:bg-rose-700"
                                  data-testid={`button-confirm-delete-${report.id}`}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {/* MIS Edit Dialog */}
        <Dialog open={!!editingMisEntry} onOpenChange={(open) => !open && setEditingMisEntry(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit MIS Entry</DialogTitle>
            </DialogHeader>
            {editingMisEntry && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Lead ID</Label>
                  <div className="text-sm font-medium text-slate-700">{editingMisEntry.leadId}</div>
                </div>
                <div className="space-y-2">
                  <Label>Applicant Name</Label>
                  <div className="text-sm font-medium text-slate-700">{editingMisEntry.applicantName || "-"}</div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mis-status">Status</Label>
                  <Select value={editMisStatus} onValueChange={setEditMisStatus}>
                    <SelectTrigger id="mis-status" data-testid="select-mis-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mis-out-date">Out Date</Label>
                  <Input 
                    id="mis-out-date"
                    type="date"
                    value={editMisOutDate}
                    onChange={(e) => setEditMisOutDate(e.target.value)}
                    data-testid="input-mis-out-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mis-out-time">Out Time</Label>
                  <Input 
                    id="mis-out-time"
                    type="time"
                    value={editMisOutTime}
                    onChange={(e) => setEditMisOutTime(e.target.value)}
                    data-testid="input-mis-out-time"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMisEntry(null)}>Cancel</Button>
              <Button 
                onClick={handleSaveMis} 
                disabled={savingMis}
                data-testid="button-save-mis"
              >
                {savingMis ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuditLayout>
  );
}