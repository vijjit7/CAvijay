import AuditLayout from "@/components/layout/audit-layout";
import { useAudit } from "@/lib/audit-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Legend
} from "recharts";
import { ArrowUpRight, ArrowDownRight, CheckCircle2, AlertCircle, FileText, Calendar, Award, TrendingUp, Users, Download, Archive, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, parseISO } from "date-fns";

export default function AuditDashboard() {
  const { user } = useAuth();
  const { reports, associates } = useAudit();
  const [selectedMonth, setSelectedMonth] = useState("All");

  if (!user?.isAdmin) {
    return <AssociateDashboard user={user} reports={reports} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />;
  }

  return <AdminDashboard reports={reports} associates={associates} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />;
}

function AssociateDashboard({ user, reports, selectedMonth, setSelectedMonth }: any) {
  // Mock data for associate performance
  const monthlyPerformance = [
    { name: 'Aug', reports: 12, quality: 88 },
    { name: 'Sep', reports: 15, quality: 90 },
    { name: 'Oct', reports: 18, quality: 91 },
    { name: 'Nov', reports: 14, quality: 94 },
    { name: 'Dec', reports: 8, quality: 95 },
  ];

  const currentMonthStats = monthlyPerformance[monthlyPerformance.length - 1];

  // Filter reports for this associate
  const myReports = reports.filter((r: any) => r.associateId === user?.id);
  const recentReports = myReports.slice(0, 3);

  return (
    <AuditLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Performance Dashboard</h1>
            <p className="text-slate-500">Track your monthly audit volume and quality scores.</p>
          </div>
          <div className="w-40">
             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
               <SelectTrigger>
                 <SelectValue placeholder="Select Month" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="October">October 2024</SelectItem>
                 <SelectItem value="November">November 2024</SelectItem>
                 <SelectItem value="December">December 2024</SelectItem>
               </SelectContent>
             </Select>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-none shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-100">Total Reports (This Month)</CardTitle>
              <FileText className="h-4 w-4 text-blue-100" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{currentMonthStats.reports}</div>
              <p className="text-xs text-blue-100/80 flex items-center mt-1">
                <ArrowUpRight className="h-3 w-3 mr-1" /> On track for target
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-emerald-100">Average Quality Score</CardTitle>
              <Award className="h-4 w-4 text-emerald-100" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{currentMonthStats.quality}%</div>
              <p className="text-xs text-emerald-100/80 flex items-center mt-1">
                <ArrowUpRight className="h-3 w-3 mr-1" /> +2% vs last month
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Pending Corrections</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-slate-900">2</div>
              <p className="text-xs text-slate-500 mt-1">
                Reports flagged for review
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Performance</CardTitle>
              <CardDescription>Volume vs Quality Score Trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      yAxisId="left"
                      orientation="left"
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="reports" name="Reports Filed" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                    <Line yAxisId="right" type="monotone" dataKey="quality" name="Quality Score" stroke="#10b981" strokeWidth={3} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Submissions</CardTitle>
              <CardDescription>Status of your latest reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {recentReports.length > 0 ? recentReports.map((report: Report) => (
                  <div key={report.id} className="flex items-start gap-4">
                    <div className={`
                      mt-1 h-2 w-2 rounded-full shrink-0
                      ${report.status === 'Reviewed' ? 'bg-emerald-500' : 
                        report.status === 'Flagged' ? 'bg-rose-500' : 'bg-amber-500'}
                    `} />
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">{report.id}_{report.date}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="truncate max-w-[180px]">{report.title}</span>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                          {report.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="font-mono text-sm font-bold text-slate-700">
                      {report.scores.overall}
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No recent reports found.
                  </div>
                )}
                <Link href="/upload">
                  <Button className="w-full mt-2 gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Submit New Report
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuditLayout>
  );
}

function AdminDashboard({ reports, associates, selectedMonth, setSelectedMonth }: any) {
  const recentReports = reports.slice(0, 5);
  const { toast } = useToast();
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");

  const handleExportReports = async () => {
    setExporting(true);
    try {
      // Build URL with date filters
      const params = new URLSearchParams();
      if (exportFromDate) params.append('fromDate', exportFromDate);
      if (exportToDate) params.append('toDate', exportToDate);
      
      const url = `/api/admin/export-reports${params.toString() ? '?' + params.toString() : ''}`;
      
      const response = await fetch(url, {
        credentials: 'include'
      });
      
      const contentType = response.headers.get('content-type') || '';
      
      if (!response.ok) {
        if (contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.error || 'Export failed');
        } else {
          throw new Error(`Export failed: ${response.statusText}`);
        }
      }
      
      if (!contentType.includes('application/zip')) {
        throw new Error('Unexpected response format');
      }
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const dateStr = exportFromDate && exportToDate 
        ? `${exportFromDate}_to_${exportToDate}` 
        : new Date().toISOString().slice(0, 10);
      a.download = `auditguard-reports-${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
      
      toast({
        title: "Export Complete",
        description: "Reports have been downloaded as a ZIP file.",
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleArchiveReports = async () => {
    setArchiving(true);
    try {
      const response = await fetch('/api/admin/archive-reports', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Archive failed');
      }
      
      const result = await response.json();
      
      toast({
        title: "Archive Complete",
        description: `${result.archivedReports} reports and ${result.archivedMisEntries} MIS entries archived. Statistics preserved.`,
      });
      
      setArchiveDialogOpen(false);
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Archive Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setArchiving(false);
    }
  };
  
  // Month mapping
  const monthMap: { [key: string]: number } = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
  };
  
  // Filter reports by selected month
  const getMonthReports = (month: string) => {
    if (month === 'All') return reports;
    const monthNum = monthMap[month];
    return reports.filter((r: any) => {
      const reportDate = new Date(r.date);
      return reportDate.getMonth() + 1 === monthNum;
    });
  };
  
  const currentMonthReports = getMonthReports(selectedMonth);
  
  // Calculate overall stats
  const totalMonthlyReports = currentMonthReports.length;
  const avgQualityScore = currentMonthReports.length > 0 
    ? Math.round(currentMonthReports.reduce((sum: number, r: any) => sum + (r.scores?.overall || 0), 0) / currentMonthReports.length * 10) / 10
    : 0;
  const flaggedReports = currentMonthReports.filter((r: any) => r.status === 'Flagged').length;
  const pendingReports = currentMonthReports.filter((r: any) => r.status === 'Pending').length;
  
  // Calculate stats per associate
  const getAssociateStats = (associateId: string, month?: string) => {
    const filteredReports = month ? getMonthReports(month) : reports;
    const associateReports = filteredReports.filter((r: any) => r.associateId === associateId);
    const totalReports = associateReports.length;
    const avgScore = associateReports.length > 0 
      ? Math.round(associateReports.reduce((sum: number, r: any) => sum + (r.scores?.overall || 0), 0) / associateReports.length)
      : 0;
    return { totalReports, avgScore };
  };
  
  // Calculate weekly performance data for the chart
  const getWeeklyPerformance = () => {
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    return weeks.map((weekName, weekIndex) => {
      const weekReports = currentMonthReports.filter((r: any) => {
        const day = new Date(r.date).getDate();
        const reportWeek = Math.floor((day - 1) / 7);
        return reportWeek === weekIndex;
      });
      const avgScore = weekReports.length > 0
        ? Math.round(weekReports.reduce((sum: number, r: any) => sum + (r.scores?.overall || 0), 0) / weekReports.length)
        : 0;
      return { name: weekName, score: avgScore, count: weekReports.length };
    });
  };
  
  const performanceData = getWeeklyPerformance();

  return (
    <AuditLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard Overview</h1>
            <p className="text-slate-500">Welcome back. Here's what's happening with audit compliance.</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
             <div className="w-40">
               <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                 <SelectTrigger>
                   <SelectValue placeholder="Select Month" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="All">All Time</SelectItem>
                   <SelectItem value="October">October 2025</SelectItem>
                   <SelectItem value="November">November 2025</SelectItem>
                   <SelectItem value="December">December 2025</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <Link href="/reports">
              <Button>View All Reports</Button>
             </Link>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
             <div className="flex items-center gap-2">
               <label className="text-sm text-slate-600">From:</label>
               <input
                 type="date"
                 value={exportFromDate}
                 onChange={(e) => setExportFromDate(e.target.value)}
                 className="border rounded px-2 py-1 text-sm"
                 data-testid="input-export-from-date"
               />
             </div>
             <div className="flex items-center gap-2">
               <label className="text-sm text-slate-600">To:</label>
               <input
                 type="date"
                 value={exportToDate}
                 onChange={(e) => setExportToDate(e.target.value)}
                 className="border rounded px-2 py-1 text-sm"
                 data-testid="input-export-to-date"
               />
             </div>
             <Button 
               variant="outline" 
               onClick={handleExportReports} 
               disabled={exporting}
               data-testid="button-export-reports"
             >
               <Download className="h-4 w-4 mr-2" />
               {exporting ? 'Exporting...' : (exportFromDate || exportToDate ? 'Export Range' : 'Export All')}
             </Button>
             <Button 
               variant="destructive" 
               onClick={() => setArchiveDialogOpen(true)} 
               disabled={reports.length === 0}
               data-testid="button-archive-reports"
             >
               <Archive className="h-4 w-4 mr-2" />
               Archive & Clear
             </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{selectedMonth === 'All' ? 'Total Reports' : 'Monthly Reports'}</CardTitle>
              <FileText className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMonthlyReports}</div>
              <p className="text-xs text-slate-500 flex items-center mt-1">
                {selectedMonth === 'All' ? 'Total reports (all time)' : `Total reports for ${selectedMonth}`}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Quality Score</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgQualityScore || '-'}</div>
              <p className="text-xs text-slate-500 flex items-center mt-1">
                {totalMonthlyReports > 0 ? 'Average across all reports' : 'No reports yet'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Flagged Reports</CardTitle>
              <AlertCircle className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{flaggedReports}</div>
              <p className="text-xs text-slate-500 flex items-center mt-1">
                {flaggedReports > 0 ? 'Requires attention' : 'No flagged reports'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Calendar className="h-4 w-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingReports}</div>
              <p className="text-xs text-slate-500 flex items-center mt-1">
                {pendingReports > 0 ? 'Awaiting review' : 'All caught up'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
              <CardTitle>Compliance Trends - {selectedMonth}</CardTitle>
              <CardDescription>Weekly average report scores</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="#64748b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#2563eb" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: "#2563eb", strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Associate Activity</CardTitle>
              <CardDescription>Report submissions for {selectedMonth}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {associates.map((associate: any) => {
                  const stats = getAssociateStats(associate.id, selectedMonth);
                  const count = stats.totalReports;

                  return (
                    <div key={associate.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-slate-200">
                          <AvatarImage src={associate.avatar} />
                          <AvatarFallback>{associate.name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium leading-none text-slate-900">{associate.name}</p>
                          <p className="text-xs text-slate-500 mt-1">{associate.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          {count} Reports
                        </Badge>
                        {stats.avgScore > 0 && (
                          <Badge variant={stats.avgScore >= 90 ? 'default' : stats.avgScore >= 80 ? 'secondary' : 'outline'}>
                            {stats.avgScore}%
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Associate Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-500" />
              Associate Performance - {selectedMonth}
            </CardTitle>
            <CardDescription>Monthly breakdown of report submissions and quality scores</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Associate</TableHead>
                  <TableHead className="text-right">Reports</TableHead>
                  <TableHead className="text-right">Reviewed</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Flagged</TableHead>
                  <TableHead className="text-right">Avg Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {associates.map((associate: any) => {
                  const associateMonthReports = currentMonthReports.filter((r: any) => r.associateId === associate.id);
                  const totalReports = associateMonthReports.length;
                  const reviewedCount = associateMonthReports.filter((r: any) => r.status === 'Reviewed').length;
                  const pendingCount = associateMonthReports.filter((r: any) => r.status === 'Pending').length;
                  const flaggedCount = associateMonthReports.filter((r: any) => r.status === 'Flagged').length;
                  const avgScore = totalReports > 0
                    ? Math.round(associateMonthReports.reduce((sum: number, r: any) => sum + (r.scores?.overall || 0), 0) / totalReports)
                    : 0;
                  
                  return (
                    <TableRow key={associate.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={associate.avatar} />
                            <AvatarFallback>{associate.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-slate-900">{associate.name}</div>
                            <div className="text-xs text-slate-500">{associate.role}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">{totalReports}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600">{reviewedCount}</TableCell>
                      <TableCell className="text-right font-mono text-amber-600">{pendingCount}</TableCell>
                      <TableCell className="text-right font-mono text-rose-600">{flaggedCount}</TableCell>
                      <TableCell className="text-right">
                        {totalReports > 0 ? (
                          <Badge variant={avgScore >= 90 ? 'default' : avgScore >= 80 ? 'secondary' : 'outline'}>
                            {avgScore}%
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Archive Confirmation Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Archive All Reports
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-3">
              <p>
                This action will <strong>permanently delete</strong> all {reports.length} reports and associated MIS entries from the database.
              </p>
              <p>
                Before archiving, we recommend using the "Export All" button to download a backup of all your data.
              </p>
              <p className="text-sm text-slate-500">
                Note: Aggregate statistics (total positive/negative decisions, average scores, etc.) will be preserved for historical reference.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleArchiveReports}
              disabled={archiving}
              data-testid="button-confirm-archive"
            >
              {archiving ? 'Archiving...' : 'Yes, Archive All Reports'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuditLayout>
  );
}