import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AuditLayout from "@/components/layout/audit-layout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Redirect } from "wouter";
import { BarChart3, Clock, Award, Users, CalendarIcon, Calendar as CalendarIconSolid } from "lucide-react";
import { format, parse, isValid, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from "date-fns";
import { Input } from "@/components/ui/input";

type Report = {
  id: string;
  leadId: string;
  title: string;
  associateId: string;
  date: string;
  createdAt?: string;
  status: string;
  scores: {
    overall?: number;
    comprehensive?: number;
    quality?: number;
  } | null;
  tat?: {
    totalHours?: number;
    totalTATHours?: number;
  } | null;
  tatDelayReason?: string | null;
};

type Associate = {
  id: string;
  name: string;
  username: string;
};

export default function MisDashboardPage() {
  const { user } = useAuth();
  
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [fromDate, setFromDate] = useState<Date>(firstDayOfMonth);
  const [toDate, setToDate] = useState<Date>(today);
  const [fromDateInput, setFromDateInput] = useState(format(firstDayOfMonth, "dd/MM/yyyy"));
  const [toDateInput, setToDateInput] = useState(format(today, "dd/MM/yyyy"));

  const handleFromDateInput = (value: string) => {
    setFromDateInput(value);
    const parsed = parse(value, "dd/MM/yyyy", new Date());
    if (isValid(parsed) && parsed >= new Date(2025, 5, 1) && parsed <= new Date(2035, 11, 31)) {
      setFromDate(parsed);
    }
  };

  const handleToDateInput = (value: string) => {
    setToDateInput(value);
    const parsed = parse(value, "dd/MM/yyyy", new Date());
    if (isValid(parsed) && parsed >= new Date(2025, 5, 1) && parsed <= new Date(2035, 11, 31)) {
      setToDate(parsed);
    }
  };

  const handleFromDateSelect = (date: Date | undefined) => {
    if (date) {
      setFromDate(date);
      setFromDateInput(format(date, "dd/MM/yyyy"));
    }
  };

  const handleToDateSelect = (date: Date | undefined) => {
    if (date) {
      setToDate(date);
      setToDateInput(format(date, "dd/MM/yyyy"));
    }
  };

  if (!user?.isAdmin) {
    return <Redirect to="/" />;
  }

  const { data: reports = [] } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
    queryFn: async () => {
      const res = await fetch("/api/reports");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: associates = [] } = useQuery<Associate[]>({
    queryKey: ["/api/associates"],
    queryFn: async () => {
      const res = await fetch("/api/associates");
      if (!res.ok) return [];
      return res.json();
    },
  });

  type MisEntry = {
    id: number;
    leadId: string;
    customerName: string;
    inDate: string | null;
    outDate: string | null;
    status: string | null;
    workflowStatus: string | null;
    pdPersonId: string | null;
    pdTypingId: string | null;
  };

  const { data: misEntries = [] } = useQuery<MisEntry[]>({
    queryKey: ["/api/mis"],
    queryFn: async () => {
      const res = await fetch("/api/mis");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const parseMisDate = (dateStr: string | null): Date | null => {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (ddmmyyyyMatch) {
      const [_, day, month, year] = ddmmyyyyMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    const ddmonyyyy = trimmed.match(/^(\d{1,2})[-\/]([A-Za-z]{3,})[-\/](\d{4})/);
    if (ddmonyyyy) {
      const [_, day, monthStr, year] = ddmonyyyy;
      const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const monthNum = months[monthStr.toLowerCase().substring(0, 3)];
      if (monthNum !== undefined) {
        return new Date(parseInt(year), monthNum, parseInt(day));
      }
    }
    
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
    
    return null;
  };

  const filteredMisEntries = useMemo(() => {
    return misEntries.filter((entry) => {
      const entryDate = parseMisDate(entry.inDate);
      if (!entryDate) return false;
      
      const startOfFromDate = new Date(fromDate);
      startOfFromDate.setHours(0, 0, 0, 0);
      
      const endOfToDate = new Date(toDate);
      endOfToDate.setHours(23, 59, 59, 999);
      
      return entryDate >= startOfFromDate && entryDate <= endOfToDate;
    });
  }, [misEntries, fromDate, toDate]);

  const filteredReports = useMemo(() => {
    const filteredMisLeadIds = new Set(filteredMisEntries.map(entry => entry.leadId));
    
    return reports.filter((report) => {
      return filteredMisLeadIds.has(report.leadId);
    });
  }, [reports, filteredMisEntries]);

  const loginData = useMemo(() => {
    const total = filteredMisEntries.length;
    const completed = filteredMisEntries.filter(e => 
      e.outDate && e.outDate.trim() !== ""
    ).length;
    const inProcessEntries = filteredMisEntries.filter(e => 
      !e.outDate || e.outDate.trim() === ""
    );
    const inProcess = inProcessEntries.length;
    
    // Group in-process entries by date with associate breakdown
    const dateWiseData = new Map<string, { count: number; associates: Map<string, number> }>();
    
    inProcessEntries.forEach(entry => {
      const entryDate = parseMisDate(entry.inDate);
      if (!entryDate) return;
      
      const dateKey = format(entryDate, "dd/MM");
      const current = dateWiseData.get(dateKey) || { count: 0, associates: new Map() };
      current.count++;
      
      const associateId = entry.pdPersonId || "Unassigned";
      const associateName = associates.find(a => a.id === associateId)?.name || associateId;
      current.associates.set(associateName, (current.associates.get(associateName) || 0) + 1);
      
      dateWiseData.set(dateKey, current);
    });
    
    // Convert to sorted array (by date)
    const inProcessByDate = Array.from(dateWiseData.entries())
      .map(([date, data]) => ({
        date,
        count: data.count,
        associates: Array.from(data.associates.entries()).map(([name, count]) => ({ name, count }))
      }))
      .sort((a, b) => {
        const [dayA, monthA] = a.date.split('/').map(Number);
        const [dayB, monthB] = b.date.split('/').map(Number);
        if (monthA !== monthB) return monthA - monthB;
        return dayA - dayB;
      });
    
    return { total, completed, inProcess, inProcessByDate };
  }, [filteredMisEntries, associates]);

  const tatData = useMemo(() => {
    const getTatHours = (r: Report) => r.tat?.totalTATHours ?? r.tat?.totalHours ?? null;
    
    const withTat = filteredReports.filter(r => getTatHours(r) !== null && getTatHours(r) !== undefined);
    
    const exceptional = withTat.filter(r => r.tatDelayReason && r.tatDelayReason.trim() !== '');
    const nonExceptional = withTat.filter(r => !r.tatDelayReason || r.tatDelayReason.trim() === '');
    
    const zeroDay = nonExceptional.filter(r => (getTatHours(r) ?? 0) < 24).length;
    const oneDay = nonExceptional.filter(r => (getTatHours(r) ?? 0) >= 24 && (getTatHours(r) ?? 0) < 48).length;
    const twoDays = nonExceptional.filter(r => (getTatHours(r) ?? 0) >= 48 && (getTatHours(r) ?? 0) < 72).length;
    const threeDaysPlus = nonExceptional.filter(r => (getTatHours(r) ?? 0) >= 72).length;
    const exceptionalCount = exceptional.length;
    
    const avgTat = nonExceptional.length > 0 
      ? nonExceptional.reduce((sum, r) => sum + (getTatHours(r) ?? 0), 0) / nonExceptional.length / 24
      : 0;
    
    return { zeroDay, oneDay, twoDays, threeDaysPlus, exceptionalCount, avgTat: avgTat.toFixed(1) };
  }, [filteredReports]);

  const scoreData = useMemo(() => {
    const withScore = filteredReports.filter(r => r.scores?.comprehensive !== undefined);
    const range60_70 = withScore.filter(r => (r.scores?.comprehensive || 0) >= 60 && (r.scores?.comprehensive || 0) < 70).length;
    const range70_80 = withScore.filter(r => (r.scores?.comprehensive || 0) >= 70 && (r.scores?.comprehensive || 0) < 80).length;
    const range80_90 = withScore.filter(r => (r.scores?.comprehensive || 0) >= 80 && (r.scores?.comprehensive || 0) <= 100).length;
    const below60 = withScore.filter(r => (r.scores?.comprehensive || 0) < 60).length;
    
    const avgScore = withScore.length > 0 
      ? withScore.reduce((sum, r) => sum + (r.scores?.comprehensive || 0), 0) / withScore.length
      : 0;
    
    return { range60_70, range70_80, range80_90, below60, avgScore: avgScore.toFixed(1) };
  }, [filteredReports]);

  const associateData = useMemo(() => {
    const associateMap = new Map<string, { cases: number; inProcess1Day: number; inProcess2Days: number; inProcess3Plus: number; totalTat: number; tatCount: number; totalScore: number; scoreCount: number }>();
    
    // Count completed cases from reports
    filteredReports.forEach(report => {
      const current = associateMap.get(report.associateId) || { cases: 0, inProcess1Day: 0, inProcess2Days: 0, inProcess3Plus: 0, totalTat: 0, tatCount: 0, totalScore: 0, scoreCount: 0 };
      current.cases++;
      
      const tatHours = report.tat?.totalTATHours ?? report.tat?.totalHours;
      if (tatHours !== undefined && tatHours !== null) {
        current.totalTat += tatHours;
        current.tatCount++;
      }
      
      if (report.scores?.comprehensive !== undefined) {
        current.totalScore += report.scores.comprehensive;
        current.scoreCount++;
      }
      
      associateMap.set(report.associateId, current);
    });
    
    // Count in-process cases from MIS entries (assigned but not completed)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    filteredMisEntries.forEach(entry => {
      const isInProcess = entry.status === "In Progress" || entry.status === "Pending" || 
        entry.workflowStatus === "assigned" || entry.workflowStatus === "in_progress" || 
        entry.workflowStatus === "unassigned";
      
      if (isInProcess && entry.pdPersonId) {
        const current = associateMap.get(entry.pdPersonId) || { cases: 0, inProcess1Day: 0, inProcess2Days: 0, inProcess3Plus: 0, totalTat: 0, tatCount: 0, totalScore: 0, scoreCount: 0 };
        
        const entryDate = parseMisDate(entry.inDate);
        if (entryDate) {
          entryDate.setHours(0, 0, 0, 0);
          const daysDiff = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff <= 1) {
            current.inProcess1Day++;
          } else if (daysDiff === 2) {
            current.inProcess2Days++;
          } else {
            current.inProcess3Plus++;
          }
        } else {
          current.inProcess3Plus++;
        }
        
        associateMap.set(entry.pdPersonId, current);
      }
    });
    
    return Array.from(associateMap.entries()).map(([associateId, data]) => {
      const associate = associates.find(a => a.id === associateId);
      return {
        id: associateId,
        name: associate?.name || associateId,
        casesDone: data.cases,
        inProcess1Day: data.inProcess1Day,
        inProcess2Days: data.inProcess2Days,
        inProcess3Plus: data.inProcess3Plus,
        avgTat: data.tatCount > 0 ? (data.totalTat / data.tatCount / 24).toFixed(1) : "-",
        avgScore: data.scoreCount > 0 ? (data.totalScore / data.scoreCount).toFixed(1) : "-",
      };
    }).sort((a, b) => b.casesDone - a.casesDone);
  }, [filteredReports, filteredMisEntries, associates]);

  const calendarHeatmapData = useMemo(() => {
    const dayStatusMap = new Map<string, { total: number; completed: number; inProcess: number }>();
    
    misEntries.forEach(entry => {
      const entryDate = parseMisDate(entry.inDate);
      if (!entryDate) return;
      
      const dateKey = format(entryDate, "yyyy-MM-dd");
      const current = dayStatusMap.get(dateKey) || { total: 0, completed: 0, inProcess: 0 };
      current.total++;
      
      const isCompleted = entry.status === "Completed" || entry.status === "Approved" || entry.workflowStatus === "completed";
      const isInProcess = entry.status === "In Progress" || entry.status === "Pending" || 
        entry.workflowStatus === "assigned" || entry.workflowStatus === "in_progress" || 
        entry.workflowStatus === "unassigned";
      
      if (isCompleted) {
        current.completed++;
      } else if (isInProcess) {
        current.inProcess++;
      }
      
      dayStatusMap.set(dateKey, current);
    });
    
    return dayStatusMap;
  }, [misEntries]);

  const getLast2Months = useMemo(() => {
    const months: Date[] = [];
    const today = new Date();
    
    for (let i = 1; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(monthDate);
    }
    
    return months;
  }, []);

  const renderCalendarMonth = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDayOfWeek = getDay(monthStart);
    
    const blanks = Array(startDayOfWeek).fill(null);
    const allDays = [...blanks, ...days];
    
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    if (weeks.length > 0 && weeks[weeks.length - 1].length < 7) {
      while (weeks[weeks.length - 1].length < 7) {
        weeks[weeks.length - 1].push(null);
      }
    }
    
    return (
      <div key={format(monthDate, "yyyy-MM")} className="mb-4">
        <h4 className="text-sm font-semibold text-center mb-2">{format(monthDate, "MMM yyyy")}</h4>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-slate-400 font-medium py-1">{d}</div>
          ))}
          {weeks.flat().map((day, idx) => {
            if (!day) {
              return <div key={`blank-${idx}`} className="w-6 h-6"></div>;
            }
            
            const dateKey = format(day, "yyyy-MM-dd");
            const dayData = calendarHeatmapData.get(dateKey);
            
            let bgColor = "bg-slate-100";
            let textColor = "text-slate-400";
            let title = "No cases";
            
            if (dayData && dayData.total > 0) {
              if (dayData.inProcess > 0) {
                bgColor = "bg-red-500";
                textColor = "text-white";
                title = `${dayData.total} cases (${dayData.inProcess} in process)`;
              } else if (dayData.completed === dayData.total) {
                bgColor = "bg-green-500";
                textColor = "text-white";
                title = `${dayData.total} cases (all completed)`;
              } else {
                bgColor = "bg-green-300";
                textColor = "text-green-900";
                title = `${dayData.total} cases`;
              }
            }
            
            return (
              <div 
                key={dateKey}
                className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-medium ${bgColor} ${textColor} cursor-default`}
                title={title}
                data-testid={`heatmap-day-${dateKey}`}
              >
                {format(day, "d")}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">MIS Dashboard</h1>
          <p className="text-slate-500">Management Information System Analytics</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Select Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">From:</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={fromDateInput}
                    onChange={(e) => handleFromDateInput(e.target.value)}
                    className="w-[120px]"
                    data-testid="input-from-date"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        data-testid="select-from-date"
                      >
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={fromDate}
                        onSelect={handleFromDateSelect}
                        defaultMonth={fromDate}
                        captionLayout="dropdown"
                        startMonth={new Date(2025, 5)}
                        endMonth={new Date(2035, 11)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">To:</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={toDateInput}
                    onChange={(e) => handleToDateInput(e.target.value)}
                    className="w-[120px]"
                    data-testid="input-to-date"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        data-testid="select-to-date"
                      >
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={toDate}
                        onSelect={handleToDateSelect}
                        defaultMonth={toDate}
                        captionLayout="dropdown"
                        startMonth={new Date(2025, 5)}
                        endMonth={new Date(2035, 11)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Enter dates in DD/MM/YYYY format or use the calendar picker. Date range: Jun 2025 - Dec 2035</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Login Data - Cases (from MIS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Particulars</TableHead>
                    <TableHead className="text-center">Logged In</TableHead>
                    <TableHead className="text-center">Completed</TableHead>
                    <TableHead className="text-center">In Process (Total)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Cases</TableCell>
                    <TableCell className="text-center" data-testid="stat-logged-in">{loginData.total}</TableCell>
                    <TableCell className="text-center" data-testid="stat-completed">{loginData.completed}</TableCell>
                    <TableCell className="text-center" data-testid="stat-in-process">{loginData.inProcess}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              
              {loginData.inProcessByDate.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-slate-700">In Process - Date Wise Breakdown</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          {loginData.inProcessByDate.map(item => (
                            <TableHead key={item.date} className="text-center text-xs px-2">{item.date}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium text-xs">Pending</TableCell>
                          <TooltipProvider>
                            {loginData.inProcessByDate.map(item => (
                              <TableCell key={item.date} className="text-center px-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-pointer text-amber-600 font-medium hover:underline">
                                      {item.count}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-slate-800 text-white p-2">
                                    <div className="text-xs space-y-1">
                                      <div className="font-medium border-b border-slate-600 pb-1 mb-1">Associates:</div>
                                      {item.associates.map(assoc => (
                                        <div key={assoc.name} className="flex justify-between gap-4">
                                          <span>{assoc.name}</span>
                                          <span className="font-medium">{assoc.count}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                            ))}
                          </TooltipProvider>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIconSolid className="h-5 w-5" />
              Login Data - Cases Date Wise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 justify-center">
              {getLast2Months.map(monthDate => renderCalendarMonth(monthDate))}
            </div>
            <div className="flex items-center justify-center gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-green-500"></div>
                <span>All Completed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-red-500"></div>
                <span>In Process</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-slate-100"></div>
                <span>No Cases</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              TAT Data - Cases Wise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead className="text-center">0 Day</TableHead>
                  <TableHead className="text-center">1 Day</TableHead>
                  <TableHead className="text-center">2 Days</TableHead>
                  <TableHead className="text-center">3+ Days</TableHead>
                  <TableHead className="text-center bg-amber-50">Exceptional</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Cases</TableCell>
                  <TableCell className="text-center text-emerald-600 font-medium" data-testid="tat-0day">{tatData.zeroDay}</TableCell>
                  <TableCell className="text-center text-green-600" data-testid="tat-1day">{tatData.oneDay}</TableCell>
                  <TableCell className="text-center text-blue-600" data-testid="tat-2days">{tatData.twoDays}</TableCell>
                  <TableCell className="text-center text-red-600" data-testid="tat-3days">{tatData.threeDaysPlus}</TableCell>
                  <TableCell className="text-center bg-amber-50 text-amber-700 font-medium" data-testid="tat-exceptional">{tatData.exceptionalCount}</TableCell>
                </TableRow>
                <TableRow className="bg-yellow-50">
                  <TableCell className="font-medium">Average TAT for the period</TableCell>
                  <TableCell colSpan={5} className="text-center font-bold" data-testid="avg-tat">
                    {tatData.avgTat} days
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-xs text-slate-500 mt-2">
              * Exceptional Cases: Reports with TAT delay reason recorded (excluded from day counts)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Comprehensive Score - Quality Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead className="text-center">Below 60</TableHead>
                  <TableHead className="text-center">60-70</TableHead>
                  <TableHead className="text-center">70-80</TableHead>
                  <TableHead className="text-center">80-90+</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Cases</TableCell>
                  <TableCell className="text-center text-red-600" data-testid="score-below60">{scoreData.below60}</TableCell>
                  <TableCell className="text-center text-amber-600" data-testid="score-60-70">{scoreData.range60_70}</TableCell>
                  <TableCell className="text-center text-blue-600" data-testid="score-70-80">{scoreData.range70_80}</TableCell>
                  <TableCell className="text-center text-emerald-600" data-testid="score-80-90">{scoreData.range80_90}</TableCell>
                </TableRow>
                <TableRow className="bg-yellow-50">
                  <TableCell className="font-medium">Average Score for the month</TableCell>
                  <TableCell colSpan={4} className="text-center font-bold" data-testid="avg-score">
                    {scoreData.avgScore}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Associate Wise Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2} className="align-bottom">Associate</TableHead>
                  <TableHead rowSpan={2} className="text-center align-bottom">Cases Done</TableHead>
                  <TableHead colSpan={4} className="text-center border-b-0 bg-slate-50">In Process</TableHead>
                  <TableHead rowSpan={2} className="text-center align-bottom">Avg TAT (Days)</TableHead>
                  <TableHead rowSpan={2} className="text-center align-bottom">Avg Score</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="text-center font-medium">Total</TableHead>
                  <TableHead className="text-center text-green-600">1 Day</TableHead>
                  <TableHead className="text-center text-amber-600">2 Days</TableHead>
                  <TableHead className="text-center text-red-600">3+ Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {associateData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No data available for selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  associateData.map((associate) => (
                    <TableRow key={associate.id} data-testid={`associate-row-${associate.id}`}>
                      <TableCell className="font-medium">{associate.name}</TableCell>
                      <TableCell className="text-center">{associate.casesDone}</TableCell>
                      <TableCell className="text-center font-medium">{(associate.inProcess1Day || 0) + (associate.inProcess2Days || 0) + (associate.inProcess3Plus || 0) || "-"}</TableCell>
                      <TableCell className="text-center text-green-600">{associate.inProcess1Day || "-"}</TableCell>
                      <TableCell className="text-center text-amber-600">{associate.inProcess2Days || "-"}</TableCell>
                      <TableCell className="text-center text-red-600">{associate.inProcess3Plus || "-"}</TableCell>
                      <TableCell className="text-center">{associate.avgTat}</TableCell>
                      <TableCell className="text-center">{associate.avgScore}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuditLayout>
  );
}
