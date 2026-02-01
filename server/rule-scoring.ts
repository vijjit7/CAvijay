import type { ComprehensiveScoreResult } from "./openrouter";

interface ExtractedFields {
  personal: {
    selfEducation: string | null;
    spouseName: string | null;
    spouseEducation: string | null;
    spouseEmployment: string | null;
    kidsMentioned: boolean;
    kidsEducation: string | null;
    kidsSchool: string | null;
    residenceVintage: string | null;
    monthlyRent: number | null;
    residenceOwnership: "Owned" | "Rented" | null;
  };
  business: {
    businessName: string | null;
    natureOfBusiness: string | null;
    existenceYears: number | null;
    licenses: string[];
    experience: string | null;
    vision: string | null;
    employeeCount: number | null;
    monthlyTurnover: number | null;
    clientList: string[];
    activityObserved: boolean;
    monthlyIncome: number | null;
    seasonality: string | null;
    infrastructure: string | null;
    businessType: "manufacturing" | "trading" | "service" | null;
    mfgDetails: { rawMaterial: boolean; processFlow: boolean; capacity: boolean; machinery: boolean; inventory: boolean; qualityControl: boolean };
    tradingDetails: { productRange: boolean; purchaseCycle: boolean; warehouse: boolean };
    serviceDetails: { documentation: boolean; technology: boolean; contracts: boolean; contractBased: boolean };
  };
  banking: {
    bankerName: string | null;
    turnoverCreditedPercent: number | null;
    bankingTenure: string | null;
    emisRouted: boolean;
    qrCodeSpotted: boolean;
  };
  networth: {
    propertiesOwned: string[];
    vehiclesOwned: string[];
    investments: string[];
    businessPlaceOwned: boolean;
    totalNetworth: number | null;
  };
  debt: {
    hasLoans: boolean;
    loanList: string[];
    canServiceNewLoan: boolean;
    repaymentHistory: string | null;
    loanSources: string[];
  };
  endUse: {
    agreementValue: number | null;
    advancePaid: number | null;
    willOccupy: boolean;
    mortgageUse: string | null;
    additionalInfo: string | null;
  };
  references: {
    personalRefs: string[];
    businessRefs: string[];
    invoicesVerified: boolean;
  };
}

const PERSONAL_PATTERNS = {
  selfEducation: [/education[:\s]*([^\n,]+)/i, /qualification[:\s]*([^\n,]+)/i, /educated[:\s]*([^\n,]+)/i, /graduate/i, /post[- ]?graduate/i, /degree/i, /diploma/i, /10th|12th|matriculat/i],
  spouseName: [/spouse[:\s]*([^\n,]+)/i, /wife[:\s]*([^\n,]+)/i, /husband[:\s]*([^\n,]+)/i, /married to[:\s]*([^\n,]+)/i],
  spouseEducation: [/spouse.*education[:\s]*([^\n,]+)/i, /wife.*education/i, /husband.*education/i],
  spouseEmployment: [/spouse.*employ|spouse.*occupation|spouse.*work|wife.*work|husband.*work/i, /spouse.*job/i],
  kids: [/child|children|son|daughter|kid|dependent/i],
  kidsEducation: [/child.*educat|son.*educat|daughter.*educat|kid.*school|child.*study/i],
  kidsSchool: [/school[:\s]*([^\n,]+)/i, /college[:\s]*([^\n,]+)/i, /studying at/i],
  residenceVintage: [/resid.*since|stay.*since|living.*since|(\d+)\s*years?\s*(at|in|of)\s*residen/i, /residence\s*vintage/i],
  monthlyRent: [/rent[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+)/i, /monthly\s*rent/i],
  residenceOwnership: [/own\s*house|owned\s*residen|self[- ]?owned|property\s*owned/i, /rent(ed|al)\s*(house|residen|property)/i],
};

const BUSINESS_PATTERNS = {
  businessName: [/business\s*name[:\s]*([^\n]+)/i, /firm\s*name[:\s]*([^\n]+)/i, /company\s*name[:\s]*([^\n]+)/i, /entity\s*name[:\s]*([^\n]+)/i],
  natureOfBusiness: [/nature\s*of\s*business[:\s]*([^\n]+)/i, /business\s*type[:\s]*([^\n]+)/i, /type\s*of\s*business/i],
  existence: [/exist.*since|establish.*since|operat.*since|(\d+)\s*years?\s*(in|of)\s*business/i],
  licenses: [/licen[sc]e|registration|gst|pan|udyam|msme|trade\s*licen|shop\s*act/i],
  experience: [/experience|expertise|years?\s*in\s*business/i],
  vision: [/vision|plan|growth|expansion|future/i],
  employees: [/employee|staff|worker|labour|(\d+)\s*people\s*work/i],
  turnover: [/turnover[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,\.]+)\s*(lakh|lac|cr|crore)?/i, /monthly\s*sales/i],
  clients: [/client|customer|buyer|seller/i],
  activity: [/active\s*operation|business\s*activity|visit.*observed|during\s*visit/i],
  income: [/income[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,\.]+)/i, /monthly\s*income/i, /net\s*profit/i],
  seasonality: [/seasonal|peak\s*season|off[- ]?season|fluctuat/i],
  infrastructure: [/infrastructure|premises|factory|office\s*space|godown|warehouse/i],
  manufacturing: [/manufactur|production|factory|plant/i],
  trading: [/trad(e|ing)|wholesale|retail|shop|store|dealer/i],
  service: [/service|consultancy|IT|software|contractor/i],
};

const BANKING_PATTERNS = {
  bankerName: [/bank[:\s]*([^\n,]+)/i, /banker[:\s]*([^\n,]+)/i, /primary\s*bank/i, /hdfc|icici|sbi|axis|kotak|yes\s*bank|idfc|bandhan|pnb|bob|union|canara/i],
  turnoverCredited: [/(\d+)[\s%]*(?:of\s*)?turnover.*credit|credit.*(\d+)[\s%]/i, /turnover.*routed/i],
  tenure: [/banking\s*(?:relation|tenure|since)|account.*since|(\d+)\s*years?\s*(?:with|at)\s*bank/i],
  emisRouted: [/emi.*routed|emi.*debit|loan\s*emi.*bank/i],
  qrCode: [/qr\s*code|upi|phonepe|gpay|paytm|bhim/i],
};

const NETWORTH_PATTERNS = {
  properties: [/property|properties|land|plot|flat|house|apartment|real\s*estate/i],
  vehicles: [/vehicle|car|bike|scooter|two[- ]?wheeler|four[- ]?wheeler/i],
  investments: [/invest|fd|fixed\s*deposit|mutual\s*fund|shares|stock|gold|lic|insurance/i],
  businessPlace: [/own\s*business\s*place|office\s*owned|shop\s*owned|factory\s*owned/i],
  totalNetworth: [/net\s*worth[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,\.]+)/i, /total\s*asset/i],
};

const DEBT_PATTERNS = {
  hasLoans: [/existing\s*loan|current\s*loan|outstanding|emi|debt/i],
  loanList: [/loan\s*(?:from|with|at)[:\s]*([^\n]+)/i, /borrowing/i],
  serviceability: [/can\s*service|repay.*capacity|sufficient\s*income/i],
  repaymentHistory: [/repayment|cibil|credit\s*score|payment\s*history|no\s*default/i],
  loanSource: [/loan.*from.*bank|loan.*from.*nbfc|loan.*from.*fintech/i],
};

const ENDUSE_PATTERNS = {
  agreementValue: [/agreement\s*value[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,\.]+)/i, /property\s*value/i],
  advancePaid: [/advance\s*paid[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,\.]+)/i, /down\s*payment/i],
  willOccupy: [/will\s*occupy|self[- ]?occup|personal\s*use|own\s*stay/i],
  mortgageUse: [/mortgage.*for|loan.*for|end\s*use|purpose.*loan/i],
  additionalInfo: [/additional.*use|other.*purpose/i],
};

const REFERENCE_PATTERNS = {
  personalRef: [/neighbour|neighbor|relative|family\s*reference|personal\s*reference/i],
  businessRef: [/buyer|seller|supplier|vendor|customer\s*reference|business\s*reference/i],
  invoices: [/invoice|bill|receipt|purchase\s*order|sales\s*order/i],
};

function matchPattern(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  return null;
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function extractNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const numStr = (match[1] || match[0]).replace(/[,\s]/g, '');
      const num = parseFloat(numStr);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

function extractFields(pdfText: string): ExtractedFields {
  const text = pdfText.toLowerCase();
  
  const businessType: "manufacturing" | "trading" | "service" | null = 
    hasPattern(text, BUSINESS_PATTERNS.manufacturing) ? "manufacturing" :
    hasPattern(text, BUSINESS_PATTERNS.trading) ? "trading" :
    hasPattern(text, BUSINESS_PATTERNS.service) ? "service" : null;

  return {
    personal: {
      selfEducation: matchPattern(text, PERSONAL_PATTERNS.selfEducation),
      spouseName: matchPattern(text, PERSONAL_PATTERNS.spouseName),
      spouseEducation: matchPattern(text, PERSONAL_PATTERNS.spouseEducation),
      spouseEmployment: matchPattern(text, PERSONAL_PATTERNS.spouseEmployment),
      kidsMentioned: hasPattern(text, PERSONAL_PATTERNS.kids),
      kidsEducation: matchPattern(text, PERSONAL_PATTERNS.kidsEducation),
      kidsSchool: matchPattern(text, PERSONAL_PATTERNS.kidsSchool),
      residenceVintage: matchPattern(text, PERSONAL_PATTERNS.residenceVintage),
      monthlyRent: extractNumber(text, PERSONAL_PATTERNS.monthlyRent),
      residenceOwnership: hasPattern(text, [/own\s*house|owned|self[- ]?owned/i]) ? "Owned" : 
                          hasPattern(text, [/rent(ed|al)/i]) ? "Rented" : null,
    },
    business: {
      businessName: matchPattern(text, BUSINESS_PATTERNS.businessName),
      natureOfBusiness: matchPattern(text, BUSINESS_PATTERNS.natureOfBusiness),
      existenceYears: extractNumber(text, BUSINESS_PATTERNS.existence),
      licenses: hasPattern(text, BUSINESS_PATTERNS.licenses) ? ["found"] : [],
      experience: matchPattern(text, BUSINESS_PATTERNS.experience),
      vision: matchPattern(text, BUSINESS_PATTERNS.vision),
      employeeCount: extractNumber(text, BUSINESS_PATTERNS.employees),
      monthlyTurnover: extractNumber(text, BUSINESS_PATTERNS.turnover),
      clientList: hasPattern(text, BUSINESS_PATTERNS.clients) ? ["found"] : [],
      activityObserved: hasPattern(text, BUSINESS_PATTERNS.activity),
      monthlyIncome: extractNumber(text, BUSINESS_PATTERNS.income),
      seasonality: matchPattern(text, BUSINESS_PATTERNS.seasonality),
      infrastructure: matchPattern(text, BUSINESS_PATTERNS.infrastructure),
      businessType,
      mfgDetails: {
        rawMaterial: hasPattern(text, [/raw\s*material|sourcing|procurement/i]),
        processFlow: hasPattern(text, [/process\s*flow|production\s*process/i]),
        capacity: hasPattern(text, [/capacity|utiliz/i]),
        machinery: hasPattern(text, [/machine|equipment|automation/i]),
        inventory: hasPattern(text, [/inventory|stock|fifo|lifo/i]),
        qualityControl: hasPattern(text, [/quality\s*control|qa|qc|iso/i]),
      },
      tradingDetails: {
        productRange: hasPattern(text, [/product\s*range|variety|assortment/i]),
        purchaseCycle: hasPattern(text, [/purchase.*cycle|sales.*cycle|credit\s*period/i]),
        warehouse: hasPattern(text, [/warehouse|godown|stock.*seen/i]),
      },
      serviceDetails: {
        documentation: hasPattern(text, [/document|record|maintain/i]),
        technology: hasPattern(text, [/technology|software|system|it\s*infra/i]),
        contracts: hasPattern(text, [/contract|agreement|client.*list/i]),
        contractBased: hasPattern(text, [/contract\s*based|retainer|project\s*based/i]),
      },
    },
    banking: {
      bankerName: matchPattern(text, BANKING_PATTERNS.bankerName),
      turnoverCreditedPercent: extractNumber(text, BANKING_PATTERNS.turnoverCredited),
      bankingTenure: matchPattern(text, BANKING_PATTERNS.tenure),
      emisRouted: hasPattern(text, BANKING_PATTERNS.emisRouted),
      qrCodeSpotted: hasPattern(text, BANKING_PATTERNS.qrCode),
    },
    networth: {
      propertiesOwned: hasPattern(text, NETWORTH_PATTERNS.properties) ? ["found"] : [],
      vehiclesOwned: hasPattern(text, NETWORTH_PATTERNS.vehicles) ? ["found"] : [],
      investments: hasPattern(text, NETWORTH_PATTERNS.investments) ? ["found"] : [],
      businessPlaceOwned: hasPattern(text, NETWORTH_PATTERNS.businessPlace),
      totalNetworth: extractNumber(text, NETWORTH_PATTERNS.totalNetworth),
    },
    debt: {
      hasLoans: hasPattern(text, DEBT_PATTERNS.hasLoans),
      loanList: hasPattern(text, DEBT_PATTERNS.loanList) ? ["found"] : [],
      canServiceNewLoan: hasPattern(text, DEBT_PATTERNS.serviceability),
      repaymentHistory: matchPattern(text, DEBT_PATTERNS.repaymentHistory),
      loanSources: hasPattern(text, DEBT_PATTERNS.loanSource) ? ["found"] : [],
    },
    endUse: {
      agreementValue: extractNumber(text, ENDUSE_PATTERNS.agreementValue),
      advancePaid: extractNumber(text, ENDUSE_PATTERNS.advancePaid),
      willOccupy: hasPattern(text, ENDUSE_PATTERNS.willOccupy),
      mortgageUse: matchPattern(text, ENDUSE_PATTERNS.mortgageUse),
      additionalInfo: matchPattern(text, ENDUSE_PATTERNS.additionalInfo),
    },
    references: {
      personalRefs: hasPattern(text, REFERENCE_PATTERNS.personalRef) ? ["found"] : [],
      businessRefs: hasPattern(text, REFERENCE_PATTERNS.businessRef) ? ["found"] : [],
      invoicesVerified: hasPattern(text, REFERENCE_PATTERNS.invoices),
    },
  };
}

const RUBRIC = {
  personal: {
    selfEducation: 1.5,
    spouseName: 1.5,
    spouseEducation: 1.5,
    spouseEmployment: 1.5,
    kidsMentioned: 1.5,
    kidsEducation: 1.5,
    kidsSchool: 1.5,
    residenceVintage: 1.5,
    monthlyRent: 1.5,
    residenceOwnership: 1.5,
  },
  businessCore: {
    businessName: 2,
    natureOfBusiness: 2,
    existence: 2,
    licenses: 2,
    experience: 2,
    vision: 2,
    employees: 2,
    turnover: 2,
    clients: 2,
    activity: 2,
    income: 2,
    seasonality: 1,
    infrastructure: 1,
  },
  businessMfg: { rawMaterial: 1, processFlow: 1, capacity: 1, machinery: 1, inventory: 1, qualityControl: 1 },
  businessTrading: { productRange: 2, purchaseCycle: 2, warehouse: 2 },
  businessService: { documentation: 1.5, technology: 1.5, contracts: 1.5, contractBased: 1.5 },
  banking: {
    bankerName: 3,
    turnoverCredited: 3,
    tenure: 3,
    emisRouted: 3,
    qrCode: 3,
  },
  networth: {
    properties: 2,
    vehicles: 2,
    investments: 2,
    businessPlace: 2,
    totalNetworth: 2,
  },
  debt: {
    hasLoans: 2,
    loanList: 2,
    serviceability: 2,
    repaymentHistory: 2,
    loanSources: 2,
  },
  endUse: {
    agreementValue: 2,
    advancePaid: 2,
    willOccupy: 2,
    mortgageUse: 2,
    additionalInfo: 2,
  },
  references: {
    personalRef: 3.33,
    businessRef: 3.33,
    invoices: 3.34,
  },
};

function scoreSection(data: Record<string, unknown>, rubric: Record<string, number>, max: number): number {
  let score = 0;
  for (const [key, weight] of Object.entries(rubric)) {
    const val = data[key];
    const present =
      typeof val === "boolean" ? val :
      typeof val === "number" ? val !== 0 && !Number.isNaN(val) :
      typeof val === "string" ? val.trim().length > 0 :
      Array.isArray(val) ? val.length > 0 :
      !!val;
    if (present) score += weight;
  }
  return Math.min(Math.round(score * 100) / 100, max);
}

function scoreBooleanSection(matches: Record<string, boolean>, rubric: Record<string, number>, max: number): number {
  let score = 0;
  for (const [key, weight] of Object.entries(rubric)) {
    if (matches[key] === true) {
      score += weight;
    }
  }
  return Math.min(Math.round(score * 100) / 100, max);
}

export function scoreComprehensiveRuleBased(pdfText: string, leadId: string): ComprehensiveScoreResult {
  console.log(`[Rule Scoring - ${leadId}] Starting rule-based scoring, text length: ${pdfText.length}`);
  
  const fields = extractFields(pdfText);
  console.log(`[Rule Scoring - ${leadId}] Extracted fields:`, JSON.stringify(fields, null, 2).substring(0, 1000));

  // Build boolean match objects FIRST - these drive both scoring and UI
  const personalMatches = {
    selfEducation: !!fields.personal.selfEducation,
    spouseName: !!fields.personal.spouseName,
    spouseEducation: !!fields.personal.spouseEducation,
    spouseEmployment: !!fields.personal.spouseEmployment,
    kidsMentioned: fields.personal.kidsMentioned,
    kidsEducation: !!fields.personal.kidsEducation,
    kidsSchool: !!fields.personal.kidsSchool,
    residenceVintage: !!fields.personal.residenceVintage,
    monthlyRent: fields.personal.monthlyRent !== null,
    residenceOwnership: !!fields.personal.residenceOwnership,
  };
  const personalScore = scoreBooleanSection(personalMatches, RUBRIC.personal, 15);

  const businessCoreMatches = {
    businessName: !!fields.business.businessName,
    natureOfBusiness: !!fields.business.natureOfBusiness,
    existence: fields.business.existenceYears !== null,
    licenses: fields.business.licenses.length > 0,
    experience: !!fields.business.experience,
    vision: !!fields.business.vision,
    employees: fields.business.employeeCount !== null,
    turnover: fields.business.monthlyTurnover !== null,
    clients: fields.business.clientList.length > 0,
    activity: fields.business.activityObserved,
    income: fields.business.monthlyIncome !== null,
    seasonality: !!fields.business.seasonality,
    infrastructure: !!fields.business.infrastructure,
  };
  let businessScore = scoreBooleanSection(businessCoreMatches, RUBRIC.businessCore, 24);

  const mfgMatches = {
    rawMaterial: fields.business.mfgDetails.rawMaterial,
    processFlow: fields.business.mfgDetails.processFlow,
    capacity: fields.business.mfgDetails.capacity,
    machinery: fields.business.mfgDetails.machinery,
    inventory: fields.business.mfgDetails.inventory,
    qualityControl: fields.business.mfgDetails.qualityControl,
  };
  const tradingMatches = {
    productRange: fields.business.tradingDetails.productRange,
    purchaseCycle: fields.business.tradingDetails.purchaseCycle,
    warehouse: fields.business.tradingDetails.warehouse,
  };
  const serviceMatches = {
    documentation: fields.business.serviceDetails.documentation,
    technology: fields.business.serviceDetails.technology,
    contracts: fields.business.serviceDetails.contracts,
    contractBased: fields.business.serviceDetails.contractBased,
  };

  if (fields.business.businessType === "manufacturing") {
    businessScore += scoreBooleanSection(mfgMatches, RUBRIC.businessMfg, 6);
  } else if (fields.business.businessType === "trading") {
    businessScore += scoreBooleanSection(tradingMatches, RUBRIC.businessTrading, 6);
  } else if (fields.business.businessType === "service") {
    businessScore += scoreBooleanSection(serviceMatches, RUBRIC.businessService, 6);
  }
  businessScore = Math.min(businessScore, 30);

  const bankingMatches = {
    bankerName: !!fields.banking.bankerName,
    turnoverCredited: fields.banking.turnoverCreditedPercent !== null,
    tenure: !!fields.banking.bankingTenure,
    emisRouted: fields.banking.emisRouted,
    qrCode: fields.banking.qrCodeSpotted,
  };
  const bankingScore = scoreBooleanSection(bankingMatches, RUBRIC.banking, 15);

  const networthMatches = {
    properties: fields.networth.propertiesOwned.length > 0,
    vehicles: fields.networth.vehiclesOwned.length > 0,
    investments: fields.networth.investments.length > 0,
    businessPlace: fields.networth.businessPlaceOwned,
    totalNetworth: fields.networth.totalNetworth !== null,
  };
  const networthScore = scoreBooleanSection(networthMatches, RUBRIC.networth, 10);

  const debtMatches = {
    hasLoans: fields.debt.hasLoans,
    loanList: fields.debt.loanList.length > 0,
    serviceability: fields.debt.canServiceNewLoan,
    repaymentHistory: !!fields.debt.repaymentHistory,
    loanSources: fields.debt.loanSources.length > 0,
  };
  const debtScore = scoreBooleanSection(debtMatches, RUBRIC.debt, 10);

  const endUseMatches = {
    agreementValue: fields.endUse.agreementValue !== null,
    advancePaid: fields.endUse.advancePaid !== null,
    willOccupy: fields.endUse.willOccupy,
    mortgageUse: !!fields.endUse.mortgageUse,
    additionalInfo: !!fields.endUse.additionalInfo,
  };
  const endUseScore = scoreBooleanSection(endUseMatches, RUBRIC.endUse, 10);

  const referenceMatchesLocal = {
    personalRef: fields.references.personalRefs.length > 0,
    businessRef: fields.references.businessRefs.length > 0,
    invoices: fields.references.invoicesVerified,
  };
  const referenceScore = scoreBooleanSection(referenceMatchesLocal, RUBRIC.references, 10);

  const rationale = `Rule-based scoring completed. Total: ${personalScore + businessScore + bankingScore + networthScore + debtScore + endUseScore + referenceScore}/100. ` +
    `Personal: ${personalScore}/15, Business: ${businessScore}/30, Banking: ${bankingScore}/15, ` +
    `Networth: ${networthScore}/10, Debt: ${debtScore}/10, EndUse: ${endUseScore}/10, References: ${referenceScore}/10.`;

  console.log(`[Rule Scoring - ${leadId}] ${rationale}`);

  return {
    personal: personalScore,
    business: businessScore,
    banking: bankingScore,
    networth: networthScore,
    existingDebt: debtScore,
    endUse: endUseScore,
    referenceChecks: referenceScore,
    personalMatches: {
      selfEducation: !!fields.personal.selfEducation,
      spouseName: !!fields.personal.spouseName,
      spouseEducation: !!fields.personal.spouseEducation,
      spouseEmployment: !!fields.personal.spouseEmployment,
      mentionAboutKids: fields.personal.kidsMentioned,
      kidsEducation: !!fields.personal.kidsEducation,
      kidsSchool: !!fields.personal.kidsSchool,
      residenceVintage: !!fields.personal.residenceVintage,
      monthlyRentIfRented: fields.personal.monthlyRent !== null,
      residenceOwnedOrRented: !!fields.personal.residenceOwnership,
    },
    businessMatches: {
      businessName: !!fields.business.businessName,
      natureOfBusiness: !!fields.business.natureOfBusiness,
      existenceCurrentPlace: fields.business.existenceYears !== null,
      licensesRegistrations: fields.business.licenses.length > 0,
      promoterExperienceQualifications: !!fields.business.experience,
      strategicVisionClarity: !!fields.business.vision,
      employeesSeen: fields.business.employeeCount !== null,
      monthlyTurnover: fields.business.monthlyTurnover !== null,
      clientListConcentrationRisk: fields.business.clientList.length > 0,
      activityDuringVisit: fields.business.activityObserved,
      monthlyIncome: fields.business.monthlyIncome !== null,
      seasonality: !!fields.business.seasonality,
      infraSupportsTurnover: !!fields.business.infrastructure,
      mfgRawMaterialSourcingStorage: fields.business.mfgDetails.rawMaterial,
      mfgProcessFlow: fields.business.mfgDetails.processFlow,
      mfgCapacityVsUtilization: fields.business.mfgDetails.capacity,
      mfgMachineryMakeAutomationMaintenance: fields.business.mfgDetails.machinery,
      mfgInventoryFifoAging: fields.business.mfgDetails.inventory,
      mfgQualityControl: fields.business.mfgDetails.qualityControl,
      tradingProductRangeInventoryMovement: fields.business.tradingDetails.productRange,
      tradingPurchaseSalesCycle: fields.business.tradingDetails.purchaseCycle,
      tradingWarehouseStockSeen: fields.business.tradingDetails.warehouse,
      svcDocumentationOfDelivery: fields.business.serviceDetails.documentation,
      svcTechnologySystems: fields.business.serviceDetails.technology,
      svcClientListContractsRevenueModel: fields.business.serviceDetails.contracts,
      svcContractBasedOrWalkin: fields.business.serviceDetails.contractBased,
    },
    bankingMatches: {
      primaryBankerName: !!fields.banking.bankerName,
      turnoverCreditedPercent: fields.banking.turnoverCreditedPercent !== null,
      bankingTenure: !!fields.banking.bankingTenure,
      emisRoutedBank: fields.banking.emisRouted,
      qrCodeSpotted: fields.banking.qrCodeSpotted,
    },
    networthMatches: {
      propertiesOwned: fields.networth.propertiesOwned.length > 0,
      vehiclesOwned: fields.networth.vehiclesOwned.length > 0,
      otherInvestments: fields.networth.investments.length > 0,
      businessPlaceOwned: fields.networth.businessPlaceOwned,
      totalNetworthAvailable: fields.networth.totalNetworth !== null,
    },
    debtMatches: {
      hasExistingLoans: fields.debt.hasLoans,
      loanListAvailable: fields.debt.loanList.length > 0,
      canServiceNewLoan: fields.debt.canServiceNewLoan,
      repaymentHistoryQuality: !!fields.debt.repaymentHistory,
      loansSourceBankNature: fields.debt.loanSources.length > 0,
    },
    endUseMatches: {
      agreementValueAvailable: fields.endUse.agreementValue !== null,
      advancePaidCashOrBankAmount: fields.endUse.advancePaid !== null,
      willOccupyPostPurchase: fields.endUse.willOccupy,
      mortgageFundsUse: !!fields.endUse.mortgageUse,
      additionalUseInformation: !!fields.endUse.additionalInfo,
    },
    referenceMatches: {
      personalRefNeighbours: fields.references.personalRefs.length > 0,
      businessRefBuyersSellers: fields.references.businessRefs.length > 0,
      invoiceVerification: fields.references.invoicesVerified,
    },
    rationale,
  };
}
