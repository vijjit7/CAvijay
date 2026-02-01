# Scoring Coverage Matrix

## Rubric Parameters vs Extracted Values

This matrix shows how each scoring rubric item maps to its data source field from the draft report.

---

## Section 1: Personal (Max 15 pts)
| # | Rubric Parameter | Weight | Data Source Field | Extraction Logic |
|---|-----------------|--------|-------------------|------------------|
| 1 | Self Education | 1.5 | `personalDetails.selfEducation` | Has non-empty value |
| 2 | Spouse Name | 1.5 | `primaryApplicant.spouseName` OR `personalDetails.spouseName` | Has non-empty value |
| 3 | Spouse Education | 1.5 | `personalDetails.spouseEducation` | Has non-empty value |
| 4 | Spouse Employment | 1.5 | `personalDetails.spouseEmployment` | Has non-empty value |
| 5 | Mention About Kids | 1.5 | `personalDetails.dependents` | Count > 0 |
| 6 | Kids Education | 1.5 | `personalDetails.kidsEducation` | Has non-empty value |
| 7 | Kids School | 1.5 | `personalDetails.kidsSchool` | Has non-empty value |
| 8 | Residence Vintage | 1.5 | `personalDetails.residenceVintage` | Has non-empty value |
| 9 | Residence Owned/Rented | 1.5 | `personalDetails.residenceType` | Contains "own" OR (rented AND rent documented) |
| 10 | Monthly Rent (if rented) | 1.5 | `personalDetails.monthlyRent` | Rented AND rent amount > 0 |

**Notes:**
- Items 9 & 10 are mutually exclusive: owned properties get 1.5+1.5=3 pts automatically; rented properties need documented rent to get 3 pts

---

## Section 2: Business (Max 30 pts)
| # | Rubric Parameter | Weight | Data Source Field | Extraction Logic |
|---|-----------------|--------|-------------------|------------------|
| 1 | Business Name | 2 | `businessDetails.businessName` | Has non-empty value |
| 2 | Nature of Business | 2 | `businessDetails.majorServices` | Has non-empty value |
| 3 | Business Vintage | 2 | `businessDetails.businessVintageMonths` | Value > 0 |
| 4 | Licenses Verified | 2 | `businessDetails.businessSetup` | Contains "license" |
| 5 | Employees Verified | 2 | `businessDetails.employeeCount` | Has non-empty value |
| 6 | Monthly Turnover | 2 | `businessDetails.monthlyTurnover` | Value > 0 |
| 7 | Monthly Income | 2 | `businessDetails.netMonthlyIncome` | Value >= 50,000 |
| 8 | Activity Observed | 2 | `businessDetails.businessProfile` | Has non-empty value |
| 9 | Infrastructure Adequate | 2 | `businessDetails.surroundingArea` | Has non-empty value |
| 10 | Seasonality Mentioned | 2 | `businessDetails.seasonality` | Has non-empty value |
| 11 | Client List Available | 2 | `businessDetails.clientListConcentrationRisk` OR `businessDetails.majorClients` | Has non-empty value |
| 12 | Strategic Vision | 2 | `businessDetails.strategicVision` OR `businessDetails.growthPlans` | Has non-empty value |
| 13 | Promoter Experience | 2 | `businessDetails.promoterExperience` OR `businessDetails.yearsOfExperience` | Has non-empty value |
| 14 | Source of Business | 2 | `businessDetails.sourceOfBusiness` | Has non-empty value |
| 15 | Comfortable EMI | 2 | `businessDetails.comfortableEmi` | Has non-empty value |

**Notes:**
- Each field maps to exactly ONE data source to prevent double counting
- "Comfortable EMI" was moved from Debt section to Business section

---

## Section 3: Banking (Max 15 pts)
| # | Rubric Parameter | Weight | Data Source Field | Extraction Logic |
|---|-----------------|--------|-------------------|------------------|
| 1 | Primary Bank Name | 3 | `bankingDetails.bankName` | Has non-empty value |
| 2 | Turnover Credit % | 3 | `bankingDetails.turnoverCreditPercent` | Value >= 50% |
| 3 | Banking Tenure | 3 | `bankingDetails.bankingTenure` | Value >= 12 months |
| 4 | EMIs Routed | 3 | `bankingDetails.emisRouted` | Has non-empty value |
| 5 | QR Code Spotted | 3 | `bankingDetails.qrCodeSpotted` | Has non-empty value |

---

## Section 4: Networth (Max 10 pts)
| # | Rubric Parameter | Weight | Data Source Field | Extraction Logic |
|---|-----------------|--------|-------------------|------------------|
| 1 | Properties Owned | 2.5 | `propertyDetails.propertiesOwned` OR `propertyDetails.propertyType` | Count > 0 OR has property type |
| 2 | Vehicles Owned | 2.5 | `propertyDetails.vehiclesOwned` | Count > 0 |
| 3 | Other Investments | 2.5 | `propertyDetails.otherInvestments` | Has non-empty value |
| 4 | Business Place Owned | 2.5 | `businessDetails.businessSetup` | Contains "own" |

---

## Section 5: Existing Debt (Max 10 pts)
| # | Rubric Parameter | Weight | Data Source Field | Extraction Logic |
|---|-----------------|--------|-------------------|------------------|
| 1 | Existing Loans Documented | 2.5 | `existingLoans` | Explicitly "yes" or "no" (NOT null/unknown) |
| 2 | Loan List Available | 2.5 | `loanList` | Has non-empty value (only if loans exist) |
| 3 | Repayment Track Good | 2.5 | `repaymentHistory` | Contains "good"/"excellent"/"regular" (only if loans exist) |
| 4 | Loans Source/Bank | 2.5 | `repaymentHistory` | Has valid repayment track (only if loans exist) |

**Notes:**
- Items 2, 3, 4 only score when existingLoans = true (has loans)
- Item 1 scores when status is explicitly documented (yes OR no), NOT when unknown/missing
- "Can Service New Loan" moved to Business section as "Comfortable EMI"

---

## Section 6: End Use (Max 10 pts)
| # | Rubric Parameter | Weight | Data Source Field | Extraction Logic |
|---|-----------------|--------|-------------------|------------------|
| 1 | Purpose of Loan | 3 | `endUseDetails.purposeOfLoan` | Has non-empty value |
| 2 | Agreement Value | 3 | `endUseDetails.agreementValue` | Value > 0 |
| 3 | Will Occupy/Self Use | 4 | `endUseDetails.endUse` | Contains "self" |

---

## Section 7: Reference Checks (Max 10 pts)
| # | Rubric Parameter | Weight | Data Source Field | Extraction Logic |
|---|-----------------|--------|-------------------|------------------|
| 1 | Personal Reference Check | 4 | `referenceChecks.reference1.feedback` | Has value AND not "Pending" |
| 2 | Business Reference Check | 3 | `referenceChecks.reference2.feedback` | Has value AND not "Pending" |
| 3 | Invoice Verified | 3 | `referenceChecks.invoiceVerified` | Has non-empty value |

---

## Summary Table

| Section | Max Points | Items | Weight per Item |
|---------|-----------|-------|-----------------|
| Personal | 15 | 10 | 1.5 each |
| Business | 30 | 15 | 2 each |
| Banking | 15 | 5 | 3 each |
| Networth | 10 | 4 | 2.5 each |
| Existing Debt | 10 | 4 | 2.5 each |
| End Use | 10 | 3 | 3, 3, 4 |
| Reference Checks | 10 | 3 | 4, 3, 3 |
| **TOTAL** | **100** | **44** | - |

---

## Key Principles

1. **No Double Counting**: Each rubric item maps to exactly one unique data source
2. **Explicit Documentation Required**: Missing/unknown values don't award points
3. **Deterministic**: Same input always produces the same score
4. **Mutual Exclusivity**: Some items are mutually exclusive (e.g., owned vs rented)

---

## Form Fields Required for 100% Score

To achieve a perfect 100-point score, the following fields MUST be populated:

### Personal Details (10 fields)
- `selfEducation`, `spouseName`, `spouseEducation`, `spouseEmployment`
- `dependents` (count), `kidsEducation`, `kidsSchool`
- `residenceVintage`, `residenceType` (owned OR rented with `monthlyRent`)

### Business Details (15 fields)
- `businessName`, `majorServices`, `businessVintageMonths`, `businessSetup` (with "license")
- `employeeCount`, `monthlyTurnover`, `netMonthlyIncome` (>=50000)
- `businessProfile`, `surroundingArea`, `seasonality`
- `clientListConcentrationRisk` OR `majorClients`
- `strategicVision` OR `growthPlans`
- `promoterExperience` OR `yearsOfExperience`
- `sourceOfBusiness`, `comfortableEmi`

### Banking Details (5 fields)
- `bankName`, `turnoverCreditPercent` (>=50), `bankingTenure` (>=12)
- `emisRouted`, `qrCodeSpotted`

### Property Details (4 fields)
- `propertiesOwned` OR `propertyType`, `vehiclesOwned`, `otherInvestments`
- `businessSetup` containing "own" (for businessPlaceOwned)

### Debt Fields (4 fields)
- `existingLoans` (explicit yes/no)
- If loans exist: `loanList`, `repaymentHistory` (good/excellent)

### End Use Details (3 fields)
- `purposeOfLoan`, `agreementValue`, `endUse` (containing "self")

### Reference Checks (3 fields)
- `reference1.feedback` (not "Pending")
- `reference2.feedback` (not "Pending")
- `invoiceVerified`
