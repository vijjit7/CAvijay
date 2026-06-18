import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ApplicantSchema for deterministic scoring
export interface ApplicantSchema {
  personal: {
    residenceVintage: string;
    residenceOwned: boolean;
    spouseName?: string;
    kidsCount?: number;
    selfEducation?: string;
    spouseEducation?: string;
    spouseEmployment?: string;
    kidsEducation?: string;
    kidsSchool?: string;
    monthlyRent?: number;
  };
  business: {
    name: string;
    nature: string;
    monthlyIncome: number;
    licensesVerified: boolean;
    businessVintage?: number;
    employeesVerified?: boolean;
    monthlyTurnover?: number;
    activityObserved?: boolean;
    infrastructureAdequate?: boolean;
    seasonalityMentioned?: boolean;
    clientListAvailable?: boolean;    // Client list/concentration risk documented
    sourceOfBusiness?: boolean;        // Source of business (referrals, walk-ins, etc.) documented
    strategicVision?: boolean;         // Strategic vision/growth plans documented
    promoterExperience?: boolean;      // Promoter experience/qualifications documented
  };
  networth: {
    propertiesOwned: number;
    vehiclesOwned: number;
    otherInvestments?: boolean;
    businessPlaceOwned?: boolean;
  };
  debt: {
    existingLoans: boolean | null;  // null = undocumented, true = has loans, false = no loans
    repaymentTrack: string;
    loanListAvailable?: boolean;
    canServiceNewLoan?: boolean;
  };
  endUse: {
    purpose: string;
    agreementValue?: number;
    advancePaid?: number;
    willOccupy?: boolean;
    mortgageFundsUse?: string;
  };
  references: {
    personalCheck: boolean;
    businessCheck: boolean;
    invoiceVerified?: boolean;
  };
  banking: {
    primaryBank: string;
    turnoverCreditPercent: number;
    bankingTenure?: number;
    emisRouted?: boolean;
    qrCodeSpotted?: boolean;
  };
}

export type ReportMetrics = {
  totalFields: number;
  filledFields: number;
  missingFields: string[];
  riskAnalysisDepth: 'High' | 'Medium' | 'Low';
  photoCount: number;
  dueDiligenceChecks: string[];
  photoValidation: {
    matchedCount: number;
    totalKeyDetails: number;
    missedDetails: string[];
  };
};

export type PersonalMatches = {
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

export type BusinessMatches = {
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

export type BankingMatches = {
  primaryBankerName: boolean;
  turnoverCreditedPercent: boolean;
  bankingTenure: boolean;
  emisRoutedBank: boolean;
  qrCodeSpotted: boolean;
};

export type NetworthMatches = {
  propertiesOwned: boolean;
  vehiclesOwned: boolean;
  otherInvestments: boolean;
  businessPlaceOwned: boolean;
  totalNetworthAvailable: boolean;
};

export type DebtMatches = {
  hasExistingLoans: boolean;
  loanListAvailable: boolean;
  canServiceNewLoan: boolean;
  repaymentHistoryQuality: boolean;
  loansSourceBankNature: boolean;
};

export type EndUseMatches = {
  agreementValueAvailable: boolean;
  advancePaidCashOrBankAmount: boolean;
  willOccupyPostPurchase: boolean;
  mortgageFundsUse: boolean;
  additionalUseInformation: boolean;
};

export type ReferenceMatches = {
  personalRefNeighbours: boolean;
  businessRefBuyersSellers: boolean;
  invoiceVerification: boolean;
};

export type ComprehensiveBreakdown = {
  personal: number;
  business: number;
  banking: number;
  networth: number;
  existingDebt: number;
  endUse: number;
  referenceChecks: number;
  personalMatches?: PersonalMatches;
  businessMatches?: BusinessMatches;
  bankingMatches?: BankingMatches;
  networthMatches?: NetworthMatches;
  debtMatches?: DebtMatches;
  endUseMatches?: EndUseMatches;
  referenceMatches?: ReferenceMatches;
};

export type ReportScores = {
  completeness: number;
  comprehensive: number;
  quality: number;
  overall: number;
  comprehensiveBreakdown?: ComprehensiveBreakdown;
};

export type ReportTAT = {
  initiationTime: string | null;
  visitTime: string | null;
  reportDate: string | null;
  initiationToVisitHours: number | null;
  visitToReportHours: number | null;
  totalTATHours: number | null;
  gmailMessageId: string | null;
};

export type ReportDecision = {
  status: 'Positive' | 'Negative' | 'Credit Refer';
  remarks: string;
  aiValidation: {
    match: boolean;
    confidence: number;
    reasoning: string;
  };
};

export const users = pgTable("users", {
  id: varchar("id", { length: 10 }).primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  avatar: text("avatar").notNull(),
});

export const reports = pgTable("reports", {
  id: varchar("id", { length: 50 }).primaryKey(),
  associateId: varchar("associate_id", { length: 10 }).notNull().references(() => users.id),
  leadId: text("lead_id").default('').notNull(),
  title: text("title").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull(),
  metrics: jsonb("metrics").$type<ReportMetrics>().notNull(),
  scores: jsonb("scores").$type<ReportScores>().notNull(),
  decision: jsonb("decision").$type<ReportDecision>().notNull(),
  remarks: jsonb("remarks").$type<string[]>().notNull(),
  summary: text("summary").notNull(),
  tat: jsonb("tat").$type<ReportTAT>(),
  tatDelayReason: text("tat_delay_reason"),
  tatDelayRemark: text("tat_delay_remark"),
  pdfContent: text("pdf_content"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

// Associate sub-types, stored in the user's `role`:
//  - Verification associates get the full AuditGuard access (reports, MIS, etc.)
//  - Office associates can only claim bills (the office-costing Bill page).
export const VERIFICATION_ASSOCIATE_ROLE = 'Verification Officer';
export const OFFICE_ASSOCIATE_ROLE = 'Office Associate';
export function isOfficeAssociate(user: { id?: string; role?: string | null } | null | undefined): boolean {
  return !!user && user.id !== 'ADMIN' && user.id !== 'PROP' && user.role === OFFICE_ASSOCIATE_ROLE;
}

// MIS (Management Information System) table for tracking work allocations
export const misEntries = pgTable("mis_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  associateId: varchar("associate_id", { length: 10 }).notNull().references(() => users.id),
  sno: integer("sno").notNull(),
  leadId: text("lead_id").notNull(),
  customerName: text("customer_name").notNull(),
  businessName: text("business_name"),
  contactDetails: text("contact_details"),
  customerAddress: text("customer_address"),
  inDate: text("in_date"),
  outDate: text("out_date"),
  initiatedPerson: text("initiated_person"),
  product: text("product"),
  pdPerson: text("pd_person"),
  pdTyping: text("pd_typing"),
  pdPersonId: varchar("pd_person_id", { length: 10 }).references(() => users.id),
  pdTypingId: varchar("pd_typing_id", { length: 10 }).references(() => users.id),
  workNature: text("work_nature"),
  location: text("location"),
  status: text("status").default("Pending"),
  workflowStatus: text("workflow_status").default("unassigned"),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMisEntrySchema = createInsertSchema(misEntries).omit({
  createdAt: true,
});

export type InsertMisEntry = z.infer<typeof insertMisEntrySchema>;
export type MisEntry = typeof misEntries.$inferSelect;

// Associate ↔ pincode coverage map. Each 6-digit pincode is handled by exactly one
// associate. New MIS cases are auto-allocated to the associate whose pincode matches
// the pincode found in the case's customer address. Admins manage this mapping from
// the "Pincode Mapping" page and may reassign a pincode from one associate to another,
// add a new pincode, or delete one. (The table keeps its original name for continuity.)
export const associateLocations = pgTable("associate_locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  associateId: varchar("associate_id", { length: 10 }).notNull().references(() => users.id),
  pincode: text("pincode").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssociateLocationSchema = createInsertSchema(associateLocations).omit({
  id: true,
  createdAt: true,
});

export type InsertAssociateLocation = z.infer<typeof insertAssociateLocationSchema>;
export type AssociateLocation = typeof associateLocations.$inferSelect;

// Archive statistics table - preserves dashboard numbers after reports are archived
export const archiveStats = pgTable("archive_stats", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  archiveDate: timestamp("archive_date").defaultNow().notNull(),
  archiveFileName: text("archive_file_name").notNull(),
  reportsCount: integer("reports_count").notNull(),
  misEntriesCount: integer("mis_entries_count").notNull(),
  // Aggregate statistics to preserve
  totalPositive: integer("total_positive").default(0),
  totalNegative: integer("total_negative").default(0),
  totalCreditRefer: integer("total_credit_refer").default(0),
  totalPending: integer("total_pending").default(0),
  avgOverallScore: integer("avg_overall_score").default(0),
  avgComprehensiveScore: integer("avg_comprehensive_score").default(0),
  // Associate-wise breakdown stored as JSON
  associateBreakdown: jsonb("associate_breakdown"),
  // Date range of archived reports
  oldestReportDate: text("oldest_report_date"),
  newestReportDate: text("newest_report_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertArchiveStatsSchema = createInsertSchema(archiveStats).omit({
  id: true,
  createdAt: true,
});

export type InsertArchiveStats = z.infer<typeof insertArchiveStatsSchema>;
export type ArchiveStats = typeof archiveStats.$inferSelect;

// Office Costing — expense bills submitted by associates + admin's own daily costs
export type ExpenseStatus = 'pending' | 'approved' | 'paid' | 'rejected';
export type ExpenseCategory =
  | 'Petrol bill' | 'Car Parking' | 'Food' | 'Stationery' | 'Printing' | 'Courier'
  | 'Internet' | 'Office Rent' | 'Utilities' | 'Misc';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Petrol bill', 'Car Parking', 'Food', 'Stationery', 'Printing', 'Courier',
  'Internet', 'Office Rent', 'Utilities', 'Misc',
];

export const EXPENSE_STATUSES: ExpenseStatus[] = ['pending', 'approved', 'paid', 'rejected'];

// Manual part-payment tracking. Payments are not integrated to a gateway, so the
// approver records each disbursement against an approved bill. Net to be paid =
// approved amount − sum(payments). When the net reaches zero the bill is 'paid'.
export const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card', 'Other'] as const;
export type PaymentMode = typeof PAYMENT_MODES[number];

export type ExpensePayment = {
  date: string;       // 'YYYY-MM-DD'
  paidVia: string;    // one of PAYMENT_MODES (free text tolerated)
  amount: number;     // positive rupee amount
};

export const expenses = pgTable("expenses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id", { length: 10 }).notNull().references(() => users.id),
  date: text("date").notNull(),
  category: text("category").notNull(),
  description: text("description").default('').notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  approverId: varchar("approver_id", { length: 10 }).notNull().references(() => users.id),
  billFileUrl: text("bill_file_url"),
  status: text("status").notNull().default('pending'),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  rejectionReason: text("rejection_reason"),
  isOwnCost: boolean("is_own_cost").default(false).notNull(),
  payments: jsonb("payments").$type<ExpensePayment[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
  paidAt: true,
  payments: true,
});

// Bulk (lump-sum) disbursements made by the approver. Each one is the "money in".
// It is allocated FIFO (oldest approved bill first, globally across all associates)
// into per-bill `payments` rows; any leftover stays as an advance/credit balance
// (credit = SUM(bulk_payments.amount) − SUM(all allocated bill payments)) and is
// auto-applied to bills as they get approved.
export const bulkPayments = pgTable("bulk_payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: text("date").notNull(),
  paidVia: text("paid_via").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  createdBy: varchar("created_by", { length: 10 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type BulkPayment = typeof bulkPayments.$inferSelect;

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Bank statements (Receipts & Payments) — PROP-only
// Ordered by expected selection frequency — Unclassified first as default,
// then the categories the user picks most often. Less common items follow.
// Reorder when the workflow changes.
export const BANK_TXN_CATEGORIES = [
  'Unclassified',
  'Internal Transfer',
  'Misc',
  'Salary',
  'Personal expense',
  'Office expense',
  'Entertainment Expense',
  'Credit Card Pmt',
  'Wife AC',
  'Office rent',
  'Commission paid',
  'Hand Loan - Family',
  'Revenue - Andro',
  'Revenue - Mucare',
  'Revenue - Piramal',
  'Revenue - Others',
  'Dividend Revenue',
  'Investment withdrawal',
  'Investment addition',
  'Loan disbursement',
  'Client payment',
  'Refund',
  'Chit payment',
  'Statutory (TDS/GST)',
  'Bank charges',
  'Daughter Function expense',
  'Transfer',
  'Other',
] as const;
export type BankTxnCategory = typeof BANK_TXN_CATEGORIES[number];

export const bankStatements = pgTable("bank_statements", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number"),
  month: text("month").notNull(), // 'YYYY-MM'
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull(),
  closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }).notNull(),
  sourceFileUrl: text("source_file_url"),
  uploadedBy: varchar("uploaded_by", { length: 10 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bankTransactions = pgTable("bank_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  statementId: integer("statement_id").notNull().references(() => bankStatements.id, { onDelete: 'cascade' }),
  date: text("date").notNull(), // YYYY-MM-DD
  narration: text("narration").notNull().default(''),
  debit: numeric("debit", { precision: 14, scale: 2 }),
  credit: numeric("credit", { precision: 14, scale: 2 }),
  balance: numeric("balance", { precision: 14, scale: 2 }),
  category: text("category").notNull().default('Unclassified'),
  comment: text("comment").notNull().default(''),
  rowIndex: integer("row_index").notNull().default(0),
});

export const insertBankStatementSchema = createInsertSchema(bankStatements).omit({ id: true, createdAt: true });
export const insertBankTransactionSchema = createInsertSchema(bankTransactions).omit({ id: true });
export type InsertBankStatement = z.infer<typeof insertBankStatementSchema>;
export type BankStatement = typeof bankStatements.$inferSelect;
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type BankTransaction = typeof bankTransactions.$inferSelect;
