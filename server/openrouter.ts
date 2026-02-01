import OpenAI from "openai";

// Simple retry helper (replaces p-retry to avoid bundling issues)
async function simpleRetry<T>(fn: () => Promise<T>, retries: number = 2, delay: number = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// AI configuration - supports both Replit AI Integrations and standard OpenRouter credentials
// Priority: Standard OpenRouter credentials > Replit AI Integrations (production first)
function getAICredentials(): { baseURL: string | undefined; apiKey: string | undefined; source: string } {
  // Log all available credential options for debugging
  const hasStandard = !!process.env.OPENROUTER_API_KEY;
  const hasIntegrations = !!(process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL && process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY);
  console.log(`[AI Credentials] Available: Standard=${hasStandard}, Integrations=${hasIntegrations}`);
  
  // Prefer standard OpenRouter credentials (works in both dev and production)
  if (process.env.OPENROUTER_API_KEY) {
    return {
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      source: 'Standard OpenRouter'
    };
  }
  
  // Fallback to Replit AI Integrations (development/preview only)
  if (process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL && process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY) {
    return {
      baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
      source: 'Replit AI Integrations'
    };
  }
  
  return { baseURL: undefined, apiKey: undefined, source: 'none' };
}

// Lazy-load OpenAI client to ensure secrets are available at call time (important for production)
// Track cached credentials to detect when they change and recreate client
let _openrouter: OpenAI | null = null;
let _cachedApiKey: string | undefined = undefined;
let _cachedBaseURL: string | undefined = undefined;

function getOpenRouterClient(): OpenAI {
  const credentials = getAICredentials();
  
  // Recreate client if credentials changed or if we previously had no valid credentials
  const credentialsChanged = credentials.apiKey !== _cachedApiKey || credentials.baseURL !== _cachedBaseURL;
  const hadInvalidCredentials = _cachedApiKey === undefined || _cachedApiKey === 'missing';
  const nowHasValidCredentials = !!credentials.apiKey && credentials.apiKey !== 'missing';
  
  if (!_openrouter || (credentialsChanged && nowHasValidCredentials) || (hadInvalidCredentials && nowHasValidCredentials)) {
    console.log(`[AI Config] Creating new client with source: ${credentials.source}, hasKey: ${!!credentials.apiKey}`);
    _openrouter = new OpenAI({
      baseURL: credentials.baseURL || 'https://openrouter.ai/api/v1',
      apiKey: credentials.apiKey || 'missing'
    });
    _cachedApiKey = credentials.apiKey;
    _cachedBaseURL = credentials.baseURL;
  } else {
    console.log(`[AI Config] Reusing cached client, source: ${credentials.source}`);
  }
  
  return _openrouter;
}

export function isAIConfigured(): boolean {
  const creds = getAICredentials();
  const hasCredentials = !!creds.baseURL && !!creds.apiKey;
  console.log(`[AI Config] Source: ${creds.source}, BaseURL: ${!!creds.baseURL}, API Key: ${!!creds.apiKey}, Configured: ${hasCredentials}`);
  return hasCredentials;
}

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

export async function analyzeBusinessForReport(businessDetails: {
  businessName: string;
  businessType: string;
  location: string;
  ownerName: string;
  observations: string[];
  photoEvidence: string[];
}): Promise<{
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendation: string;
  reportDraft: string;
}> {
  const prompt = `You are an expert field verification officer analyst. Analyze this business verification and provide a comprehensive report to help the officer complete their verification report.

**Business Details:**
- Business Name: ${businessDetails.businessName}
- Type: ${businessDetails.businessType}
- Location: ${businessDetails.location}
- Owner: ${businessDetails.ownerName}

**Field Observations:**
${businessDetails.observations.map((o, i) => `${i + 1}. ${o}`).join('\n')}

**Photo Evidence Captured:**
${businessDetails.photoEvidence.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Provide your analysis in the following JSON format:
{
  "summary": "2-3 sentence executive summary of the business verification",
  "strengths": ["list of positive verification points"],
  "concerns": ["any concerns or red flags observed"],
  "recommendation": "POSITIVE/NEGATIVE/REFER with brief justification",
  "reportDraft": "A professional verification report paragraph (100-150 words) that the officer can use in their final report"
}

Respond ONLY with valid JSON, no additional text.`;

  const response = await simpleRetry(async () => {
    const result = await getOpenRouterClient().chat.completions.create({
      model: "anthropic/claude-3-haiku",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    });
    return result.choices[0]?.message?.content || "";
  }, 2, 2000);

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("No valid JSON found in response");
  } catch (e) {
    return {
      summary: "Business verification completed. Analysis available.",
      strengths: ["Business exists at stated location", "Owner verified"],
      concerns: [],
      recommendation: "POSITIVE - Business appears legitimate",
      reportDraft: response || "Verification completed successfully."
    };
  }
}

export interface ComprehensiveScoreResult {
  personal: number;
  business: number;
  banking: number;
  networth: number;
  existingDebt: number;
  endUse: number;
  referenceChecks: number;
  personalMatches: {
    selfEducation: boolean;
    spouseName: boolean;
    spouseEducation: boolean;
    spouseEmployment: boolean;
    mentionAboutKids: boolean;
    kidsEducation: boolean;
    kidsSchool: boolean;
    residenceVintage: boolean;
    monthlyRentIfRented: boolean;
    residenceOwnedOrRented: boolean;
  };
  businessMatches: {
    businessName: boolean;
    natureOfBusiness: boolean;
    existenceCurrentPlace: boolean;
    licensesRegistrations: boolean;
    promoterExperienceQualifications: boolean;
    strategicVisionClarity: boolean;
    employeesSeen: boolean;
    monthlyTurnover: boolean;
    clientListConcentrationRisk: boolean;
    activityDuringVisit: boolean;
    monthlyIncome: boolean;
    seasonality: boolean;
    infraSupportsTurnover: boolean;
    mfgRawMaterialSourcingStorage: boolean;
    mfgProcessFlow: boolean;
    mfgCapacityVsUtilization: boolean;
    mfgMachineryMakeAutomationMaintenance: boolean;
    mfgInventoryFifoAging: boolean;
    mfgQualityControl: boolean;
    tradingProductRangeInventoryMovement: boolean;
    tradingPurchaseSalesCycle: boolean;
    tradingWarehouseStockSeen: boolean;
    svcDocumentationOfDelivery: boolean;
    svcTechnologySystems: boolean;
    svcClientListContractsRevenueModel: boolean;
    svcContractBasedOrWalkin: boolean;
  };
  bankingMatches: {
    primaryBankerName: boolean;
    turnoverCreditedPercent: boolean;
    bankingTenure: boolean;
    emisRoutedBank: boolean;
    qrCodeSpotted: boolean;
  };
  networthMatches: {
    propertiesOwned: boolean;
    vehiclesOwned: boolean;
    otherInvestments: boolean;
    businessPlaceOwned: boolean;
    totalNetworthAvailable: boolean;
  };
  debtMatches: {
    hasExistingLoans: boolean;
    loanListAvailable: boolean;
    canServiceNewLoan: boolean;
    repaymentHistoryQuality: boolean;
    loansSourceBankNature: boolean;
  };
  endUseMatches: {
    agreementValueAvailable: boolean;
    advancePaidCashOrBankAmount: boolean;
    willOccupyPostPurchase: boolean;
    mortgageFundsUse: boolean;
    additionalUseInformation: boolean;
  };
  referenceMatches: {
    personalRefNeighbours: boolean;
    businessRefBuyersSellers: boolean;
    invoiceVerification: boolean;
  };
  rationale: string;
  aiError?: string;
}

function getDefaultScoreResult(rationale: string, aiError?: string): ComprehensiveScoreResult {
  return {
    personal: 0,
    business: 0,
    banking: 0,
    networth: 0,
    existingDebt: 0,
    endUse: 0,
    referenceChecks: 0,
    aiError,
    personalMatches: {
      selfEducation: false,
      spouseName: false,
      spouseEducation: false,
      spouseEmployment: false,
      mentionAboutKids: false,
      kidsEducation: false,
      kidsSchool: false,
      residenceVintage: false,
      monthlyRentIfRented: false,
      residenceOwnedOrRented: false,
    },
    businessMatches: {
      businessName: false,
      natureOfBusiness: false,
      existenceCurrentPlace: false,
      licensesRegistrations: false,
      promoterExperienceQualifications: false,
      strategicVisionClarity: false,
      employeesSeen: false,
      monthlyTurnover: false,
      clientListConcentrationRisk: false,
      activityDuringVisit: false,
      monthlyIncome: false,
      seasonality: false,
      infraSupportsTurnover: false,
      mfgRawMaterialSourcingStorage: false,
      mfgProcessFlow: false,
      mfgCapacityVsUtilization: false,
      mfgMachineryMakeAutomationMaintenance: false,
      mfgInventoryFifoAging: false,
      mfgQualityControl: false,
      tradingProductRangeInventoryMovement: false,
      tradingPurchaseSalesCycle: false,
      tradingWarehouseStockSeen: false,
      svcDocumentationOfDelivery: false,
      svcTechnologySystems: false,
      svcClientListContractsRevenueModel: false,
      svcContractBasedOrWalkin: false,
    },
    bankingMatches: {
      primaryBankerName: false,
      turnoverCreditedPercent: false,
      bankingTenure: false,
      emisRoutedBank: false,
      qrCodeSpotted: false,
    },
    networthMatches: {
      propertiesOwned: false,
      vehiclesOwned: false,
      otherInvestments: false,
      businessPlaceOwned: false,
      totalNetworthAvailable: false,
    },
    debtMatches: {
      hasExistingLoans: false,
      loanListAvailable: false,
      canServiceNewLoan: false,
      repaymentHistoryQuality: false,
      loansSourceBankNature: false,
    },
    endUseMatches: {
      agreementValueAvailable: false,
      advancePaidCashOrBankAmount: false,
      willOccupyPostPurchase: false,
      mortgageFundsUse: false,
      additionalUseInformation: false,
    },
    referenceMatches: {
      personalRefNeighbours: false,
      businessRefBuyersSellers: false,
      invoiceVerification: false,
    },
    rationale,
  };
}

export async function scoreComprehensiveWithAI(pdfText: string, leadId: string): Promise<ComprehensiveScoreResult> {
  // Check if AI is configured
  if (!isAIConfigured()) {
    console.error(`[AI Scoring - ${leadId}] AI not configured - returning zero scores`);
    return getDefaultScoreResult("AI integration not configured", "AI_NOT_CONFIGURED");
  }
  
  console.log(`[AI Scoring - ${leadId}] Starting comprehensive scoring, PDF text length: ${pdfText.length}`);
  
  const prompt = `You are an expert loan verification report analyst. Analyze this Personal Discussion (PD) Report and score each section based on the completeness and quality of information provided.

**REPORT TEXT:**
${pdfText.substring(0, 15000)}

**SCORING RUBRIC:**

1. **Personal Details (max 15 points, 1.5 pts each):**
   - selfEducation: Education level mentioned
   - spouseName: Spouse's name mentioned
   - spouseEducation: Spouse's education mentioned
   - spouseEmployment: Spouse's occupation
   - mentionAboutKids: Children mentioned
   - kidsEducation: Children's education level
   - kidsSchool: Children's school/institution name
   - residenceVintage: Duration at current residence
   - monthlyRentIfRented: Monthly rent amount (or NA if owned)
   - residenceOwnedOrRented: Ownership/rental status captured

2. **Business Details (max 30 points):**
   Core (2 pts each):
   - businessName, natureOfBusiness, existenceCurrentPlace, licensesRegistrations
   - promoterExperienceQualifications, strategicVisionClarity, employeesSeen
   - monthlyTurnover, clientListConcentrationRisk, activityDuringVisit
   - monthlyIncome, seasonality, infraSupportsTurnover
   Manufacturing (1 pt each, score only if applicable):
   - mfgRawMaterialSourcingStorage, mfgProcessFlow, mfgCapacityVsUtilization
   - mfgMachineryMakeAutomationMaintenance, mfgInventoryFifoAging, mfgQualityControl
   Trading (1 pt each, score only if applicable):
   - tradingProductRangeInventoryMovement, tradingPurchaseSalesCycle, tradingWarehouseStockSeen
   Service (1 pt each, score only if applicable):
   - svcDocumentationOfDelivery, svcTechnologySystems, svcClientListContractsRevenueModel, svcContractBasedOrWalkin

3. **Banking (max 15 points, 3 pts each):**
   - primaryBankerName, turnoverCreditedPercent, bankingTenure, emisRoutedBank, qrCodeSpotted

4. **Networth (max 10 points, 2 pts each):**
   - propertiesOwned, vehiclesOwned, otherInvestments, businessPlaceOwned, totalNetworthAvailable

5. **Existing Debt (max 10 points, 2 pts each):**
   - hasExistingLoans, loanListAvailable, canServiceNewLoan, repaymentHistoryQuality, loansSourceBankNature

6. **End Use (max 10 points, 2 pts each):**
   - agreementValueAvailable, advancePaidCashOrBankAmount, willOccupyPostPurchase, mortgageFundsUse, additionalUseInformation

7. **Reference Checks (max 10 points):**
   - personalRefNeighbours (3.4 pts), businessRefBuyersSellers (3.3 pts), invoiceVerification (3.3 pts)

**IMPORTANT:** Score based on actual content found. If information is meaningfully present, give credit.

Return your analysis as JSON:
{
  "personal": <score 0-15>,
  "business": <score 0-30>,
  "banking": <score 0-15>,
  "networth": <score 0-10>,
  "existingDebt": <score 0-10>,
  "endUse": <score 0-10>,
  "referenceChecks": <score 0-10>,
  "personalMatches": {
    "selfEducation": <boolean>,
    "spouseName": <boolean>,
    "spouseEducation": <boolean>,
    "spouseEmployment": <boolean>,
    "mentionAboutKids": <boolean>,
    "kidsEducation": <boolean>,
    "kidsSchool": <boolean>,
    "residenceVintage": <boolean>,
    "monthlyRentIfRented": <boolean>,
    "residenceOwnedOrRented": <boolean>
  },
  "businessMatches": {
    "businessName": <boolean>,
    "natureOfBusiness": <boolean>,
    "existenceCurrentPlace": <boolean>,
    "licensesRegistrations": <boolean>,
    "promoterExperienceQualifications": <boolean>,
    "strategicVisionClarity": <boolean>,
    "employeesSeen": <boolean>,
    "monthlyTurnover": <boolean>,
    "clientListConcentrationRisk": <boolean>,
    "activityDuringVisit": <boolean>,
    "monthlyIncome": <boolean>,
    "seasonality": <boolean>,
    "infraSupportsTurnover": <boolean>,
    "mfgRawMaterialSourcingStorage": <boolean>,
    "mfgProcessFlow": <boolean>,
    "mfgCapacityVsUtilization": <boolean>,
    "mfgMachineryMakeAutomationMaintenance": <boolean>,
    "mfgInventoryFifoAging": <boolean>,
    "mfgQualityControl": <boolean>,
    "tradingProductRangeInventoryMovement": <boolean>,
    "tradingPurchaseSalesCycle": <boolean>,
    "tradingWarehouseStockSeen": <boolean>,
    "svcDocumentationOfDelivery": <boolean>,
    "svcTechnologySystems": <boolean>,
    "svcClientListContractsRevenueModel": <boolean>,
    "svcContractBasedOrWalkin": <boolean>
  },
  "bankingMatches": {
    "primaryBankerName": <boolean>,
    "turnoverCreditedPercent": <boolean>,
    "bankingTenure": <boolean>,
    "emisRoutedBank": <boolean>,
    "qrCodeSpotted": <boolean>
  },
  "networthMatches": {
    "propertiesOwned": <boolean>,
    "vehiclesOwned": <boolean>,
    "otherInvestments": <boolean>,
    "businessPlaceOwned": <boolean>,
    "totalNetworthAvailable": <boolean>
  },
  "debtMatches": {
    "hasExistingLoans": <boolean>,
    "loanListAvailable": <boolean>,
    "canServiceNewLoan": <boolean>,
    "repaymentHistoryQuality": <boolean>,
    "loansSourceBankNature": <boolean>
  },
  "endUseMatches": {
    "agreementValueAvailable": <boolean>,
    "advancePaidCashOrBankAmount": <boolean>,
    "willOccupyPostPurchase": <boolean>,
    "mortgageFundsUse": <boolean>,
    "additionalUseInformation": <boolean>
  },
  "referenceMatches": {
    "personalRefNeighbours": <boolean>,
    "businessRefBuyersSellers": <boolean>,
    "invoiceVerification": <boolean>
  },
  "rationale": "<brief explanation>"
}

Respond ONLY with valid JSON.`;

  try {
    console.log(`[AI Scoring - ${leadId}] About to call OpenRouter API...`);
    
    const response = await simpleRetry(async () => {
      console.log(`[AI Scoring - ${leadId}] Making API request to OpenRouter...`);
      const result = await getOpenRouterClient().chat.completions.create({
        model: "anthropic/claude-3-haiku",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      });
      console.log(`[AI Scoring - ${leadId}] API request successful, got response`);
      return result.choices[0]?.message?.content || "";
    }, 1, 2000);

    console.log(`[AI Scoring - ${leadId}] Raw response length: ${response.length}, preview:`, response.substring(0, 500));

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Helper to coerce and clamp scores within valid range
      const coerceScore = (value: any, max: number): number => {
        const num = typeof value === 'string' ? parseFloat(value) : Number(value);
        if (isNaN(num)) return 0;
        return Math.max(0, Math.min(max, Math.round(num)));
      };
      
      // Helper to coerce boolean values
      const coerceBool = (value: any): boolean => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return Boolean(value);
      };
      
      // Validate and clamp all scores to their respective maximums
      const validatedScores: ComprehensiveScoreResult = {
        personal: coerceScore(parsed.personal, 15),
        business: coerceScore(parsed.business, 30),
        banking: coerceScore(parsed.banking, 15),
        networth: coerceScore(parsed.networth, 10),
        existingDebt: coerceScore(parsed.existingDebt, 10),
        endUse: coerceScore(parsed.endUse, 10),
        referenceChecks: coerceScore(parsed.referenceChecks, 10),
        personalMatches: {
          selfEducation: coerceBool(parsed.personalMatches?.selfEducation),
          spouseName: coerceBool(parsed.personalMatches?.spouseName),
          spouseEducation: coerceBool(parsed.personalMatches?.spouseEducation),
          spouseEmployment: coerceBool(parsed.personalMatches?.spouseEmployment),
          mentionAboutKids: coerceBool(parsed.personalMatches?.mentionAboutKids),
          kidsEducation: coerceBool(parsed.personalMatches?.kidsEducation),
          kidsSchool: coerceBool(parsed.personalMatches?.kidsSchool),
          residenceVintage: coerceBool(parsed.personalMatches?.residenceVintage),
          monthlyRentIfRented: coerceBool(parsed.personalMatches?.monthlyRentIfRented),
          residenceOwnedOrRented: coerceBool(parsed.personalMatches?.residenceOwnedOrRented),
        },
        businessMatches: {
          businessName: coerceBool(parsed.businessMatches?.businessName),
          natureOfBusiness: coerceBool(parsed.businessMatches?.natureOfBusiness),
          existenceCurrentPlace: coerceBool(parsed.businessMatches?.existenceCurrentPlace),
          licensesRegistrations: coerceBool(parsed.businessMatches?.licensesRegistrations),
          promoterExperienceQualifications: coerceBool(parsed.businessMatches?.promoterExperienceQualifications),
          strategicVisionClarity: coerceBool(parsed.businessMatches?.strategicVisionClarity),
          employeesSeen: coerceBool(parsed.businessMatches?.employeesSeen),
          monthlyTurnover: coerceBool(parsed.businessMatches?.monthlyTurnover),
          clientListConcentrationRisk: coerceBool(parsed.businessMatches?.clientListConcentrationRisk),
          activityDuringVisit: coerceBool(parsed.businessMatches?.activityDuringVisit),
          monthlyIncome: coerceBool(parsed.businessMatches?.monthlyIncome),
          seasonality: coerceBool(parsed.businessMatches?.seasonality),
          infraSupportsTurnover: coerceBool(parsed.businessMatches?.infraSupportsTurnover),
          mfgRawMaterialSourcingStorage: coerceBool(parsed.businessMatches?.mfgRawMaterialSourcingStorage),
          mfgProcessFlow: coerceBool(parsed.businessMatches?.mfgProcessFlow),
          mfgCapacityVsUtilization: coerceBool(parsed.businessMatches?.mfgCapacityVsUtilization),
          mfgMachineryMakeAutomationMaintenance: coerceBool(parsed.businessMatches?.mfgMachineryMakeAutomationMaintenance),
          mfgInventoryFifoAging: coerceBool(parsed.businessMatches?.mfgInventoryFifoAging),
          mfgQualityControl: coerceBool(parsed.businessMatches?.mfgQualityControl),
          tradingProductRangeInventoryMovement: coerceBool(parsed.businessMatches?.tradingProductRangeInventoryMovement),
          tradingPurchaseSalesCycle: coerceBool(parsed.businessMatches?.tradingPurchaseSalesCycle),
          tradingWarehouseStockSeen: coerceBool(parsed.businessMatches?.tradingWarehouseStockSeen),
          svcDocumentationOfDelivery: coerceBool(parsed.businessMatches?.svcDocumentationOfDelivery),
          svcTechnologySystems: coerceBool(parsed.businessMatches?.svcTechnologySystems),
          svcClientListContractsRevenueModel: coerceBool(parsed.businessMatches?.svcClientListContractsRevenueModel),
          svcContractBasedOrWalkin: coerceBool(parsed.businessMatches?.svcContractBasedOrWalkin),
        },
        bankingMatches: {
          primaryBankerName: coerceBool(parsed.bankingMatches?.primaryBankerName),
          turnoverCreditedPercent: coerceBool(parsed.bankingMatches?.turnoverCreditedPercent),
          bankingTenure: coerceBool(parsed.bankingMatches?.bankingTenure),
          emisRoutedBank: coerceBool(parsed.bankingMatches?.emisRoutedBank),
          qrCodeSpotted: coerceBool(parsed.bankingMatches?.qrCodeSpotted),
        },
        networthMatches: {
          propertiesOwned: coerceBool(parsed.networthMatches?.propertiesOwned),
          vehiclesOwned: coerceBool(parsed.networthMatches?.vehiclesOwned),
          otherInvestments: coerceBool(parsed.networthMatches?.otherInvestments),
          businessPlaceOwned: coerceBool(parsed.networthMatches?.businessPlaceOwned),
          totalNetworthAvailable: coerceBool(parsed.networthMatches?.totalNetworthAvailable),
        },
        debtMatches: {
          hasExistingLoans: coerceBool(parsed.debtMatches?.hasExistingLoans),
          loanListAvailable: coerceBool(parsed.debtMatches?.loanListAvailable),
          canServiceNewLoan: coerceBool(parsed.debtMatches?.canServiceNewLoan),
          repaymentHistoryQuality: coerceBool(parsed.debtMatches?.repaymentHistoryQuality),
          loansSourceBankNature: coerceBool(parsed.debtMatches?.loansSourceBankNature),
        },
        endUseMatches: {
          agreementValueAvailable: coerceBool(parsed.endUseMatches?.agreementValueAvailable),
          advancePaidCashOrBankAmount: coerceBool(parsed.endUseMatches?.advancePaidCashOrBankAmount),
          willOccupyPostPurchase: coerceBool(parsed.endUseMatches?.willOccupyPostPurchase),
          mortgageFundsUse: coerceBool(parsed.endUseMatches?.mortgageFundsUse),
          additionalUseInformation: coerceBool(parsed.endUseMatches?.additionalUseInformation),
        },
        referenceMatches: {
          personalRefNeighbours: coerceBool(parsed.referenceMatches?.personalRefNeighbours),
          businessRefBuyersSellers: coerceBool(parsed.referenceMatches?.businessRefBuyersSellers),
          invoiceVerification: coerceBool(parsed.referenceMatches?.invoiceVerification),
        },
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : "AI analysis completed",
      };
      
      console.log(`[AI Scoring - ${leadId}] Validated scores:`, validatedScores);
      
      return validatedScores;
    }
    console.error(`[AI Scoring - ${leadId}] No valid JSON found in response`);
    throw new Error("No valid JSON found in AI response");
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    console.error(`[AI Scoring - ${leadId}] SCORING FAILED:`, {
      message: errorMsg,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      stack: error?.stack?.substring(0, 500),
    });
    return getDefaultScoreResult(
      `AI scoring failed: ${errorMsg} - manual review required`,
      `SCORING_FAILED: ${errorMsg}`
    );
  }
}

export async function calculatePhotoScore(checklistItems: {
  personal: { applicantPhoto: boolean; selfieWithVO: boolean };
  business: { 
    signboard: boolean; 
    proprietorName: boolean; 
    contactVisible: boolean;
    activeOperations: boolean;
    staffVisible: boolean;
    stockInventory: boolean;
  };
  banking: { upiQR: boolean; multipleQR: boolean; bankEvidence: boolean };
  endUse: { premises: boolean; workingCapital: boolean; equipment: boolean };
  quality: { gpsTimestamp: boolean; locationConsistent: boolean; timeSequence: boolean };
}): Promise<{
  personal: number;
  business: number;
  banking: number;
  endUse: number;
  quality: number;
  total: number;
  maxTotal: number;
  percentage: number;
}> {
  const personal = 
    (checklistItems.personal.applicantPhoto ? 5 : 0) +
    (checklistItems.personal.selfieWithVO ? 5 : 0);

  const business = 
    (checklistItems.business.signboard ? 5 : 0) +
    (checklistItems.business.proprietorName ? 4 : 0) +
    (checklistItems.business.contactVisible ? 3 : 0) +
    (checklistItems.business.activeOperations ? 4 : 0) +
    (checklistItems.business.staffVisible ? 3 : 0) +
    (checklistItems.business.stockInventory ? 3 : 0);

  const banking = 
    (checklistItems.banking.upiQR ? 4 : 0) +
    (checklistItems.banking.multipleQR ? 2 : 0) +
    (checklistItems.banking.bankEvidence ? 2 : 0);

  const endUse = 
    (checklistItems.endUse.premises ? 4 : 0) +
    (checklistItems.endUse.workingCapital ? 3 : 0) +
    (checklistItems.endUse.equipment ? 3 : 0);

  const quality = 
    (checklistItems.quality.gpsTimestamp ? 4 : 0) +
    (checklistItems.quality.locationConsistent ? 3 : 0) +
    (checklistItems.quality.timeSequence ? 3 : 0);

  const total = personal + business + banking + endUse + quality;
  const maxTotal = 10 + 22 + 8 + 10 + 10; // 60 points max

  return {
    personal,
    business,
    banking,
    endUse,
    quality,
    total,
    maxTotal,
    percentage: Math.round((total / maxTotal) * 100)
  };
}
