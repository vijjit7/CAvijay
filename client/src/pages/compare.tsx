import AuditLayout from "@/components/layout/audit-layout";
import { useAudit } from "@/lib/audit-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ComparePage() {
  const { reports, associates } = useAudit();
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const ids = searchParams.get("ids")?.split(",") || [];
  
  const selectedReports = reports.filter(r => ids.includes(r.id));
  
  const getAssociate = (associateId: string) => {
    return associates.find(a => a.id === associateId);
  };

  if (selectedReports.length === 0) {
    return (
      <AuditLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-slate-300" />
          <h2 className="text-xl font-semibold text-slate-900">No reports selected</h2>
          <p className="text-slate-500">Please select reports from the list to compare them.</p>
          <Link href="/reports">
            <Button>Back to Reports</Button>
          </Link>
        </div>
      </AuditLayout>
    );
  }

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

  return (
    <AuditLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compare Reports</h1>
            <p className="text-slate-500">Side-by-side analysis of audit quality.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {selectedReports.map((report) => {
            const associate = getAssociate(report.associateId);
            return (
              <Card key={report.id} className="border-t-4 border-t-blue-600 shadow-md">
                <CardHeader className="space-y-4">
                  <div className="flex justify-between items-start">
                    <Badge variant={report.status === 'Reviewed' ? 'default' : 'secondary'} className={
                      report.status === 'Reviewed' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 
                      report.status === 'Flagged' ? 'bg-rose-100 text-rose-700 hover:bg-rose-100' : 
                      'bg-amber-100 text-amber-700 hover:bg-amber-100'
                    }>
                      {report.status}
                    </Badge>
                    <span className="text-xs font-mono text-slate-400">{report.id}</span>
                  </div>
                  
                  <div className="space-y-1">
                    <CardTitle className="text-lg leading-tight">{report.title}</CardTitle>
                    <p className="text-xs text-slate-500">{report.date}</p>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg">
                    <Avatar className="h-10 w-10 border border-slate-200">
                      <AvatarImage src={associate?.avatar} />
                      <AvatarFallback>{associate?.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{associate?.name}</div>
                      <div className="text-xs text-slate-500">{associate?.role}</div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Scores */}
                  <div className="space-y-4">
                    <div className="flex items-end justify-between">
                      <span className="text-sm font-medium text-slate-700">Overall Score</span>
                      <span className={`text-3xl font-bold font-mono ${getScoreColor(report.scores.overall)}`}>
                        {report.scores.overall}
                      </span>
                    </div>
                    <Separator />
                    
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Completeness</span>
                          <span className="font-medium">{report.scores.completeness}%</span>
                        </div>
                        <Progress value={report.scores.completeness} className="h-2" indicatorClassName={getProgressColor(report.scores.completeness)} />
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Comprehensiveness</span>
                          <span className="font-medium">{report.scores.comprehensive}%</span>
                        </div>
                        <Progress value={report.scores.comprehensive} className="h-2" indicatorClassName={getProgressColor(report.scores.comprehensive)} />
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Remark Quality</span>
                          <span className="font-medium">{report.scores.quality}%</span>
                        </div>
                        <Progress value={report.scores.quality} className="h-2" indicatorClassName={getProgressColor(report.scores.quality)} />
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">AI Summary</h4>
                    <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md border border-slate-100">
                      {report.summary}
                    </p>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Key Remarks</h4>
                    <ul className="space-y-2">
                      {report.remarks.map((remark, i) => (
                        <li key={i} className="text-xs text-slate-600 flex gap-2">
                          <span className="text-blue-500 mt-0.5">•</span>
                          {remark}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AuditLayout>
  );
}