import type { ApplicantSchema, ComprehensiveBreakdown, PersonalMatches, BusinessMatches, BankingMatches, NetworthMatches, DebtMatches, EndUseMatches, ReferenceMatches } from "@shared/schema";

// Excel rubric weights - EXACT values from the scoring model
const WEIGHTS = {
  personal: {
    max: 15,
    residenceVintage: 1.5,
    residenceOwned: 1.5,
    spouseName: 1.5,
    spouseEducation: 1.5,
    spouseEmployment: 1.5,
    mentionAboutKids: 1.5,
    kidsEducation: 1.5,
    kidsSchool: 1.5,
    selfEducation: 1.5,
    monthlyRent: 1.5,
  },
  business: {
    max: 30,
    businessName: 2,
    natureOfBusiness: 2,
    businessVintage: 2,
    licensesVerified: 2,
    employeesVerified: 2,
    monthlyTurnover: 2,
    monthlyIncome: 2,
    activityObserved: 2,
    infrastructureAdequate: 2,
    seasonalityMentioned: 2,
    clientListAvailable: 2,
    strategicVision: 2,
    promoterExperience: 2,
    sourceOfBusiness: 2,
    comfortableEmi: 2,
  },
  banking: {
    max: 15,
    primaryBank: 3,
    turnoverCreditPercent: 3,
    bankingTenure: 3,
    emisRouted: 3,
    qrCodeSpotted: 3,
  },
  networth: {
    max: 10,
    perItem: 2.5,
  },
  debt: {
    max: 10,
    existingLoans: 2.5,
    loanListAvailable: 2.5,
    repaymentTrack: 2.5,
    loansSourceBank: 2.5,
    // canServiceNewLoan moved to business as comfortableEmi to avoid double counting
  },
  endUse: {
    max: 10,
    purposeOfLoan: 3,
    agreementValue: 3,
    willOccupy: 4,
  },
  references: {
    max: 10,
    personalCheck: 4,
    businessCheck: 3,
    invoiceVerified: 3,
  },
};

export interface ScoringResult {
  scores: {
    personal: number;
    business: number;
    banking: number;
    networth: number;
    existingDebt: number;
    endUse: number;
    referenceChecks: number;
    total: number;
  };
  breakdown: ComprehensiveBreakdown;
  warnings: string[];
}

export function mapDraftToApplicant(draft: any): ApplicantSchema {
  const pa = draft.primaryApplicant || {};
  const pers = draft.personalDetails || {};
  const bus = draft.businessDetails || {};
  const prop = draft.propertyDetails || {};
  const end = draft.endUseDetails || {};
  const ref = draft.referenceChecks || {};
  const bank = draft.bankingDetails || {};

  const parseNumber = (val: any): number => {
    if (!val || val === 'N/A' || val === 'Not Available') return 0;
    const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const parseExistingLoans = (val: any): boolean | null => {
    if (val === true) return true;
    if (val === false) return false;
    if (!val || val === 'N/A' || val === 'Not Available' || val === 'unknown') return null; // Missing/unknown
    const lower = String(val).toLowerCase().trim();
    if (lower === 'no' || lower === 'none' || lower === 'nil' || lower === 'false') return false; // Explicit no
    if (lower === 'yes' || lower === 'true') return true; // Explicit yes
    return null; // Anything else is undocumented
  };

  const parseRepaymentTrack = (val: any): string => {
    if (!val || val === 'N/A' || val === 'Not Available' || val === 'unknown') return '';
    const lower = String(val).toLowerCase().trim();
    if (lower.includes('good') || lower.includes('excellent') || lower.includes('regular')) return 'good';
    if (lower.includes('poor') || lower.includes('bad') || lower.includes('irregular')) return 'poor';
    return '';
  };

  const isOwned = (type: string): boolean => {
    const lower = (type || '').toLowerCase();
    return lower.includes('own') || lower.includes('self') || lower === 'owned';
  };

  const hasValue = (val: any): boolean => {
    return val && val !== 'N/A' && val !== 'Not Available' && val !== 'NA' && String(val).trim() !== '';
  };

  return {
    personal: {
      residenceVintage: pers.residenceVintage || draft.personalDetails?.residenceVintage || '',
      residenceOwned: isOwned(pers.residenceType || draft.personalDetails?.residenceType),
      spouseName: pa.spouseName || pers.spouseName || draft.primaryApplicant?.spouseName || draft.personalDetails?.spouseName,
      kidsCount: parseNumber(pers.dependents || draft.personalDetails?.dependents),
      selfEducation: pers.selfEducation || draft.personalDetails?.selfEducation,
      spouseEducation: pers.spouseEducation || draft.personalDetails?.spouseEducation,
      spouseEmployment: pers.spouseEmployment || draft.personalDetails?.spouseEmployment,
      kidsEducation: pers.kidsEducation || draft.personalDetails?.kidsEducation,
      kidsSchool: pers.kidsSchool || draft.personalDetails?.kidsSchool,
      monthlyRent: parseNumber(pers.monthlyRent || draft.personalDetails?.monthlyRent),
    },
    business: {
      name: bus.businessName || draft.businessDetails?.businessName || '',
      nature: bus.majorServices || draft.businessDetails?.majorServices || '',
      monthlyIncome: parseNumber(bus.netMonthlyIncome || draft.businessDetails?.netMonthlyIncome),
      licensesVerified: hasValue(bus.businessSetup) && bus.businessSetup.toLowerCase().includes('license'),
      businessVintage: parseNumber(bus.businessVintageMonths || draft.businessDetails?.businessVintageMonths),
      employeesVerified: hasValue(bus.employeeCount) || hasValue(draft.businessDetails?.employeeCount),
      monthlyTurnover: parseNumber(bus.monthlyTurnover || draft.businessDetails?.monthlyTurnover),
      activityObserved: hasValue(bus.businessProfile) || hasValue(draft.businessDetails?.businessProfile),
      infrastructureAdequate: hasValue(bus.surroundingArea) || hasValue(draft.businessDetails?.surroundingArea),
      seasonalityMentioned: hasValue(bus.seasonality) || hasValue(draft.businessDetails?.seasonality),
      clientListAvailable: hasValue(bus.clientListConcentrationRisk) || hasValue(draft.businessDetails?.clientListConcentrationRisk) || hasValue(bus.majorClients) || hasValue(draft.businessDetails?.majorClients),
      sourceOfBusiness: hasValue(bus.sourceOfBusiness) || hasValue(draft.businessDetails?.sourceOfBusiness),
      strategicVision: hasValue(bus.strategicVision) || hasValue(draft.businessDetails?.strategicVision) || hasValue(bus.growthPlans) || hasValue(draft.businessDetails?.growthPlans),
      promoterExperience: hasValue(bus.promoterExperience) || hasValue(draft.businessDetails?.promoterExperience) || hasValue(bus.yearsOfExperience),
    },
    networth: {
      propertiesOwned: parseNumber(prop.propertiesOwned) || parseNumber(draft.propertyDetails?.propertiesOwned) || (hasValue(prop.propertyType) ? 1 : 0),
      vehiclesOwned: parseNumber(prop.vehiclesOwned) || parseNumber(draft.propertyDetails?.vehiclesOwned) || 0,
      otherInvestments: hasValue(prop.otherInvestments) || hasValue(draft.propertyDetails?.otherInvestments),
      businessPlaceOwned: isOwned(bus.businessSetup),
    },
    debt: {
      existingLoans: parseExistingLoans(draft.existingLoans || draft.debtDetails?.existingLoans),
      repaymentTrack: parseRepaymentTrack(draft.repaymentHistory || draft.debtDetails?.repaymentHistory),
      loanListAvailable: hasValue(draft.loanList) || hasValue(draft.debtDetails?.loanList),
      canServiceNewLoan: hasValue(bus.comfortableEmi) || hasValue(draft.businessDetails?.comfortableEmi),
    },
    endUse: {
      purpose: end.purposeOfLoan || draft.endUseDetails?.purposeOfLoan || '',
      agreementValue: parseNumber(end.agreementValue || draft.endUseDetails?.agreementValue),
      advancePaid: parseNumber(end.advancePaid || draft.endUseDetails?.advancePaid),
      willOccupy: hasValue(end.endUse || draft.endUseDetails?.endUse) && (end.endUse || draft.endUseDetails?.endUse || '').toLowerCase().includes('self'),
      mortgageFundsUse: end.endUse || draft.endUseDetails?.endUse,
    },
    references: {
      personalCheck: hasValue(ref.reference1?.feedback) && ref.reference1?.feedback !== 'Pending',
      businessCheck: hasValue(ref.reference2?.feedback) && ref.reference2?.feedback !== 'Pending',
      invoiceVerified: hasValue(ref.invoiceVerified) || hasValue(draft.referenceChecks?.invoiceVerified),
    },
    banking: {
      primaryBank: bank.bankName || draft.bankingDetails?.bankName || '',
      turnoverCreditPercent: parseNumber(bank.turnoverCreditPercent || draft.bankingDetails?.turnoverCreditPercent),
      bankingTenure: parseNumber(bank.bankingTenure || draft.bankingDetails?.bankingTenure),
      emisRouted: hasValue(bank.emisRouted) || hasValue(draft.bankingDetails?.emisRouted),
      qrCodeSpotted: hasValue(bank.qrCodeSpotted) || hasValue(draft.bankingDetails?.qrCodeSpotted),
    },
  };
}

export function scoreApplicant(applicant: ApplicantSchema): ScoringResult {
  const warnings: string[] = [];
  const hasValue = (val: any): boolean => {
    if (val === undefined || val === null) return false;
    if (typeof val === 'string') return val !== '' && val !== 'N/A' && val !== 'Not Available';
    if (typeof val === 'number') return val > 0;
    if (typeof val === 'boolean') return val;
    return false;
  };

  // Personal scoring (max 15)
  // 10 items at 1.5 pts each = 15 max
  // residenceOwnedOrRented: award if we know owned OR rented
  // monthlyRentIfRented: award only if rented AND rent is documented
  const isRented = !applicant.personal.residenceOwned;
  const personalMatches: PersonalMatches = {
    selfEducation: hasValue(applicant.personal.selfEducation),
    spouseName: hasValue(applicant.personal.spouseName),
    spouseEducation: hasValue(applicant.personal.spouseEducation),
    spouseEmployment: hasValue(applicant.personal.spouseEmployment),
    mentionAboutKids: (applicant.personal.kidsCount || 0) > 0,
    kidsEducation: hasValue(applicant.personal.kidsEducation),
    kidsSchool: hasValue(applicant.personal.kidsSchool),
    residenceVintage: hasValue(applicant.personal.residenceVintage) && applicant.personal.residenceVintage.length > 0,
    monthlyRentIfRented: isRented && hasValue(applicant.personal.monthlyRent),
    residenceOwnedOrRented: applicant.personal.residenceOwned || (isRented && hasValue(applicant.personal.monthlyRent)),
  };

  let personalScore = 0;
  if (personalMatches.selfEducation) personalScore += WEIGHTS.personal.selfEducation;
  if (personalMatches.spouseName) personalScore += WEIGHTS.personal.spouseName;
  if (personalMatches.spouseEducation) personalScore += WEIGHTS.personal.spouseEducation;
  if (personalMatches.spouseEmployment) personalScore += WEIGHTS.personal.spouseEmployment;
  if (personalMatches.mentionAboutKids) personalScore += WEIGHTS.personal.mentionAboutKids;
  if (personalMatches.kidsEducation) personalScore += WEIGHTS.personal.kidsEducation;
  if (personalMatches.kidsSchool) personalScore += WEIGHTS.personal.kidsSchool;
  if (personalMatches.residenceVintage) personalScore += WEIGHTS.personal.residenceVintage;
  // Mutually exclusive: owned OR rented with documented rent
  if (applicant.personal.residenceOwned) {
    personalScore += WEIGHTS.personal.residenceOwned;  // 1.5 for owned
  } else if (personalMatches.monthlyRentIfRented) {
    personalScore += WEIGHTS.personal.monthlyRent;     // 1.5 for rent documented
  }
  if (personalMatches.residenceOwnedOrRented) personalScore += 1.5; // Extra 1.5 for clarity on status
  personalScore = Math.min(personalScore, WEIGHTS.personal.max);

  // Business scoring (max 30)
  // Each field maps to DISTINCT data sources to prevent double counting
  const businessMatches: BusinessMatches = {
    businessName: hasValue(applicant.business.name),
    natureOfBusiness: hasValue(applicant.business.nature),
    existenceCurrentPlace: hasValue(applicant.business.businessVintage) && applicant.business.businessVintage! > 0,
    licensesRegistrations: applicant.business.licensesVerified,
    promoterExperienceQualifications: applicant.business.promoterExperience || false, // From promoterExperience field
    strategicVisionClarity: applicant.business.strategicVision || false, // From strategicVision field
    employeesSeen: applicant.business.employeesVerified || false,
    monthlyTurnover: hasValue(applicant.business.monthlyTurnover) && applicant.business.monthlyTurnover! > 0,
    clientListConcentrationRisk: applicant.business.clientListAvailable || false,
    activityDuringVisit: applicant.business.activityObserved || false,
    monthlyIncome: hasValue(applicant.business.monthlyIncome) && applicant.business.monthlyIncome >= 50000,
    seasonality: applicant.business.seasonalityMentioned || false,
    infraSupportsTurnover: applicant.business.infrastructureAdequate || false,
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
  };

  let businessScore = 0;
  if (businessMatches.businessName) businessScore += WEIGHTS.business.businessName;
  if (businessMatches.natureOfBusiness) businessScore += WEIGHTS.business.natureOfBusiness;
  if (businessMatches.existenceCurrentPlace) businessScore += WEIGHTS.business.businessVintage;
  if (businessMatches.licensesRegistrations) businessScore += WEIGHTS.business.licensesVerified;
  if (businessMatches.promoterExperienceQualifications) businessScore += WEIGHTS.business.promoterExperience;
  if (businessMatches.strategicVisionClarity) businessScore += WEIGHTS.business.strategicVision;
  if (businessMatches.employeesSeen) businessScore += WEIGHTS.business.employeesVerified;
  if (businessMatches.monthlyTurnover) businessScore += WEIGHTS.business.monthlyTurnover;
  if (businessMatches.clientListConcentrationRisk) businessScore += WEIGHTS.business.clientListAvailable;
  if (businessMatches.activityDuringVisit) businessScore += WEIGHTS.business.activityObserved;
  if (businessMatches.monthlyIncome) businessScore += WEIGHTS.business.monthlyIncome;
  if (businessMatches.seasonality) businessScore += WEIGHTS.business.seasonalityMentioned;
  if (businessMatches.infraSupportsTurnover) businessScore += WEIGHTS.business.infrastructureAdequate;
  // sourceOfBusiness: 2pts if source of business is documented (separate from client list)
  if (applicant.business.sourceOfBusiness) businessScore += WEIGHTS.business.sourceOfBusiness;
  // comfortableEmi: 2pts if EMI capacity is documented (separate from debt scoring)
  if (applicant.debt.canServiceNewLoan) businessScore += WEIGHTS.business.comfortableEmi;
  businessScore = Math.min(businessScore, WEIGHTS.business.max);

  // Banking scoring (max 15)
  const bankingMatches: BankingMatches = {
    primaryBankerName: hasValue(applicant.banking.primaryBank),
    turnoverCreditedPercent: applicant.banking.turnoverCreditPercent >= 50,
    bankingTenure: hasValue(applicant.banking.bankingTenure) && applicant.banking.bankingTenure! >= 12,
    emisRoutedBank: applicant.banking.emisRouted || false,
    qrCodeSpotted: applicant.banking.qrCodeSpotted || false,
  };

  let bankingScore = 0;
  if (bankingMatches.primaryBankerName) bankingScore += WEIGHTS.banking.primaryBank;
  if (bankingMatches.turnoverCreditedPercent) bankingScore += WEIGHTS.banking.turnoverCreditPercent;
  if (bankingMatches.bankingTenure) bankingScore += WEIGHTS.banking.bankingTenure;
  if (bankingMatches.emisRoutedBank) bankingScore += WEIGHTS.banking.emisRouted;
  if (bankingMatches.qrCodeSpotted) bankingScore += WEIGHTS.banking.qrCodeSpotted;
  bankingScore = Math.min(bankingScore, WEIGHTS.banking.max);

  // Networth scoring (max 10, 2.5 per item)
  const networthMatches: NetworthMatches = {
    propertiesOwned: applicant.networth.propertiesOwned > 0,
    vehiclesOwned: applicant.networth.vehiclesOwned > 0,
    otherInvestments: applicant.networth.otherInvestments || false,
    businessPlaceOwned: applicant.networth.businessPlaceOwned || false,
    totalNetworthAvailable: applicant.networth.propertiesOwned > 0 || applicant.networth.vehiclesOwned > 0,
  };

  let networthScore = 0;
  const networthItems = [
    networthMatches.propertiesOwned,
    networthMatches.vehiclesOwned,
    networthMatches.otherInvestments,
    networthMatches.businessPlaceOwned,
  ].filter(Boolean).length;
  networthScore = networthItems * WEIGHTS.networth.perItem;
  networthScore = Math.min(networthScore, WEIGHTS.networth.max);

  // Debt scoring (max 10)
  // existingLoans: null=undocumented, true=has loans, false=no loans
  // Points awarded only for EXPLICIT documentation (not null)
  // repaymentTrack must be non-empty (parsed to 'good' or 'poor', not 'unknown' or '')
  // Note: canServiceNewLoan (comfortableEmi) is scored in Business section, not here
  const hasDocumentedLoans = applicant.debt.existingLoans === true;
  const loansExplicitlyNone = applicant.debt.existingLoans === false;
  const loanStatusDocumented = applicant.debt.existingLoans !== null; // Explicit yes or no
  const hasValidRepaymentTrack = applicant.debt.repaymentTrack !== '' && applicant.debt.repaymentTrack !== 'unknown';
  const debtMatches: DebtMatches = {
    hasExistingLoans: loanStatusDocumented, // True only if explicitly documented (yes or no)
    loanListAvailable: hasDocumentedLoans && (applicant.debt.loanListAvailable || false),
    canServiceNewLoan: applicant.debt.canServiceNewLoan || false, // Tracked but scored in Business
    repaymentHistoryQuality: hasDocumentedLoans && hasValidRepaymentTrack && applicant.debt.repaymentTrack === 'good',
    loansSourceBankNature: hasDocumentedLoans && hasValidRepaymentTrack,
  };

  let debtScore = 0;
  // Award 2.5 pts ONLY for explicitly documenting loan status (yes or no, NOT null)
  if (loanStatusDocumented) debtScore += WEIGHTS.debt.existingLoans;
  // Additional points only if loans exist (true) and are documented
  if (hasDocumentedLoans) {
    if (debtMatches.loanListAvailable) debtScore += WEIGHTS.debt.loanListAvailable;
    if (debtMatches.repaymentHistoryQuality) debtScore += WEIGHTS.debt.repaymentTrack;
    if (debtMatches.loansSourceBankNature) debtScore += WEIGHTS.debt.loansSourceBank;
  }
  // canServiceNewLoan scored in Business section as comfortableEmi - NOT double counted here
  debtScore = Math.min(debtScore, WEIGHTS.debt.max);

  // End Use scoring (max 10)
  const endUseMatches: EndUseMatches = {
    agreementValueAvailable: hasValue(applicant.endUse.agreementValue) && applicant.endUse.agreementValue! > 0,
    advancePaidCashOrBankAmount: hasValue(applicant.endUse.advancePaid) && applicant.endUse.advancePaid! > 0,
    willOccupyPostPurchase: applicant.endUse.willOccupy || false,
    mortgageFundsUse: hasValue(applicant.endUse.mortgageFundsUse),
    additionalUseInformation: hasValue(applicant.endUse.purpose),
  };

  let endUseScore = 0;
  if (endUseMatches.additionalUseInformation) endUseScore += WEIGHTS.endUse.purposeOfLoan;
  if (endUseMatches.agreementValueAvailable) endUseScore += WEIGHTS.endUse.agreementValue;
  if (endUseMatches.willOccupyPostPurchase) endUseScore += WEIGHTS.endUse.willOccupy;
  endUseScore = Math.min(endUseScore, WEIGHTS.endUse.max);

  // Reference scoring (max 10)
  const referenceMatches: ReferenceMatches = {
    personalRefNeighbours: applicant.references.personalCheck,
    businessRefBuyersSellers: applicant.references.businessCheck,
    invoiceVerification: applicant.references.invoiceVerified || false,
  };

  let refScore = 0;
  if (referenceMatches.personalRefNeighbours) refScore += WEIGHTS.references.personalCheck;
  if (referenceMatches.businessRefBuyersSellers) refScore += WEIGHTS.references.businessCheck;
  if (referenceMatches.invoiceVerification) refScore += WEIGHTS.references.invoiceVerified;
  refScore = Math.min(refScore, WEIGHTS.references.max);

  // Coverage warnings
  if (personalScore === 0) warnings.push('Personal details not verified');
  if (businessScore === 0) warnings.push('Business details not verified');
  if (bankingScore === 0) warnings.push('Banking details not verified');
  if (networthScore === 0) warnings.push('Networth details not verified');
  if (endUseScore === 0) warnings.push('End use purpose not verified');
  if (refScore === 0) warnings.push('Reference checks pending');

  const totalScore = personalScore + businessScore + bankingScore + networthScore + debtScore + endUseScore + refScore;

  return {
    scores: {
      personal: Math.round(personalScore * 100) / 100,
      business: Math.round(businessScore * 100) / 100,
      banking: Math.round(bankingScore * 100) / 100,
      networth: Math.round(networthScore * 100) / 100,
      existingDebt: Math.round(debtScore * 100) / 100,
      endUse: Math.round(endUseScore * 100) / 100,
      referenceChecks: Math.round(refScore * 100) / 100,
      total: Math.round(totalScore * 100) / 100,
    },
    breakdown: {
      personal: Math.round(personalScore * 100) / 100,
      business: Math.round(businessScore * 100) / 100,
      banking: Math.round(bankingScore * 100) / 100,
      networth: Math.round(networthScore * 100) / 100,
      existingDebt: Math.round(debtScore * 100) / 100,
      endUse: Math.round(endUseScore * 100) / 100,
      referenceChecks: Math.round(refScore * 100) / 100,
      personalMatches,
      businessMatches,
      bankingMatches,
      networthMatches,
      debtMatches,
      endUseMatches,
      referenceMatches,
    },
    warnings,
  };
}

export function scoreDraft(draft: any): ScoringResult {
  const applicant = mapDraftToApplicant(draft);
  console.log('[Deterministic Scoring] Mapped applicant:', JSON.stringify(applicant, null, 2));
  const result = scoreApplicant(applicant);
  console.log('[Deterministic Scoring] Scores:', result.scores);
  if (result.warnings.length > 0) {
    console.log('[Deterministic Scoring] Warnings:', result.warnings);
  }
  return result;
}
