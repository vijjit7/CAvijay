import AuditLayout from "@/components/layout/audit-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, FileText, X, Loader2, Link as LinkIcon, CheckCircle, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/lib/audit-context";
import { useToast } from "@/hooks/use-toast";

type UploadResult = {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  leadId?: string;
  fileName?: string;
  error?: string;
};

type UrlUploadResult = {
  url: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  leadId?: string;
  fileName?: string;
  error?: string;
};

export default function UploadPage() {
  const { user } = useAuth();
  const { refreshReports } = useAudit();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [pdfUrl, setPdfUrl] = useState("");
  const [urlUploadResult, setUrlUploadResult] = useState<UrlUploadResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please upload at least one PDF report.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    setUploadResults(files.map(file => ({ file, status: 'pending' })));

    const results: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, status: 'uploading' } : r
      ));

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('associateId', user?.id || 'A1');

        const response = await fetch('/api/upload-report', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          results.push({ 
            file, 
            status: 'error', 
            error: data.message || data.error || 'Upload failed' 
          });
          setUploadResults(prev => prev.map((r, idx) => 
            idx === i ? { ...r, status: 'error', error: data.message || data.error } : r
          ));
        } else {
          results.push({ 
            file, 
            status: 'success', 
            leadId: data.leadId,
            fileName: data.fileName 
          });
          setUploadResults(prev => prev.map((r, idx) => 
            idx === i ? { ...r, status: 'success', leadId: data.leadId, fileName: data.fileName } : r
          ));
        }
      } catch (error) {
        results.push({ 
          file, 
          status: 'error', 
          error: 'Network error' 
        });
        setUploadResults(prev => prev.map((r, idx) => 
          idx === i ? { ...r, status: 'error', error: 'Network error' } : r
        ));
      }
    }

    setIsUploading(false);
    
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    if (successCount > 0) {
      refreshReports();
      toast({
        title: `${successCount} Report${successCount > 1 ? 's' : ''} Uploaded Successfully`,
        description: (
          <div className="mt-2 space-y-1">
            <p>Reports saved as:</p>
            <ul className="list-disc pl-4 text-xs font-mono">
              {results.filter(r => r.status === 'success').slice(0, 5).map((r, i) => (
                <li key={i}>{r.fileName}</li>
              ))}
              {successCount > 5 && <li>...and {successCount - 5} more</li>}
            </ul>
          </div>
        ),
        duration: 5000,
      });
    }

    if (errorCount > 0) {
      toast({
        title: `${errorCount} Upload${errorCount > 1 ? 's' : ''} Failed`,
        description: "Some files could not be processed. Make sure they contain Lead ID and Date fields.",
        variant: "destructive",
        duration: 5000,
      });
    }

    if (successCount === files.length) {
      setFiles([]);
      setUploadResults([]);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfUrl.trim()) {
      toast({
        title: "No URL provided",
        description: "Please enter a PDF URL.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUrlUploadResult({ url: pdfUrl, status: 'uploading' });

    try {
      const response = await fetch('/api/upload-report-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: pdfUrl,
          associateId: user?.id || 'A1',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setUrlUploadResult({ 
          url: pdfUrl, 
          status: 'error', 
          error: data.message || data.error || 'Upload failed' 
        });
        toast({
          title: "Upload Failed",
          description: data.message || data.error || "Could not process PDF from URL",
          variant: "destructive",
        });
      } else {
        setUrlUploadResult({ 
          url: pdfUrl, 
          status: 'success', 
          leadId: data.leadId,
          fileName: data.fileName 
        });
        refreshReports();
        toast({
          title: "Report Uploaded Successfully",
          description: `Saved as: ${data.fileName}`,
        });
        setPdfUrl("");
      }
    } catch (error) {
      setUrlUploadResult({ 
        url: pdfUrl, 
        status: 'error', 
        error: 'Network error' 
      });
      toast({
        title: "Network Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    }

    setIsUploading(false);
  };

  return (
    <AuditLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Upload Monthly Reports</h1>
          <p className="text-slate-500">Submit your audit documents for compliance verification. Lead ID and Date will be automatically extracted from the PDF.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Submission</CardTitle>
            <CardDescription>
              Uploading as <span className="font-semibold text-slate-900">{user?.name}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="file" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="file" className="gap-2" data-testid="tab-file-upload">
                  <UploadCloud className="h-4 w-4" />
                  File Upload
                </TabsTrigger>
                <TabsTrigger value="url" className="gap-2" data-testid="tab-url-upload">
                  <LinkIcon className="h-4 w-4" />
                  Web Link
                </TabsTrigger>
              </TabsList>

              <TabsContent value="file">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label>Report Documents (PDF)</Label>
                    <p className="text-xs text-slate-500">Lead ID and Report Date will be automatically extracted from each PDF file.</p>
                    <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${files.length > 0 ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 hover:border-blue-500 hover:bg-slate-50'}`}>
                      <Input 
                        type="file" 
                        accept=".pdf" 
                        multiple
                        className="hidden" 
                        id="file-upload"
                        onChange={handleFileChange}
                        data-testid="input-file-upload"
                      />
                      <Label htmlFor="file-upload" className="cursor-pointer block">
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                          <UploadCloud className="h-10 w-10" />
                          <span className="font-medium">Click to upload PDF files</span>
                          <span className="text-xs">Lead ID and Date will be extracted automatically</span>
                        </div>
                      </Label>
                    </div>

                    {files.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <Label className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                          Selected Files ({files.length})
                        </Label>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                          {files.map((file, index) => {
                            const result = uploadResults[index];
                            return (
                              <div key={index} className={`flex items-center justify-between p-3 bg-white border rounded-md shadow-sm ${
                                result?.status === 'success' ? 'border-emerald-300 bg-emerald-50' :
                                result?.status === 'error' ? 'border-rose-300 bg-rose-50' :
                                'border-slate-200'
                              }`}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                                    result?.status === 'success' ? 'bg-emerald-100' :
                                    result?.status === 'error' ? 'bg-rose-100' :
                                    result?.status === 'uploading' ? 'bg-blue-100' :
                                    'bg-slate-100'
                                  }`}>
                                    {result?.status === 'uploading' ? (
                                      <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                                    ) : (
                                      <FileText className={`h-4 w-4 ${
                                        result?.status === 'success' ? 'text-emerald-600' :
                                        result?.status === 'error' ? 'text-rose-600' :
                                        'text-slate-600'
                                      }`} />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                                    {result?.status === 'success' && (
                                      <p className="text-xs text-emerald-600 font-mono">Saved as: {result.fileName}</p>
                                    )}
                                    {result?.status === 'error' && (
                                      <p className="text-xs text-rose-600">{result.error}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                  </span>
                                  {!isUploading && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="text-slate-400 hover:text-red-500 h-8 w-8"
                                      onClick={() => removeFile(index)}
                                      data-testid={`button-remove-file-${index}`}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea id="notes" placeholder="Any context regarding this batch of reports..." data-testid="input-notes" />
                  </div>

                  <Button type="submit" className="w-full" disabled={isUploading || files.length === 0} data-testid="button-submit-reports">
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing {files.length} Files...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="mr-2 h-4 w-4" />
                        Submit {files.length > 0 ? `${files.length} Reports` : 'Reports'}
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="url">
                <form onSubmit={handleUrlSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-url">PDF Web Link</Label>
                    <p className="text-xs text-slate-500">Paste a direct link to a PDF file. Lead ID and Date will be extracted automatically.</p>
                    <Input 
                      id="pdf-url"
                      type="url"
                      placeholder="https://example.com/report.pdf"
                      value={pdfUrl}
                      onChange={(e) => setPdfUrl(e.target.value)}
                      data-testid="input-pdf-url"
                    />
                  </div>

                  {urlUploadResult && (
                    <div className={`p-4 rounded-lg border ${
                      urlUploadResult.status === 'success' ? 'bg-emerald-50 border-emerald-200' :
                      urlUploadResult.status === 'error' ? 'bg-rose-50 border-rose-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        {urlUploadResult.status === 'uploading' ? (
                          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                        ) : urlUploadResult.status === 'success' ? (
                          <CheckCircle className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-rose-600" />
                        )}
                        <div>
                          {urlUploadResult.status === 'uploading' && (
                            <p className="text-sm text-blue-700">Fetching and processing PDF...</p>
                          )}
                          {urlUploadResult.status === 'success' && (
                            <>
                              <p className="text-sm font-medium text-emerald-700">Report uploaded successfully!</p>
                              <p className="text-xs text-emerald-600 font-mono">Saved as: {urlUploadResult.fileName}</p>
                            </>
                          )}
                          {urlUploadResult.status === 'error' && (
                            <>
                              <p className="text-sm font-medium text-rose-700">Upload failed</p>
                              <p className="text-xs text-rose-600">{urlUploadResult.error}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isUploading || !pdfUrl.trim()} data-testid="button-submit-url">
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing URL...
                      </>
                    ) : (
                      <>
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Upload from Link
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AuditLayout>
  );
}
