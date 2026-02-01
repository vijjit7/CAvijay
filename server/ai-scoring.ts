import OpenAI from "openai";
import type { ComprehensiveScoreResult } from "./openrouter";

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const baseURL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
    
    if (!apiKey) {
      throw new Error("No OpenRouter API key configured");
    }
    
    openaiClient = new OpenAI({ baseURL, apiKey });
  }
  return openaiClient;
}

export function isAIConfigured(): boolean {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  return !!apiKey;
}

// Exact scoring weights from the Excel rubric
const WEIGHTS = {
  personal: {
    selfEducation: 1.5,
    spouseName: 1.5,
    spouseEducation: 1.5,
    spouseEmployment: 1.5,
    mentionAboutKids: 1.5,
    kidsEducation: 1.5,
    kidsSchool: 1.5,
    residenceVintage: 1.5,
    monthlyRentIfRented: 1.5,
    residenceOwnedOrRented: 1.5,
  }, // Max 15
  business: {
    businessName: 2,
    natureOfBusiness: 2,
    existenceCurrentPlace: 2,
    licensesRegistrations: 2,
    promoterExperience: 2,
    strategicVision: 2,
    employeesSeen: 2,
    monthlyTurnover: 2,
    clientList: 2,
    activityDuringVisit: 2,
    monthlyIncome: 2,
    seasonality: 2,
    infrastructure: 2,
  }, // Max 26
  businessMfg: {
    mfgRawMaterial: 0.5,
    mfgProcessFlow: 1,
    mfgCapacity: 0.5,
    mfgMachinery: 1,
    mfgInventory: 0.5,
    mfgQualityControl: 0.5,
  }, // Max 4
  businessTrading: {
    tradingProductRange: 1,
    tradingPurchaseCycle: 2,
    tradingWarehouse: 1,
  }, // Max 4
  businessService: {
    svcDocumentation: 1,
    svcTechnology: 1,
    svcContracts: 1,
    svcContractBased: 1,
  }, // Max 4
  banking: {
    primaryBankerName: 3,
    turnoverCreditedPercent: 3,
    bankingTenure: 3,
    emisRoutedBank: 3,
    qrCodeSpotted: 3,
  }, // Max 15
  networth: {
    propertiesOwned: 2.5,
    vehiclesOwned: 2.5,
    otherInvestments: 2.5,
    businessPlaceOwned: 2.5,
    totalNetworthAvailable: 2.5,
  }, // Max 10 (capped)
  existingDebt: {
    hasExistingLoans: 2,
    loanListAvailable: 2,
    canServiceNewLoan: 2,
    repaymentHistoryQuality: 2,
    loansSourceBankNature: 2,
  }, // Max 10
  endUseHomeLoan: {
    agreementValueAvailable: 3,
    advancePaidAmount: 3,
    willOccupyPostPurchase: 4,
  }, // Max 10
  endUseMortgage: {
    mortgageFundsUse: 5,
    additionalUseInformation: 5,
  }, // Max 10
  referenceChecks: {
    personalRefNeighbours: 4,
    businessRefBuyersSellers: 3,
    invoiceVerification: 3,
  }, // Max 10
};

function calculateScore(matches: Record<string, boolean>, weights: Record<string, number>): number {
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (matches[key] === true) {
      score += weight;
    }
  }
  return Math.round(score * 100) / 100;
}

export async function scoreComprehensiveWithAI(pdfText: string, leadId: string): Promise<ComprehensiveScoreResult> {
  console.log(`[AI Scoring - ${leadId}] Starting holistic AI scoring, text length: ${pdfText.length}`);
  const startTime = Date.now();
  
  const client = getClient();
  
  // Truncate PDF text to fit within context limits
  const maxTextLength = 12000;
  const truncatedText = pdfText.length > maxTextLength 
    ? pdfText.substring(0, maxTextLength) + "\n...[Report truncated]..."
    : pdfText;

  const prompt = `You are an expert audit report analyzer. Read the COMPLETE report below and identify what information is ACTUALLY PRESENT.

IMPORTANT: Only mark an item as TRUE if the specific information is CLEARLY DOCUMENTED in the report. Do NOT assume or infer - only mark TRUE for explicitly stated information.

SPECIAL NETWORTH RULES:
- "noPropertiesExplicitlyMentioned": Mark TRUE if the report explicitly states that the applicant has NO movable/immovable properties, no land, no house, or similar negative statements about property ownership.
- "noVehiclesExplicitlyMentioned": Mark TRUE if the report explicitly states that the applicant has NO vehicles, no car, no bike, or similar negative statements about vehicle ownership.
- If the applicant explicitly has no properties/vehicles (as stated in report), the corresponding "propertiesOwned"/"vehiclesOwned" can still be FALSE, but we will not penalize for this.

=== AUDIT REPORT ===
${truncatedText}
=== END OF REPORT ===

Analyze the report and respond with ONLY a JSON object (no markdown):
{
  "businessType": "manufacturing" | "trading" | "service" | "unknown",
  "loanType": "home_loan" | "mortgage" | "unknown",
  "maritalStatus": "married" | "unmarried" | "unknown",
  "personal": {
    "selfEducation": true/false,
    "spouseName": true/false,
    "spouseEducation": true/false,
    "spouseEmployment": true/false,
    "mentionAboutKids": true/false,
    "kidsEducation": true/false,
    "kidsSchool": true/false,
    "residenceVintage": true/false,
    "monthlyRentIfRented": true/false,
    "residenceOwnedOrRented": true/false
  },
  "business": {
    "businessName": true/false,
    "natureOfBusiness": true/false,
    "existenceCurrentPlace": true/false,
    "licensesRegistrations": true/false,
    "promoterExperience": true/false,
    "strategicVision": true/false,
    "employeesSeen": true/false,
    "monthlyTurnover": true/false,
    "clientList": true/false,
    "activityDuringVisit": true/false,
    "monthlyIncome": true/false,
    "seasonality": true/false,
    "infrastructure": true/false,
    "mfgRawMaterial": true/false,
    "mfgProcessFlow": true/false,
    "mfgCapacity": true/false,
    "mfgMachinery": true/false,
    "mfgInventory": true/false,
    "mfgQualityControl": true/false,
    "tradingProductRange": true/false,
    "tradingPurchaseCycle": true/false,
    "tradingWarehouse": true/false,
    "svcDocumentation": true/false,
    "svcTechnology": true/false,
    "svcContracts": true/false,
    "svcContractBased": true/false
  },
  "banking": {
    "primaryBankerName": true/false,
    "turnoverCreditedPercent": true/false,
    "bankingTenure": true/false,
    "emisRoutedBank": true/false,
    "qrCodeSpotted": true/false
  },
  "networth": {
    "propertiesOwned": true/false,
    "vehiclesOwned": true/false,
    "otherInvestments": true/false,
    "businessPlaceOwned": true/false,
    "totalNetworthAvailable": true/false,
    "noPropertiesExplicitlyMentioned": true/false,
    "noVehiclesExplicitlyMentioned": true/false
  },
  "existingDebt": {
    "hasExistingLoans": true/false,
    "loanListAvailable": true/false,
    "canServiceNewLoan": true/false,
    "repaymentHistoryQuality": true/false,
    "loansSourceBankNature": true/false
  },
  "endUse": {
    "agreementValueAvailable": true/false,
    "advancePaidAmount": true/false,
    "willOccupyPostPurchase": true/false,
    "mortgageFundsUse": true/false,
    "additionalUseInformation": true/false
  },
  "referenceChecks": {
    "personalRefNeighbours": true/false,
    "businessRefBuyersSellers": true/false,
    "invoiceVerification": true/false
  },
  "summary": "<one sentence summary>"
}`;

  try {
    const response = await client.chat.completions.create({
      model: "anthropic/claude-3-haiku",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0,
    });
    
    const content = response.choices[0]?.message?.content || "{}";
    console.log(`[AI Scoring - ${leadId}] Raw response length: ${content.length}`);
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON in AI response");
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    const totalTime = Date.now() - startTime;
    
    // Calculate scores from boolean matches using exact weights
    const personalMatches = parsed.personal || {};
    const businessMatches = parsed.business || {};
    const bankingMatches = parsed.banking || {};
    const networthMatches = parsed.networth || {};
    const debtMatches = parsed.existingDebt || {};
    const endUseMatches = parsed.endUse || {};
    const refMatches = parsed.referenceChecks || {};
    const maritalStatus = parsed.maritalStatus || "unknown";
    
    // Calculate personal score, adjusting for marital status
    // For unmarried applicants, spouse and kids fields should not count against them
    let personalScore: number;
    if (maritalStatus === "unmarried") {
      // Unmarried: only score non-spouse/kids fields (4 items × 1.5 = 6pts base)
      // But scale up to 15pts max so they're not penalized
      const unmarriedWeights = {
        selfEducation: WEIGHTS.personal.selfEducation,
        residenceVintage: WEIGHTS.personal.residenceVintage,
        monthlyRentIfRented: WEIGHTS.personal.monthlyRentIfRented,
        residenceOwnedOrRented: WEIGHTS.personal.residenceOwnedOrRented,
      };
      const rawUnmarriedScore = calculateScore(personalMatches, unmarriedWeights);
      // Max possible for unmarried = 6pts (4 items × 1.5), scale to 15
      personalScore = Math.round((rawUnmarriedScore / 6) * 15 * 100) / 100;
      console.log(`[AI Scoring - ${leadId}] Unmarried applicant - raw personal: ${rawUnmarriedScore}/6, scaled: ${personalScore}/15`);
    } else {
      personalScore = calculateScore(personalMatches, WEIGHTS.personal);
    }
    
    // Business score: core + type-specific
    let businessScore = calculateScore(businessMatches, WEIGHTS.business);
    const businessType = parsed.businessType || "unknown";
    if (businessType === "manufacturing") {
      businessScore += calculateScore(businessMatches, WEIGHTS.businessMfg);
    } else if (businessType === "trading") {
      businessScore += calculateScore(businessMatches, WEIGHTS.businessTrading);
    } else if (businessType === "service") {
      businessScore += calculateScore(businessMatches, WEIGHTS.businessService);
    }
    businessScore = Math.min(businessScore, 30);
    
    const bankingScore = Math.min(calculateScore(bankingMatches, WEIGHTS.banking), 15);
    
    // Networth scoring with special handling for "no properties/vehicles" explicit mentions
    // If the report explicitly states no properties/vehicles, we should not penalize for those fields
    const noPropertiesExplicit = networthMatches.noPropertiesExplicitlyMentioned === true;
    const noVehiclesExplicit = networthMatches.noVehiclesExplicitlyMentioned === true;
    
    let networthScore: number;
    if (noPropertiesExplicit || noVehiclesExplicit) {
      // Create adjusted weights excluding explicitly "no" items
      const adjustedWeights: Record<string, number> = { ...WEIGHTS.networth };
      let maxPossible = 12.5; // 5 items × 2.5
      
      if (noPropertiesExplicit) {
        delete adjustedWeights.propertiesOwned;
        maxPossible -= 2.5;
        console.log(`[AI Scoring - ${leadId}] No properties explicitly mentioned - excluding from penalty`);
      }
      if (noVehiclesExplicit) {
        delete adjustedWeights.vehiclesOwned;
        maxPossible -= 2.5;
        console.log(`[AI Scoring - ${leadId}] No vehicles explicitly mentioned - excluding from penalty`);
      }
      
      // Calculate score with adjusted weights
      const rawAdjustedScore = calculateScore(networthMatches, adjustedWeights);
      // Scale to 10 points based on what's actually possible
      networthScore = maxPossible > 0 ? Math.min((rawAdjustedScore / maxPossible) * 10, 10) : 0;
      networthScore = Math.round(networthScore * 100) / 100;
      console.log(`[AI Scoring - ${leadId}] Networth adjusted: raw=${rawAdjustedScore}/${maxPossible}, scaled=${networthScore}/10`);
    } else {
      const rawNetworthScore = calculateScore(networthMatches, WEIGHTS.networth);
      networthScore = Math.min(rawNetworthScore, 10); // Cap at 10 since 5 items × 2.5 = 12.5
    }
    
    const debtScore = Math.min(calculateScore(debtMatches, WEIGHTS.existingDebt), 10);
    
    // Debug logging to trace exact values
    const networthChecks = Object.values(networthMatches).filter(v => v === true).length;
    console.log(`[AI Scoring - ${leadId}] Networth matches:`, JSON.stringify(networthMatches));
    console.log(`[AI Scoring - ${leadId}] Networth: ${networthChecks} checks, final score=${networthScore}/10`);
    
    // End use score: depends on loan type
    const loanType = parsed.loanType || "unknown";
    let endUseScore = 0;
    const homeLoanScore = calculateScore(endUseMatches, WEIGHTS.endUseHomeLoan);
    const mortgageScore = calculateScore(endUseMatches, WEIGHTS.endUseMortgage);
    
    if (loanType === "home_loan") {
      endUseScore = homeLoanScore;
    } else if (loanType === "mortgage") {
      endUseScore = mortgageScore;
    } else {
      // Use whichever gives higher score
      endUseScore = Math.max(homeLoanScore, mortgageScore);
    }
    endUseScore = Math.min(endUseScore, 10);
    
    // Debug logging for End Use
    const endUseChecks = Object.values(endUseMatches).filter(v => v === true).length;
    console.log(`[AI Scoring - ${leadId}] End Use matches:`, JSON.stringify(endUseMatches));
    console.log(`[AI Scoring - ${leadId}] End Use: ${endUseChecks} checks, loanType=${loanType}, homeLoan=${homeLoanScore}, mortgage=${mortgageScore}, final=${endUseScore}/10`);
    
    const refScore = Math.min(calculateScore(refMatches, WEIGHTS.referenceChecks), 10);
    const refChecks = Object.values(refMatches).filter(v => v === true).length;
    console.log(`[AI Scoring - ${leadId}] Reference: ${refChecks} checks, score=${refScore}/10`);
    
    const totalScore = personalScore + businessScore + bankingScore + networthScore + debtScore + endUseScore + refScore;
    
    const maritalNote = maritalStatus === "unmarried" ? " Unmarried applicant - spouse/kids fields excluded from personal scoring." : "";
    const rationale = `AI scoring completed in ${totalTime}ms. Total: ${totalScore}/100. ` +
      `Business: ${businessType}.${maritalNote} ${parsed.summary || ''}`;
    
    console.log(`[AI Scoring - ${leadId}] Scores: Personal=${personalScore}/15, Business=${businessScore}/30, Banking=${bankingScore}/15, Networth=${networthScore}/10, Debt=${debtScore}/10, EndUse=${endUseScore}/10, Ref=${refScore}/10`);

    return {
      personal: personalScore,
      business: businessScore,
      banking: bankingScore,
      networth: networthScore,
      existingDebt: debtScore,
      endUse: endUseScore,
      referenceChecks: refScore,
      personalMatches: {
        selfEducation: personalMatches.selfEducation || false,
        spouseName: personalMatches.spouseName || false,
        spouseEducation: personalMatches.spouseEducation || false,
        spouseEmployment: personalMatches.spouseEmployment || false,
        mentionAboutKids: personalMatches.mentionAboutKids || false,
        kidsEducation: personalMatches.kidsEducation || false,
        kidsSchool: personalMatches.kidsSchool || false,
        residenceVintage: personalMatches.residenceVintage || false,
        monthlyRentIfRented: personalMatches.monthlyRentIfRented || false,
        residenceOwnedOrRented: personalMatches.residenceOwnedOrRented || false,
      },
      businessMatches: {
        businessName: businessMatches.businessName || false,
        natureOfBusiness: businessMatches.natureOfBusiness || false,
        existenceCurrentPlace: businessMatches.existenceCurrentPlace || false,
        licensesRegistrations: businessMatches.licensesRegistrations || false,
        promoterExperienceQualifications: businessMatches.promoterExperience || false,
        strategicVisionClarity: businessMatches.strategicVision || false,
        employeesSeen: businessMatches.employeesSeen || false,
        monthlyTurnover: businessMatches.monthlyTurnover || false,
        clientListConcentrationRisk: businessMatches.clientList || false,
        activityDuringVisit: businessMatches.activityDuringVisit || false,
        monthlyIncome: businessMatches.monthlyIncome || false,
        seasonality: businessMatches.seasonality || false,
        infraSupportsTurnover: businessMatches.infrastructure || false,
        mfgRawMaterialSourcingStorage: businessMatches.mfgRawMaterial || false,
        mfgProcessFlow: businessMatches.mfgProcessFlow || false,
        mfgCapacityVsUtilization: businessMatches.mfgCapacity || false,
        mfgMachineryMakeAutomationMaintenance: businessMatches.mfgMachinery || false,
        mfgInventoryFifoAging: businessMatches.mfgInventory || false,
        mfgQualityControl: businessMatches.mfgQualityControl || false,
        tradingProductRangeInventoryMovement: businessMatches.tradingProductRange || false,
        tradingPurchaseSalesCycle: businessMatches.tradingPurchaseCycle || false,
        tradingWarehouseStockSeen: businessMatches.tradingWarehouse || false,
        svcDocumentationOfDelivery: businessMatches.svcDocumentation || false,
        svcTechnologySystems: businessMatches.svcTechnology || false,
        svcClientListContractsRevenueModel: businessMatches.svcContracts || false,
        svcContractBasedOrWalkin: businessMatches.svcContractBased || false,
      },
      bankingMatches: {
        primaryBankerName: bankingMatches.primaryBankerName || false,
        turnoverCreditedPercent: bankingMatches.turnoverCreditedPercent || false,
        bankingTenure: bankingMatches.bankingTenure || false,
        emisRoutedBank: bankingMatches.emisRoutedBank || false,
        qrCodeSpotted: bankingMatches.qrCodeSpotted || false,
      },
      networthMatches: {
        propertiesOwned: networthMatches.propertiesOwned || false,
        vehiclesOwned: networthMatches.vehiclesOwned || false,
        otherInvestments: networthMatches.otherInvestments || false,
        businessPlaceOwned: networthMatches.businessPlaceOwned || false,
        totalNetworthAvailable: networthMatches.totalNetworthAvailable || false,
      },
      debtMatches: {
        hasExistingLoans: debtMatches.hasExistingLoans || false,
        loanListAvailable: debtMatches.loanListAvailable || false,
        canServiceNewLoan: debtMatches.canServiceNewLoan || false,
        repaymentHistoryQuality: debtMatches.repaymentHistoryQuality || false,
        loansSourceBankNature: debtMatches.loansSourceBankNature || false,
      },
      endUseMatches: {
        agreementValueAvailable: endUseMatches.agreementValueAvailable || false,
        advancePaidCashOrBankAmount: endUseMatches.advancePaidAmount || false,
        willOccupyPostPurchase: endUseMatches.willOccupyPostPurchase || false,
        mortgageFundsUse: endUseMatches.mortgageFundsUse || false,
        additionalUseInformation: endUseMatches.additionalUseInformation || false,
      },
      referenceMatches: {
        personalRefNeighbours: refMatches.personalRefNeighbours || false,
        businessRefBuyersSellers: refMatches.businessRefBuyersSellers || false,
        invoiceVerification: refMatches.invoiceVerification || false,
      },
      rationale,
    };
  } catch (error: any) {
    console.error(`[AI Scoring - ${leadId}] Error:`, error?.message);
    
    return {
      personal: 0,
      business: 0,
      banking: 0,
      networth: 0,
      existingDebt: 0,
      endUse: 0,
      referenceChecks: 0,
      personalMatches: {
        selfEducation: false, spouseName: false, spouseEducation: false, spouseEmployment: false,
        mentionAboutKids: false, kidsEducation: false, kidsSchool: false, residenceVintage: false,
        monthlyRentIfRented: false, residenceOwnedOrRented: false,
      },
      businessMatches: {
        businessName: false, natureOfBusiness: false, existenceCurrentPlace: false, licensesRegistrations: false,
        promoterExperienceQualifications: false, strategicVisionClarity: false, employeesSeen: false,
        monthlyTurnover: false, clientListConcentrationRisk: false, activityDuringVisit: false,
        monthlyIncome: false, seasonality: false, infraSupportsTurnover: false,
        mfgRawMaterialSourcingStorage: false, mfgProcessFlow: false, mfgCapacityVsUtilization: false,
        mfgMachineryMakeAutomationMaintenance: false, mfgInventoryFifoAging: false, mfgQualityControl: false,
        tradingProductRangeInventoryMovement: false, tradingPurchaseSalesCycle: false, tradingWarehouseStockSeen: false,
        svcDocumentationOfDelivery: false, svcTechnologySystems: false, svcClientListContractsRevenueModel: false,
        svcContractBasedOrWalkin: false,
      },
      bankingMatches: {
        primaryBankerName: false, turnoverCreditedPercent: false, bankingTenure: false,
        emisRoutedBank: false, qrCodeSpotted: false,
      },
      networthMatches: {
        propertiesOwned: false, vehiclesOwned: false, otherInvestments: false,
        businessPlaceOwned: false, totalNetworthAvailable: false,
      },
      debtMatches: {
        hasExistingLoans: false, loanListAvailable: false, canServiceNewLoan: false,
        repaymentHistoryQuality: false, loansSourceBankNature: false,
      },
      endUseMatches: {
        agreementValueAvailable: false, advancePaidCashOrBankAmount: false, willOccupyPostPurchase: false,
        mortgageFundsUse: false, additionalUseInformation: false,
      },
      referenceMatches: {
        personalRefNeighbours: false, businessRefBuyersSellers: false, invoiceVerification: false,
      },
      rationale: `AI scoring failed: ${error?.message || 'Unknown error'}`,
      aiError: error?.message || 'Unknown error',
    };
  }
}
