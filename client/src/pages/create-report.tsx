import { useState, useRef } from "react";
import AuditLayout from "@/components/layout/audit-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Mic, 
  Upload, 
  Camera, 
  FileAudio, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Trash2,
  BrainCircuit,
  FileText,
  Send,
  User,
  Building,
  Home,
  Briefcase,
  Users,
  MapPin,
  Download
} from "lucide-react";

interface UploadedFile {
  file: File;
  preview?: string;
  name: string;
  size: string;
}

interface LIPDraftReport {
  leadId: string;
  reportDate: string;
  primaryApplicant: {
    customerName: string;
    mobileNumber: string;
    emailId: string;
    residenceAddress: string;
    officeAddress: string;
    spouseName: string;
  };
  basicDetails: {
    branch: string;
    productLine: string;
    transactionType: string;
    totalLoanAmount: string;
    pdType: string;
    customerProfile: string;
    natureOfBusiness: string;
    profession: string;
  };
  pdDetails: {
    pdDate: string;
    pdPlace: string;
    currentAddress: string;
    pdDoneWith: string;
  };
  personalDetails: {
    residenceType: string;
    residenceVintage: string;
    monthlyRent: string;
    totalFamilyMembers: string;
    dependents: string;
    monthlyHouseholdExpenses: string;
    otherComments: string;
    selfEducation: string;
    spouseEducation: string;
    spouseEmployment: string;
    kidsEducation: string;
    kidsSchool: string;
    spouseName: string;
  };
  businessDetails: {
    businessVintageMonths: string;
    totalBusinessVintage: string;
    majorServices: string;
    businessName: string;
    businessProfile: string;
    sourceOfBusiness: string;
    businessSetup: string;
    monthlyRental: string;
    surroundingArea: string;
    netMonthlyIncome: string;
    comfortableEmi: string;
    strategicVision: string;
    promoterExperience: string;
    clientListConcentrationRisk: string;
    seasonality: string;
    employeeCount: string;
    monthlyTurnover: string;
    majorClients: string;
    growthPlans: string;
  };
  referenceChecks: {
    reference1: {
      type: string;
      name: string;
      contact: string;
      feedback: string;
      remarks: string;
    };
    reference2: {
      type: string;
      name: string;
      contact: string;
      feedback: string;
      remarks: string;
    };
    invoiceVerified: string;
  };
  propertyDetails: {
    propertyType: string;
    approxArea: string;
    propertyUsage: string;
    approxValuation: string;
    propertyAddress: string;
    propertiesOwned: string;
    vehiclesOwned: string;
    otherInvestments: string;
  };
  bankingDetails: {
    bankName: string;
    turnoverCreditPercent: string;
    bankingTenure: string;
    emisRouted: string;
    qrCodeSpotted: string;
  };
  debtDetails: {
    existingLoans: string;
    loanList: string;
    repaymentHistory: string;
  };
  summary: {
    overallSummary: string;
    riskMitigants: string;
  };
  endUseDetails: {
    purposeOfLoan: string;
    endUse: string;
    agreementValue: string;
    advancePaid: string;
  };
  recommendation: string;
  remarks: string;
}

export default function CreateReportPage() {
  const { toast } = useToast();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  const [leadId, setLeadId] = useState("");
  const [audioFile, setAudioFile] = useState<UploadedFile | null>(null);
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [draftReport, setDraftReport] = useState<LIPDraftReport | null>(null);
  const [activeTab, setActiveTab] = useState("upload");
  const [isDownloading, setIsDownloading] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("audio/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload an audio file (MP3, WAV, M4A, etc.)",
          variant: "destructive"
        });
        return;
      }
      setAudioFile({
        file,
        name: file.name,
        size: formatFileSize(file.size)
      });
      toast({
        title: "Audio uploaded",
        description: `${file.name} ready for processing`
      });
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos: UploadedFile[] = [];
      Array.from(files).forEach(file => {
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not an image file`,
            variant: "destructive"
          });
          return;
        }
        const preview = URL.createObjectURL(file);
        newPhotos.push({
          file,
          preview,
          name: file.name,
          size: formatFileSize(file.size)
        });
      });
      setPhotos(prev => [...prev, ...newPhotos]);
      toast({
        title: "Photos uploaded",
        description: `${newPhotos.length} photo(s) added`
      });
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      if (newPhotos[index].preview) {
        URL.revokeObjectURL(newPhotos[index].preview!);
      }
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  const generateDraftReport = async () => {
    if (!leadId.trim()) {
      toast({
        title: "Lead ID required",
        description: "Please enter a Lead ID before generating the report",
        variant: "destructive"
      });
      return;
    }

    if (!audioFile && photos.length === 0) {
      toast({
        title: "No files uploaded",
        description: "Please upload a voice recording or photos to generate a report",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setProgressMessage("Preparing files...");

    try {
      const formData = new FormData();
      formData.append("leadId", leadId);
      
      if (audioFile) {
        formData.append("audio", audioFile.file);
      }
      
      photos.forEach((photo, index) => {
        formData.append(`photo_${index}`, photo.file);
      });

      setGenerationProgress(20);
      setProgressMessage("Uploading files...");

      const response = await fetch("/api/generate-draft-report", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      setGenerationProgress(60);
      setProgressMessage("AI analyzing content...");

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      const data = await response.json();
      
      setGenerationProgress(100);
      setProgressMessage("Report generated!");

      setDraftReport(data.draft);
      setActiveTab("review");

      toast({
        title: "Draft report generated",
        description: "Review the AI-generated LIP Report and make any edits"
      });

    } catch (error) {
      console.error("Generate report error:", error);
      toast({
        title: "Generation failed",
        description: "Failed to generate draft report. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
      setProgressMessage("");
    }
  };

  const submitReport = async () => {
    if (!draftReport) return;

    try {
      const response = await fetch("/api/submit-draft-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftReport),
        credentials: "include"
      });

      if (!response.ok) throw new Error("Failed to submit");

      toast({
        title: "Report submitted",
        description: "Your LIP Report has been submitted successfully"
      });

      setDraftReport(null);
      setAudioFile(null);
      setPhotos([]);
      setLeadId("");
      setActiveTab("upload");

    } catch (error) {
      toast({
        title: "Submission failed",
        description: "Failed to submit report. Please try again.",
        variant: "destructive"
      });
    }
  };

  const downloadDraftPdf = async () => {
    if (!draftReport) return;

    setIsDownloading(true);
    try {
      const response = await fetch("/api/generate-draft-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftReport),
        credentials: "include"
      });

      if (!response.ok) throw new Error("Failed to generate PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${draftReport.leadId}_draft_report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "PDF downloaded",
        description: "Draft LIP Report PDF has been downloaded"
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const updateField = (section: keyof LIPDraftReport, field: string, value: string) => {
    if (!draftReport) return;
    
    if (typeof draftReport[section] === 'object' && draftReport[section] !== null) {
      setDraftReport({
        ...draftReport,
        [section]: {
          ...(draftReport[section] as object),
          [field]: value
        }
      });
    } else {
      setDraftReport({
        ...draftReport,
        [section]: value
      });
    }
  };

  const updateReferenceField = (refNum: 'reference1' | 'reference2', field: string, value: string) => {
    if (!draftReport) return;
    setDraftReport({
      ...draftReport,
      referenceChecks: {
        ...draftReport.referenceChecks,
        [refNum]: {
          ...draftReport.referenceChecks[refNum],
          [field]: value
        }
      }
    });
  };

  return (
    <AuditLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create LIP Report</h1>
          <p className="text-slate-500">Upload voice recording and photos to generate an AI-powered draft report</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2" data-testid="tab-upload">
              <Upload className="h-4 w-4" />
              Upload Files
            </TabsTrigger>
            <TabsTrigger value="review" className="flex items-center gap-2" disabled={!draftReport} data-testid="tab-review">
              <FileText className="h-4 w-4" />
              Review LIP Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Lead Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="leadId">Lead ID</Label>
                  <Input
                    id="leadId"
                    placeholder="Enter Lead ID (e.g., BLSA00090139)"
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                    data-testid="input-lead-id"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="h-5 w-5 text-blue-600" />
                  Voice Recording
                </CardTitle>
                <CardDescription>
                  Upload the discussion recording from your field visit
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleAudioUpload}
                  data-testid="input-audio"
                />
                
                {!audioFile ? (
                  <div 
                    className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
                    onClick={() => audioInputRef.current?.click()}
                    data-testid="dropzone-audio"
                  >
                    <FileAudio className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                    <p className="text-slate-600 font-medium">Click to upload voice recording</p>
                    <p className="text-sm text-slate-400 mt-1">MP3, WAV, M4A, or other audio formats</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center">
                      <FileAudio className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{audioFile.name}</p>
                      <p className="text-sm text-slate-500">{audioFile.size}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => setAudioFile(null)}
                      data-testid="button-remove-audio"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-emerald-600" />
                  Photos
                </CardTitle>
                <CardDescription>
                  Upload photos from your field visit (business premises, signage, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                  data-testid="input-photos"
                />

                <div 
                  className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors cursor-pointer mb-4"
                  onClick={() => photoInputRef.current?.click()}
                  data-testid="dropzone-photos"
                >
                  <ImageIcon className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                  <p className="text-slate-600 font-medium">Click to upload photos</p>
                  <p className="text-sm text-slate-400 mt-1">JPG, PNG, or other image formats</p>
                </div>

                {photos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={photo.preview}
                          alt={photo.name}
                          className="w-full h-24 object-cover rounded-lg border border-slate-200"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removePhoto(index)}
                          data-testid={`button-remove-photo-${index}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <p className="text-xs text-slate-500 mt-1 truncate">{photo.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={generateDraftReport}
                disabled={isGenerating || (!audioFile && photos.length === 0)}
                className="gap-2"
                data-testid="button-generate-report"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <BrainCircuit className="h-5 w-5" />
                    Generate LIP Report
                  </>
                )}
              </Button>
            </div>

            {isGenerating && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-700">{progressMessage}</span>
                      <span className="text-sm text-blue-600">{generationProgress}%</span>
                    </div>
                    <Progress value={generationProgress} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="review" className="space-y-6 mt-6">
            {draftReport && (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">LIP Report</h2>
                  <p className="text-slate-500">{draftReport.reportDate}</p>
                </div>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-600" />
                      Primary Applicant Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Customer Name</Label>
                        <Input
                          value={draftReport.primaryApplicant.customerName}
                          onChange={(e) => updateField('primaryApplicant', 'customerName', e.target.value)}
                          data-testid="input-customer-name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Lead ID</Label>
                        <Input value={draftReport.leadId} disabled className="bg-slate-100" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Mobile Number</Label>
                        <Input
                          value={draftReport.primaryApplicant.mobileNumber}
                          onChange={(e) => updateField('primaryApplicant', 'mobileNumber', e.target.value)}
                          data-testid="input-mobile"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Email ID</Label>
                        <Input
                          value={draftReport.primaryApplicant.emailId}
                          onChange={(e) => updateField('primaryApplicant', 'emailId', e.target.value)}
                          data-testid="input-email"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Residence Address</Label>
                        <Textarea
                          value={draftReport.primaryApplicant.residenceAddress}
                          onChange={(e) => updateField('primaryApplicant', 'residenceAddress', e.target.value)}
                          rows={2}
                          data-testid="input-residence-address"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Office Address</Label>
                        <Textarea
                          value={draftReport.primaryApplicant.officeAddress}
                          onChange={(e) => updateField('primaryApplicant', 'officeAddress', e.target.value)}
                          rows={2}
                          data-testid="input-office-address"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Spouse Name</Label>
                        <Input
                          value={draftReport.primaryApplicant.spouseName}
                          onChange={(e) => updateField('primaryApplicant', 'spouseName', e.target.value)}
                          data-testid="input-spouse-name"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-purple-600" />
                      Basic Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Branch</Label>
                        <Input
                          value={draftReport.basicDetails.branch}
                          onChange={(e) => updateField('basicDetails', 'branch', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Product Line</Label>
                        <Input
                          value={draftReport.basicDetails.productLine}
                          onChange={(e) => updateField('basicDetails', 'productLine', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Transaction Type</Label>
                        <Input
                          value={draftReport.basicDetails.transactionType}
                          onChange={(e) => updateField('basicDetails', 'transactionType', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Total Loan Amount</Label>
                        <Input
                          value={draftReport.basicDetails.totalLoanAmount}
                          onChange={(e) => updateField('basicDetails', 'totalLoanAmount', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">PD Type</Label>
                        <Input
                          value={draftReport.basicDetails.pdType}
                          onChange={(e) => updateField('basicDetails', 'pdType', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Customer Profile</Label>
                        <Input
                          value={draftReport.basicDetails.customerProfile}
                          onChange={(e) => updateField('basicDetails', 'customerProfile', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Nature of Business</Label>
                        <Input
                          value={draftReport.basicDetails.natureOfBusiness}
                          onChange={(e) => updateField('basicDetails', 'natureOfBusiness', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Profession</Label>
                        <Input
                          value={draftReport.basicDetails.profession}
                          onChange={(e) => updateField('basicDetails', 'profession', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-red-600" />
                      PD Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">PD Date</Label>
                        <Input
                          value={draftReport.pdDetails.pdDate}
                          onChange={(e) => updateField('pdDetails', 'pdDate', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">PD Place</Label>
                        <Input
                          value={draftReport.pdDetails.pdPlace}
                          onChange={(e) => updateField('pdDetails', 'pdPlace', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Current Address</Label>
                        <Textarea
                          value={draftReport.pdDetails.currentAddress}
                          onChange={(e) => updateField('pdDetails', 'currentAddress', e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">PD Done With</Label>
                        <Input
                          value={draftReport.pdDetails.pdDoneWith}
                          onChange={(e) => updateField('pdDetails', 'pdDoneWith', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <Home className="h-5 w-5 text-green-600" />
                      Personal Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Residence Type</Label>
                        <Input
                          value={draftReport.personalDetails.residenceType}
                          onChange={(e) => updateField('personalDetails', 'residenceType', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Residence Vintage</Label>
                        <Input
                          value={draftReport.personalDetails.residenceVintage}
                          onChange={(e) => updateField('personalDetails', 'residenceVintage', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Monthly Rent</Label>
                        <Input
                          value={draftReport.personalDetails.monthlyRent}
                          onChange={(e) => updateField('personalDetails', 'monthlyRent', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Total Family Members</Label>
                        <Input
                          value={draftReport.personalDetails.totalFamilyMembers}
                          onChange={(e) => updateField('personalDetails', 'totalFamilyMembers', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Dependents</Label>
                        <Input
                          value={draftReport.personalDetails.dependents}
                          onChange={(e) => updateField('personalDetails', 'dependents', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Monthly Household Expenses</Label>
                        <Input
                          value={draftReport.personalDetails.monthlyHouseholdExpenses}
                          onChange={(e) => updateField('personalDetails', 'monthlyHouseholdExpenses', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Self Education</Label>
                        <Input
                          value={draftReport.personalDetails.selfEducation}
                          onChange={(e) => updateField('personalDetails', 'selfEducation', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Spouse Education</Label>
                        <Input
                          value={draftReport.personalDetails.spouseEducation}
                          onChange={(e) => updateField('personalDetails', 'spouseEducation', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Spouse Employment</Label>
                        <Input
                          value={draftReport.personalDetails.spouseEmployment}
                          onChange={(e) => updateField('personalDetails', 'spouseEmployment', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Kids Education</Label>
                        <Input
                          value={draftReport.personalDetails.kidsEducation}
                          onChange={(e) => updateField('personalDetails', 'kidsEducation', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Kids School</Label>
                        <Input
                          value={draftReport.personalDetails.kidsSchool}
                          onChange={(e) => updateField('personalDetails', 'kidsSchool', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Spouse Name (Personal)</Label>
                        <Input
                          value={draftReport.personalDetails.spouseName}
                          onChange={(e) => updateField('personalDetails', 'spouseName', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2 lg:col-span-3">
                        <Label className="text-xs text-slate-500">Other Comments (Education, Age, Marital Status)</Label>
                        <Textarea
                          value={draftReport.personalDetails.otherComments}
                          onChange={(e) => updateField('personalDetails', 'otherComments', e.target.value)}
                          rows={2}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-orange-600" />
                      Business Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Business Name</Label>
                        <Input
                          value={draftReport.businessDetails.businessName}
                          onChange={(e) => updateField('businessDetails', 'businessName', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Major Services</Label>
                        <Input
                          value={draftReport.businessDetails.majorServices}
                          onChange={(e) => updateField('businessDetails', 'majorServices', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Business Vintage (Months at Current Address)</Label>
                        <Input
                          value={draftReport.businessDetails.businessVintageMonths}
                          onChange={(e) => updateField('businessDetails', 'businessVintageMonths', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Total Business Vintage</Label>
                        <Input
                          value={draftReport.businessDetails.totalBusinessVintage}
                          onChange={(e) => updateField('businessDetails', 'totalBusinessVintage', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Source of Business</Label>
                        <Input
                          value={draftReport.businessDetails.sourceOfBusiness}
                          onChange={(e) => updateField('businessDetails', 'sourceOfBusiness', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Business Setup</Label>
                        <Input
                          value={draftReport.businessDetails.businessSetup}
                          onChange={(e) => updateField('businessDetails', 'businessSetup', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Monthly Rental</Label>
                        <Input
                          value={draftReport.businessDetails.monthlyRental}
                          onChange={(e) => updateField('businessDetails', 'monthlyRental', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Surrounding Area</Label>
                        <Input
                          value={draftReport.businessDetails.surroundingArea}
                          onChange={(e) => updateField('businessDetails', 'surroundingArea', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Net Monthly Income</Label>
                        <Input
                          value={draftReport.businessDetails.netMonthlyIncome}
                          onChange={(e) => updateField('businessDetails', 'netMonthlyIncome', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Comfortable EMI</Label>
                        <Input
                          value={draftReport.businessDetails.comfortableEmi}
                          onChange={(e) => updateField('businessDetails', 'comfortableEmi', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Strategic Vision / Growth Plans</Label>
                        <Input
                          value={draftReport.businessDetails.strategicVision}
                          onChange={(e) => updateField('businessDetails', 'strategicVision', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Promoter Experience (Years)</Label>
                        <Input
                          value={draftReport.businessDetails.promoterExperience}
                          onChange={(e) => updateField('businessDetails', 'promoterExperience', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Client Concentration Risk</Label>
                        <Input
                          value={draftReport.businessDetails.clientListConcentrationRisk}
                          onChange={(e) => updateField('businessDetails', 'clientListConcentrationRisk', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Seasonality</Label>
                        <Input
                          value={draftReport.businessDetails.seasonality}
                          onChange={(e) => updateField('businessDetails', 'seasonality', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Employee Count</Label>
                        <Input
                          value={draftReport.businessDetails.employeeCount}
                          onChange={(e) => updateField('businessDetails', 'employeeCount', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Monthly Turnover</Label>
                        <Input
                          value={draftReport.businessDetails.monthlyTurnover}
                          onChange={(e) => updateField('businessDetails', 'monthlyTurnover', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Major Clients</Label>
                        <Input
                          value={draftReport.businessDetails.majorClients}
                          onChange={(e) => updateField('businessDetails', 'majorClients', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Growth Plans</Label>
                        <Input
                          value={draftReport.businessDetails.growthPlans}
                          onChange={(e) => updateField('businessDetails', 'growthPlans', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2 lg:col-span-3">
                        <Label className="text-xs text-slate-500">Business Profile (Detailed Description)</Label>
                        <Textarea
                          value={draftReport.businessDetails.businessProfile}
                          onChange={(e) => updateField('businessDetails', 'businessProfile', e.target.value)}
                          rows={4}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5 text-blue-600" />
                      Banking Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Primary Bank Name</Label>
                        <Input
                          value={draftReport.bankingDetails?.bankName || ''}
                          onChange={(e) => updateField('bankingDetails', 'bankName', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Turnover Credit %</Label>
                        <Input
                          value={draftReport.bankingDetails?.turnoverCreditPercent || ''}
                          onChange={(e) => updateField('bankingDetails', 'turnoverCreditPercent', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Banking Tenure (Years)</Label>
                        <Input
                          value={draftReport.bankingDetails?.bankingTenure || ''}
                          onChange={(e) => updateField('bankingDetails', 'bankingTenure', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">EMIs Routed via Bank</Label>
                        <Input
                          value={draftReport.bankingDetails?.emisRouted || ''}
                          onChange={(e) => updateField('bankingDetails', 'emisRouted', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">QR Code Spotted</Label>
                        <Input
                          value={draftReport.bankingDetails?.qrCodeSpotted || ''}
                          onChange={(e) => updateField('bankingDetails', 'qrCodeSpotted', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-red-600" />
                      Debt Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Existing Loans (Yes/No)</Label>
                        <Input
                          value={draftReport.debtDetails?.existingLoans || ''}
                          onChange={(e) => updateField('debtDetails', 'existingLoans', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Repayment History</Label>
                        <Input
                          value={draftReport.debtDetails?.repaymentHistory || ''}
                          onChange={(e) => updateField('debtDetails', 'repaymentHistory', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2 lg:col-span-3">
                        <Label className="text-xs text-slate-500">Loan List (Details of existing loans)</Label>
                        <Textarea
                          value={draftReport.debtDetails?.loanList || ''}
                          onChange={(e) => updateField('debtDetails', 'loanList', e.target.value)}
                          rows={2}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-cyan-600" />
                      Reference Checks
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
                        <h4 className="font-medium">Reference 1</h4>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs text-slate-500">Type</Label>
                            <Input
                              value={draftReport.referenceChecks.reference1.type}
                              onChange={(e) => updateReferenceField('reference1', 'type', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Name</Label>
                            <Input
                              value={draftReport.referenceChecks.reference1.name}
                              onChange={(e) => updateReferenceField('reference1', 'name', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Contact</Label>
                            <Input
                              value={draftReport.referenceChecks.reference1.contact}
                              onChange={(e) => updateReferenceField('reference1', 'contact', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Feedback</Label>
                            <Input
                              value={draftReport.referenceChecks.reference1.feedback}
                              onChange={(e) => updateReferenceField('reference1', 'feedback', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Remarks</Label>
                            <Textarea
                              value={draftReport.referenceChecks.reference1.remarks}
                              onChange={(e) => updateReferenceField('reference1', 'remarks', e.target.value)}
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
                        <h4 className="font-medium">Reference 2</h4>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs text-slate-500">Type</Label>
                            <Input
                              value={draftReport.referenceChecks.reference2.type}
                              onChange={(e) => updateReferenceField('reference2', 'type', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Name</Label>
                            <Input
                              value={draftReport.referenceChecks.reference2.name}
                              onChange={(e) => updateReferenceField('reference2', 'name', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Contact</Label>
                            <Input
                              value={draftReport.referenceChecks.reference2.contact}
                              onChange={(e) => updateReferenceField('reference2', 'contact', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Feedback</Label>
                            <Input
                              value={draftReport.referenceChecks.reference2.feedback}
                              onChange={(e) => updateReferenceField('reference2', 'feedback', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">Remarks</Label>
                            <Textarea
                              value={draftReport.referenceChecks.reference2.remarks}
                              onChange={(e) => updateReferenceField('reference2', 'remarks', e.target.value)}
                              rows={2}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <div>
                        <Label className="text-xs text-slate-500">Invoice/Document Verified</Label>
                        <Input
                          value={draftReport.referenceChecks.invoiceVerified}
                          onChange={(e) => updateField('referenceChecks', 'invoiceVerified', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5 text-amber-600" />
                      Property Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Property Type</Label>
                        <Input
                          value={draftReport.propertyDetails.propertyType}
                          onChange={(e) => updateField('propertyDetails', 'propertyType', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Approx Area (Sq Ft)</Label>
                        <Input
                          value={draftReport.propertyDetails.approxArea}
                          onChange={(e) => updateField('propertyDetails', 'approxArea', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Property Usage</Label>
                        <Input
                          value={draftReport.propertyDetails.propertyUsage}
                          onChange={(e) => updateField('propertyDetails', 'propertyUsage', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Approx Valuation</Label>
                        <Input
                          value={draftReport.propertyDetails.approxValuation}
                          onChange={(e) => updateField('propertyDetails', 'approxValuation', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs text-slate-500">Property Address</Label>
                        <Input
                          value={draftReport.propertyDetails.propertyAddress}
                          onChange={(e) => updateField('propertyDetails', 'propertyAddress', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Properties Owned (Count)</Label>
                        <Input
                          value={draftReport.propertyDetails.propertiesOwned}
                          onChange={(e) => updateField('propertyDetails', 'propertiesOwned', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Vehicles Owned (Count)</Label>
                        <Input
                          value={draftReport.propertyDetails.vehiclesOwned}
                          onChange={(e) => updateField('propertyDetails', 'vehiclesOwned', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Other Investments</Label>
                        <Input
                          value={draftReport.propertyDetails.otherInvestments}
                          onChange={(e) => updateField('propertyDetails', 'otherInvestments', e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-indigo-600" />
                      Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <Label className="text-xs text-slate-500">Overall Summary (Risk/Mitigant, End Use Comments)</Label>
                      <Textarea
                        value={draftReport.summary.overallSummary}
                        onChange={(e) => updateField('summary', 'overallSummary', e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Risk Mitigants</Label>
                      <Textarea
                        value={draftReport.summary.riskMitigants}
                        onChange={(e) => updateField('summary', 'riskMitigants', e.target.value)}
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-teal-600" />
                      End Use & Recommendation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-slate-500">Purpose of Loan</Label>
                        <Input
                          value={draftReport.endUseDetails.purposeOfLoan}
                          onChange={(e) => updateField('endUseDetails', 'purposeOfLoan', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">End Use</Label>
                        <Input
                          value={draftReport.endUseDetails.endUse}
                          onChange={(e) => updateField('endUseDetails', 'endUse', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Agreement Value</Label>
                        <Input
                          value={draftReport.endUseDetails.agreementValue}
                          onChange={(e) => updateField('endUseDetails', 'agreementValue', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Advance Paid</Label>
                        <Input
                          value={draftReport.endUseDetails.advancePaid}
                          onChange={(e) => updateField('endUseDetails', 'advancePaid', e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Customer Profile Status (Recommendation)</Label>
                      <div className="flex gap-2 mt-2">
                        {['Positive', 'Negative', 'Refer'].map((status) => (
                          <Button
                            key={status}
                            variant={draftReport.recommendation === status ? 'default' : 'outline'}
                            className={draftReport.recommendation === status ? 
                              (status === 'Positive' ? 'bg-green-600' : status === 'Negative' ? 'bg-red-600' : 'bg-amber-600') : ''
                            }
                            onClick={() => setDraftReport({...draftReport, recommendation: status})}
                          >
                            {status}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Remarks</Label>
                      <Textarea
                        value={draftReport.remarks}
                        onChange={(e) => setDraftReport({...draftReport, remarks: e.target.value})}
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setActiveTab("upload")} data-testid="button-back-to-upload">
                    Back to Upload
                  </Button>
                  <div className="flex gap-3">
                    <Button 
                      size="lg" 
                      variant="outline"
                      onClick={downloadDraftPdf} 
                      disabled={isDownloading}
                      className="gap-2" 
                      data-testid="button-download-draft"
                    >
                      {isDownloading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Download className="h-5 w-5" />
                      )}
                      Download PDF
                    </Button>
                    <Button size="lg" onClick={submitReport} className="gap-2" data-testid="button-submit-report">
                      <Send className="h-5 w-5" />
                      Submit LIP Report
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AuditLayout>
  );
}
