import { User, FileText, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";

export interface Associate {
  id: string;
  name: string;
  role: string;
  avatar: string;
  totalReports: number;
  avgScore: number;
}

export interface Report {
  id: string;
  associateId: string;
  title: string;
  date: string;
  status: 'Reviewed' | 'Pending' | 'Flagged';
  metrics: {
    totalFields: number;
    filledFields: number;
    missingFields?: string[];
    riskAnalysisDepth?: 'High' | 'Medium' | 'Low';
    photoCount?: number;
    dueDiligenceChecks?: string[];
    photoValidation?: {
      matchedCount: number;
      totalKeyDetails: number;
      missedDetails: string[];
    };
  };
  scores: {
    completeness: number;
    comprehensive: number;
    quality: number;
    overall: number;
  };
  decision: {
    status: 'Positive' | 'Negative' | 'Credit Refer';
    remarks: string;
    aiValidation: {
      match: boolean;
      confidence: number;
      reasoning: string;
    };
  };
  remarks: string[];
  summary: string;
}

export const ASSOCIATES: Associate[] = [
  {
    id: 'A1',
    name: 'Bharat',
    role: 'Senior Field Auditor',
    avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&q=80',
    totalReports: 142,
    avgScore: 94
  },
  {
    id: 'A2',
    name: 'Narender',
    role: 'Verification Officer',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80',
    totalReports: 89,
    avgScore: 88
  },
  {
    id: 'A3',
    name: 'Upender',
    role: 'Risk Analyst',
    avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&q=80',
    totalReports: 78,
    avgScore: 82
  },
  {
    id: 'A4',
    name: 'Avinash',
    role: 'Compliance Specialist',
    avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=150&q=80',
    totalReports: 156,
    avgScore: 91
  },
  {
    id: 'A5',
    name: 'Prashanth',
    role: 'Audit Manager',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&q=80',
    totalReports: 65,
    avgScore: 85
  }
];

export const REPORTS: Report[] = [
  {
    id: 'HLSA000FF4B1',
    associateId: 'A4',
    title: 'PD Verification - Supreme Travels',
    date: '2024-11-22',
    status: 'Reviewed',
    metrics: {
      totalFields: 84,
      filledFields: 72,
      missingFields: [
        'Applicant Details - Relation',
        'Reference 1 - Contact No',
        'Reference 1 - Feedback',
        'Reference 1 - Feedback (Remark)',
        'Reference 2 - Name of Party',
        'Reference 2 - Contact No',
        'Reference 2 - Feedback',
        'Immovable Asset - Property Address',
        'Immovable Asset - Name of Owners',
        'Movable Asset - Particulars',
        'Movable Asset - Approx value'
      ],
      riskAnalysisDepth: 'Medium',
      photoCount: 18,
      dueDiligenceChecks: [
        'Business License Verification',
        'Vehicle RC Validation',
        'Contract Analysis (BDL)',
        'Financial Margin Assessment'
      ],
      photoValidation: {
        matchedCount: 5,
        totalKeyDetails: 6,
        missedDetails: [
          'Photo 4 shows 8 employees present, report mentions 2 drivers + self'
        ]
      }
    },
    scores: {
      completeness: 86,
      comprehensive: 90,
      quality: 88,
      overall: 88
    },
    summary: 'Verified Supreme Travels. Applicant has 35 years experience. Fleet includes 3 vehicles. Note: Reference checks and asset details were left blank.',
    decision: {
      status: 'Positive',
      remarks: 'Two active loans on applicant name. Business assets verified physically. Established local presence.',
      aiValidation: {
        match: true,
        confidence: 85,
        reasoning: 'Strong evidence of business activity and asset ownership supports Positive status, despite missing reference contact details.'
      }
    },
    remarks: [
      'Name board seen at premises.',
      'Vehicle RC verified.',
      'Contract orders with BDL observed.',
      'Net margin approx 30% confirmed.'
    ]
  },
  {
    id: 'R-2024-001',
    associateId: 'A1',
    title: 'Q4 Financial Compliance Audit - North Region',
    date: '2024-12-08',
    status: 'Reviewed',
    metrics: {
      totalFields: 150,
      filledFields: 147,
      missingFields: [
        'Receipt #45 - Vendor GST',
        'Expense Code - Item 12',
        'Approval Date - Row 8'
      ],
      riskAnalysisDepth: 'High',
      photoCount: 24,
      dueDiligenceChecks: [
        'Ledger Cross-Referencing',
        'Expense Anomaly Detection',
        'Regulatory Compliance Check',
        'Internal Control Review'
      ],
      photoValidation: {
        matchedCount: 8,
        totalKeyDetails: 8,
        missedDetails: []
      }
    },
    scores: {
      completeness: 98,
      comprehensive: 95,
      quality: 92,
      overall: 95
    },
    summary: 'Excellent adherence to protocol. All mandatory fields populated with high-fidelity data.',
    decision: {
      status: 'Positive',
      remarks: 'Full compliance with all financial protocols. No red flags in ledger review.',
      aiValidation: {
        match: true,
        confidence: 98,
        reasoning: 'Data consistency across all fields and external cross-references confirms Positive status.'
      }
    },
    remarks: [
      'Thorough documentation of expense anomalies.',
      'Cross-referencing with external ledgers was executed perfectly.',
      'Minor delay in submission noted, but within acceptable limits.'
    ]
  },
  {
    id: 'R-2024-002',
    associateId: 'A3',
    title: 'Safety Protocol Inspection - Warehouse B',
    date: '2024-12-07',
    status: 'Flagged',
    metrics: {
      totalFields: 80,
      filledFields: 52,
      missingFields: [
        'Zone 1 - Fire Extinguisher Check',
        'Zone 1 - Exit Sign Visibility',
        'Zone 2 - Aisle Width',
        'Zone 2 - Floor Marking',
        'Zone 3 - Sprinkler Pressure',
        'Zone 3 - Last Inspection Date',
        'Staff Interview - Safety Officer',
        'Staff Interview - Shift Manager',
        'PPE Check - Helmets Count',
        'PPE Check - Gloves Inventory',
        'First Aid Kit - Location A',
        'First Aid Kit - Expiry Date',
        'Electrical Panel - Labeling',
        'Emergency Light - Battery Test',
        'Evacuation Plan - Posted Copy'
      ],
      riskAnalysisDepth: 'Low',
      photoCount: 4,
      dueDiligenceChecks: [
        'Basic Safety Walkthrough'
      ],
      photoValidation: {
        matchedCount: 1,
        totalKeyDetails: 5,
        missedDetails: [
          'Fire extinguisher expiry date not visible in Photo 2',
          'Emergency exit blocked in Photo 3 but reported as clear',
          'No photo evidence for Electrical Panel labeling',
          'PPE usage not visible in work area photos'
        ]
      }
    },
    scores: {
      completeness: 65,
      comprehensive: 70,
      quality: 55,
      overall: 63
    },
    summary: 'Report lacks critical photo evidence for cited violations. Remarks are vague.',
    decision: {
      status: 'Negative',
      remarks: 'Critical safety violations observed. Immediate rectification required before approval.',
      aiValidation: {
        match: true,
        confidence: 92,
        reasoning: 'AI detects high-severity keywords ("blocked exit", "expiry") which aligns with Negative status.'
      }
    },
    remarks: [
      'Missing photo evidence for Section 4.2.',
      'Descriptions of safety hazards lack specific measurements.',
      'Corrective action timeline is ambiguous.'
    ]
  },
  {
    id: 'R-2024-003',
    associateId: 'A2',
    title: 'IT Security Access Review',
    date: '2024-12-05',
    status: 'Reviewed',
    metrics: {
      totalFields: 200,
      filledFields: 200,
      missingFields: [],
      riskAnalysisDepth: 'High',
      photoCount: 12,
      dueDiligenceChecks: [
        'Access Matrix Validation',
        'User Role Analysis',
        'System Log Review',
        'Policy Adherence Check'
      ],
      photoValidation: {
        matchedCount: 4,
        totalKeyDetails: 4,
        missedDetails: []
      }
    },
    scores: {
      completeness: 100,
      comprehensive: 88,
      quality: 90,
      overall: 92
    },
    summary: 'Strong technical depth. Comprehensive coverage of all access nodes.',
    decision: {
      status: 'Positive',
      remarks: 'Robust access controls in place. Minor recommendations provided for optimization.',
      aiValidation: {
        match: true,
        confidence: 95,
        reasoning: 'Technical assessment scores are high, supporting the Positive recommendation.'
      }
    },
    remarks: [
      'Complete user access matrix provided.',
      'Risk assessment methodology is well-justified.',
      'Recommendations are actionable and prioritized correctly.'
    ]
  },
  {
    id: 'R-2024-004',
    associateId: 'A5',
    title: 'Vendor Risk Assessment - TechCorp',
    date: '2024-12-09',
    status: 'Pending',
    metrics: {
      totalFields: 110,
      filledFields: 90,
      missingFields: [
        'Vendor ID - Tax Residency',
        'Sub-processor List - Row 4',
        'Sub-processor List - Row 5',
        'Data Center - Location 2',
        'Certifications - ISO 27001 Expiry',
        'Certifications - SOC 2 Type II',
        'Incident Response - Contact Primary',
        'Incident Response - Contact Secondary',
        'Insurance - Cyber Liability Limit',
        'Insurance - Policy Number',
        'SLA - Uptime Guarantee',
        'SLA - Penalty Clause',
        'Termination - Data Return',
        'Termination - Transition Period'
      ],
      riskAnalysisDepth: 'Medium',
      photoCount: 0,
      dueDiligenceChecks: [
        'Financial Stability Check',
        'Contract Review'
      ],
      photoValidation: {
        matchedCount: 0,
        totalKeyDetails: 0,
        missedDetails: ['No photos provided for verification']
      }
    },
    scores: {
      completeness: 82,
      comprehensive: 75,
      quality: 78,
      overall: 78
    },
    summary: 'Adequate assessment but misses some secondary supplier risks.',
    decision: {
      status: 'Credit Refer',
      remarks: 'Primary risks mitigated, but secondary supplier exposure needs deeper dive.',
      aiValidation: {
        match: true,
        confidence: 78,
        reasoning: 'Ambiguity in secondary supplier data suggests "Credit Refer" is the prudent choice.'
      }
    },
    remarks: [
      'Financial stability check is solid.',
      'Geopolitical risk factors were not fully explored.',
      'Contract terms analysis is good.'
    ]
  }
];

export const getAssociate = (id: string) => ASSOCIATES.find(a => a.id === id);
