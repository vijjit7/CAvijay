import { type User, type InsertUser, type Report, type InsertReport, type MisEntry, type InsertMisEntry, type ArchiveStats, type InsertArchiveStats, type Expense, type ExpenseStatus, type ExpensePayment, type BulkPayment, type BankStatement, type BankTransaction, users, reports, misEntries, archiveStats, expenses, bulkPayments, bankStatements, bankTransactions } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

export type NewExpense = {
  userId: string;
  date: string;
  category: string;
  description?: string;
  amount: number | string;
  approverId: string;
  billFileUrl?: string | null;
  status?: ExpenseStatus;
  isOwnCost?: boolean;
};
import { requireDb, db } from "./db";
import { eq, and, sql, desc } from "drizzle-orm";

// Fallback users for local development when database is not available
const DEFAULT_USERS: User[] = [
  { id: 'ADMIN', username: 'admin', password: 'password@123', name: 'Admin', role: 'System Administrator', avatar: '' },
  { id: 'PROP', username: 'vijay', password: 'password@123', name: 'Vijay Togaru', role: 'Proprietor', avatar: '' },
  { id: 'A1', username: 'bharat', password: 'password123', name: 'Bharat', role: 'Verification Officer', avatar: '' },
  { id: 'A2', username: 'narender', password: 'password123', name: 'Narender', role: 'Verification Officer', avatar: '' },
  { id: 'A3', username: 'upender', password: 'password123', name: 'Upender', role: 'Verification Officer', avatar: '' },
  { id: 'A4', username: 'avinash', password: 'password123', name: 'Avinash', role: 'Verification Officer', avatar: '' },
  { id: 'A5', username: 'prashanth', password: 'password123', name: 'Prashanth', role: 'Verification Officer', avatar: '' },
  { id: 'A6', username: 'anosh', password: 'password123', name: 'Anosh', role: 'Verification Officer', avatar: '' },
  { id: 'A7', username: 'nikhil', password: 'password123', name: 'Nikhil', role: 'Verification Officer', avatar: '' }
];

// Persist in-memory user changes (e.g. password updates) to disk so they
// survive dev-server restarts when DATABASE_URL is not configured.
const DEV_USERS_FILE = path.resolve(process.cwd(), 'tmp', 'dev-users.json');

function loadDevUserOverrides() {
  try {
    if (!fs.existsSync(DEV_USERS_FILE)) return;
    const raw = fs.readFileSync(DEV_USERS_FILE, 'utf8');
    const overrides = JSON.parse(raw) as Array<Partial<User> & { id: string }>;
    for (const o of overrides) {
      const target = DEFAULT_USERS.find(u => u.id === o.id);
      if (target) {
        if (typeof o.password === 'string') target.password = o.password;
        if (typeof o.role === 'string') target.role = o.role;
      } else if (o.id && o.username && o.name) {
        // A dev-created associate that isn't one of the built-in defaults —
        // re-add it so it survives restarts.
        DEFAULT_USERS.push({
          id: o.id,
          username: o.username,
          password: typeof o.password === 'string' ? o.password : '',
          name: o.name,
          role: o.role ?? 'Verification Officer',
          avatar: o.avatar ?? '',
        });
      }
    }
    console.log(`[Storage] Loaded ${overrides.length} dev-user overrides from ${DEV_USERS_FILE}`);
  } catch (err) {
    console.error('[Storage] Failed to load dev-user overrides:', err);
  }
}

function saveDevUserOverrides() {
  try {
    fs.mkdirSync(path.dirname(DEV_USERS_FILE), { recursive: true });
    const tmp = DEV_USERS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(DEFAULT_USERS, null, 2), 'utf8');
    fs.renameSync(tmp, DEV_USERS_FILE);
  } catch (err) {
    console.error('[Storage] Failed to save dev-user overrides:', err);
  }
}

loadDevUserOverrides();

// ── In-memory store persistence (dev only, no DATABASE_URL) ───────────────────
// Mirror reports/MIS/expenses/bank statements/transactions + sequence counters
// to a JSON file so they survive restarts. Without this, every code change that
// restarts the server wipes everything you uploaded.
const DEV_STATE_FILE = path.resolve(process.cwd(), 'tmp', 'dev-state.json');
let suspendPersist = false;
let persistTimer: NodeJS.Timeout | null = null;

function reviveCreatedAt<T extends { createdAt?: any }>(items: any[]): T[] {
  for (const it of items) {
    if (it && typeof it.createdAt === 'string') {
      const d = new Date(it.createdAt);
      if (!isNaN(d.getTime())) it.createdAt = d;
    }
  }
  return items as T[];
}

function loadDevState() {
  try {
    if (!fs.existsSync(DEV_STATE_FILE)) return;
    suspendPersist = true;
    const raw = fs.readFileSync(DEV_STATE_FILE, 'utf8');
    const s = JSON.parse(raw) as any;
    if (Array.isArray(s.reports)) { inMemoryReports.length = 0; inMemoryReports.push(...reviveCreatedAt<Report>(s.reports)); }
    if (Array.isArray(s.misEntries)) { inMemoryMisEntries.length = 0; inMemoryMisEntries.push(...reviveCreatedAt<MisEntry>(s.misEntries)); }
    if (Array.isArray(s.expenses)) { inMemoryExpenses.length = 0; inMemoryExpenses.push(...reviveCreatedAt<Expense>(s.expenses)); }
    if (Array.isArray(s.bankStatements)) { inMemoryBankStatements.length = 0; inMemoryBankStatements.push(...reviveCreatedAt<BankStatement>(s.bankStatements)); }
    if (Array.isArray(s.bankTransactions)) { inMemoryBankTransactions.length = 0; inMemoryBankTransactions.push(...s.bankTransactions); }
    if (Array.isArray(s.bulkPayments)) { inMemoryBulkPayments.length = 0; inMemoryBulkPayments.push(...reviveCreatedAt<BulkPayment>(s.bulkPayments)); }
    if (typeof s.bulkPaymentSeq === 'number') memSeq.bulkPayment = s.bulkPaymentSeq;
    if (typeof s.expenseSeq === 'number') memSeq.expense = s.expenseSeq;
    if (typeof s.bankStmtSeq === 'number') memSeq.bankStmt = s.bankStmtSeq;
    if (typeof s.bankTxnSeq === 'number') memSeq.bankTxn = s.bankTxnSeq;
    console.log(`[Storage] Loaded dev state from ${DEV_STATE_FILE}: ${inMemoryReports.length} reports, ${inMemoryMisEntries.length} MIS, ${inMemoryExpenses.length} expenses, ${inMemoryBankStatements.length} statements, ${inMemoryBankTransactions.length} txns`);
  } catch (err) {
    console.error('[Storage] Failed to load dev state:', err);
  } finally {
    suspendPersist = false;
  }
}

function saveDevStateNow() {
  try {
    fs.mkdirSync(path.dirname(DEV_STATE_FILE), { recursive: true });
    const state = {
      reports: inMemoryReports,
      misEntries: inMemoryMisEntries,
      expenses: inMemoryExpenses,
      bankStatements: inMemoryBankStatements,
      bankTransactions: inMemoryBankTransactions,
      bulkPayments: inMemoryBulkPayments,
      expenseSeq: memSeq.expense,
      bulkPaymentSeq: memSeq.bulkPayment,
      bankStmtSeq: memSeq.bankStmt,
      bankTxnSeq: memSeq.bankTxn,
    };
    const tmp = DEV_STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, DEV_STATE_FILE);
  } catch (err) {
    console.error('[Storage] Failed to save dev state:', err);
  }
}

// Debounced — many mutations during a single operation (e.g. bulk insert of 86
// txns) collapse to one write.
function persist() {
  if (suspendPersist) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(saveDevStateNow, 150);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { if (persistTimer) { clearTimeout(persistTimer); saveDevStateNow(); } process.exit(0); });
}

export interface IStorage {
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  updateUserPassword(id: string, password: string): Promise<boolean>;
  createReport(report: InsertReport & { id: string }): Promise<Report>;
  getReports(filters?: { 
    associateId?: string; 
    status?: string; 
    month?: string; 
    year?: string;
  }): Promise<Report[]>;
  getReportById(id: string): Promise<Report | undefined>;
  getReportByLeadIdAndDate(leadId: string, date: string): Promise<Report | undefined>;
  deleteReport(id: string): Promise<boolean>;
  updateReportTAT(id: string, tat: any): Promise<Report | undefined>;
  updateReportTATDelay(id: string, reason: string | null, remark: string | null): Promise<Report | undefined>;
  updateReportScores(id: string, scores: any): Promise<Report | undefined>;
  getAssociates(): Promise<User[]>;
  getDashboardStats(month?: string, year?: string): Promise<{
    totalReports: number;
    avgScore: number;
    associates: Array<{
      id: string;
      name: string;
      avatar: string;
      reportCount: number;
      avgScore: number;
    }>;
  }>;
  // MIS methods - centralized
  getMisEntries(associateId?: string): Promise<MisEntry[]>;
  createMisEntry(entry: InsertMisEntry): Promise<MisEntry>;
  createMisEntriesBulk(entries: InsertMisEntry[]): Promise<MisEntry[]>;
  updateMisEntry(id: number, entry: Partial<InsertMisEntry>): Promise<MisEntry | undefined>;
  deleteMisEntry(id: number): Promise<boolean>;
  getNextMisSno(associateId?: string): Promise<number>;
  getMisEntryByLeadId(leadId: string): Promise<MisEntry | undefined>;
  getMisEntryByLeadIdAndCustomerName(leadId: string, customerName: string): Promise<MisEntry | undefined>;
  getReportByLeadIdAndTitle(leadId: string, title: string): Promise<Report | undefined>;
  // Archive methods
  createArchiveStats(stats: InsertArchiveStats): Promise<ArchiveStats>;
  getArchiveStats(): Promise<ArchiveStats[]>;
  getAllReportsForArchive(): Promise<Report[]>;
  getReportsByDateRange(fromDate?: string, toDate?: string): Promise<Report[]>;
  deleteAllReports(): Promise<number>;
  deleteAllMisEntries(): Promise<number>;
  getTotalReportsCount(): Promise<number>;
  getTotalMisEntriesCount(): Promise<number>;
  purgePdfContent(fromDate: string, toDate: string): Promise<number>;
  // Office Costing — expenses / bills
  createExpense(expense: NewExpense): Promise<Expense>;
  getExpenses(filters?: { userId?: string; status?: ExpenseStatus; month?: string }): Promise<Expense[]>;
  getExpenseById(id: number): Promise<Expense | undefined>;
  updateExpenseStatus(
    id: number,
    status: ExpenseStatus,
    extra?: { rejectionReason?: string | null }
  ): Promise<Expense | undefined>;
  addExpensePayment(id: number, payment: ExpensePayment): Promise<Expense | undefined>;
  removeExpensePayment(id: number, index: number): Promise<Expense | undefined>;
  deleteExpense(id: number): Promise<boolean>;
  // Bulk (lump-sum) payments — the "money in" ledger for FIFO allocation
  createBulkPayment(input: { date: string; paidVia: string; amount: number; createdBy: string }): Promise<BulkPayment>;
  getBulkPayments(): Promise<BulkPayment[]>;
  // Bank statements (Receipts & Payments)
  createBankStatement(input: {
    bankName: string;
    accountNumber?: string | null;
    month: string;
    openingBalance: number | string;
    closingBalance: number | string;
    sourceFileUrl?: string | null;
    uploadedBy: string;
    transactions: Array<{
      date: string;
      narration: string;
      debit?: number | string | null;
      credit?: number | string | null;
      balance?: number | string | null;
      rowIndex: number;
      category?: string;
    }>;
  }): Promise<{ statement: BankStatement; transactions: BankTransaction[] }>;
  listBankStatements(filters: { month?: string }): Promise<BankStatement[]>;
  getBankStatementById(id: number): Promise<BankStatement | undefined>;
  updateBankStatement(id: number, patch: { bankName?: string; accountNumber?: string | null; openingBalance?: number | string; closingBalance?: number | string }): Promise<BankStatement | undefined>;
  listBankTransactions(statementId: number): Promise<BankTransaction[]>;
  updateBankTransactionClassification(id: number, patch: { category?: string; comment?: string }): Promise<BankTransaction | undefined>;
  getLatestClosingBalanceBefore(bankName: string, month: string): Promise<{ month: string; closingBalance: string } | undefined>;
  findBankStatementForMerge(month: string, bankName: string, accountNumber: string | null): Promise<BankStatement | undefined>;
  appendBankTransactions(
    statementId: number,
    transactions: Array<{
      date: string;
      narration: string;
      debit?: number | string | null;
      credit?: number | string | null;
      balance?: number | string | null;
      rowIndex: number;
      category?: string;
    }>,
    patch?: { accountNumber?: string | null; openingBalance?: number | string; closingBalance?: number | string; sourceFileUrl?: string | null }
  ): Promise<{ statement: BankStatement; appended: BankTransaction[] }>;
  deleteBankStatement(id: number): Promise<boolean>;
}

// In-memory storage for local development (when DATABASE_URL is not set)
const inMemoryReports: Report[] = [];
const inMemoryMisEntries: MisEntry[] = [];

// Build a complete in-memory MIS row from an insert payload, matching the real
// `misEntries` schema columns exactly (location / contactDetails / customerAddress
// / inDate / initiatedPerson / workNature ...). Keeps no-DB dev mode in sync with
// production so imported fields actually display.
function toMemMisEntry(entry: InsertMisEntry, id: number): MisEntry {
  return {
    id,
    sno: entry.sno ?? id,
    associateId: entry.associateId,
    leadId: entry.leadId,
    customerName: entry.customerName,
    businessName: entry.businessName ?? null,
    contactDetails: entry.contactDetails ?? null,
    customerAddress: entry.customerAddress ?? null,
    inDate: entry.inDate ?? null,
    outDate: entry.outDate ?? null,
    initiatedPerson: entry.initiatedPerson ?? null,
    product: entry.product ?? null,
    pdPerson: entry.pdPerson ?? null,
    pdTyping: entry.pdTyping ?? null,
    pdPersonId: entry.pdPersonId ?? null,
    pdTypingId: entry.pdTypingId ?? null,
    workNature: entry.workNature ?? null,
    location: entry.location ?? null,
    status: entry.status ?? 'Pending',
    workflowStatus: entry.workflowStatus ?? 'unassigned',
    assignedAt: entry.assignedAt ?? null,
    createdAt: new Date(),
  };
}
const inMemoryExpenses: Expense[] = [];
const inMemoryBankStatements: BankStatement[] = [];
const inMemoryBankTransactions: BankTransaction[] = [];
const inMemoryBulkPayments: BulkPayment[] = [];
const memSeq = { expense: 1, bulkPayment: 1, bankStmt: 1, bankTxn: 1 };
loadDevState();

export class PostgresStorage implements IStorage {
  private get db() {
    return requireDb();
  }

  private get hasDatabase() {
    return db !== null;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // Fallback to in-memory users when database is not available
    if (!this.hasDatabase) {
      return DEFAULT_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
    }
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserById(id: string): Promise<User | undefined> {
    // Fallback to in-memory users when database is not available
    if (!this.hasDatabase) {
      return DEFAULT_USERS.find(u => u.id === id);
    }
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getAssociates(): Promise<User[]> {
    // Fallback to in-memory users when database is not available
    if (!this.hasDatabase) {
      return DEFAULT_USERS.filter(u => u.id !== 'ADMIN' && u.id !== 'PROP');
    }
    return await this.db.select().from(users).where(sql`${users.id} NOT IN ('ADMIN', 'PROP')`);
  }

  async createUser(user: InsertUser): Promise<User> {
    // Fallback to in-memory users when database is not available. The caller
    // supplies the id (e.g. "A8"), so it is present on the object at runtime.
    if (!this.hasDatabase) {
      const u = user as User;
      const created: User = {
        id: u.id,
        username: u.username,
        password: u.password,
        name: u.name,
        role: u.role,
        avatar: u.avatar ?? '',
      };
      DEFAULT_USERS.push(created);
      saveDevUserOverrides();
      return created;
    }
    const result = await this.db.insert(users).values(user).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    if (!this.hasDatabase) {
      const idx = DEFAULT_USERS.findIndex(u => u.id === id);
      if (idx === -1) return false;
      DEFAULT_USERS.splice(idx, 1);
      saveDevUserOverrides();
      return true;
    }
    const result = await this.db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateUserPassword(id: string, password: string): Promise<boolean> {
    if (!this.hasDatabase) {
      const user = DEFAULT_USERS.find(u => u.id === id);
      if (!user) return false;
      user.password = password;
      saveDevUserOverrides();
      return true;
    }
    const result = await this.db.update(users).set({ password }).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createReport(insertReport: InsertReport & { id: string }): Promise<Report> {
    // Fallback to in-memory storage when database is not available
    if (!this.hasDatabase) {
      const report: Report = {
        ...insertReport,
        createdAt: new Date(),
        tat: insertReport.tat || null,
        scores: insertReport.scores || null,
        tatDelayReason: insertReport.tatDelayReason || null,
        tatDelayRemark: insertReport.tatDelayRemark || null,
      };
      inMemoryReports.push(report);
      persist();
      return report;
    }
    const result = await this.db.insert(reports).values(insertReport).returning();
    return result[0];
  }

  async getReports(filters?: { 
    associateId?: string; 
    status?: string; 
    month?: string; 
    year?: string;
    limit?: number;
    offset?: number;
  }): Promise<Report[]> {
    // Fallback to in-memory storage when database is not available
    if (!this.hasDatabase) {
      let filtered = [...inMemoryReports];
      if (filters?.associateId) {
        filtered = filtered.filter(r => r.associateId === filters.associateId);
      }
      if (filters?.status) {
        filtered = filtered.filter(r => r.status === filters.status);
      }
      if (filters?.month && filters?.year) {
        const datePrefix = `${filters.year}-${filters.month.padStart(2, '0')}`;
        filtered = filtered.filter(r => r.date?.startsWith(datePrefix));
      }
      const limit = filters?.limit || 100;
      const offset = filters?.offset || 0;
      return filtered.slice(offset, offset + limit);
    }
    const conditions = [];
    
    if (filters?.associateId) {
      conditions.push(eq(reports.associateId, filters.associateId));
    }
    
    if (filters?.status) {
      conditions.push(eq(reports.status, filters.status));
    }
    
    if (filters?.month && filters?.year) {
      const monthStr = filters.month.padStart(2, '0');
      const yearStr = filters.year;
      const datePrefix = `${yearStr}-${monthStr}`;
      conditions.push(sql`${reports.date} LIKE ${datePrefix + '%'}`);
    }
    
    // Apply pagination
    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;
    
    // Select all columns EXCEPT pdfContent to avoid fetching huge base64 data
    // pdfContent can be multiple MB per report and causes timeouts when fetching lists
    const selectColumns = {
      id: reports.id,
      associateId: reports.associateId,
      leadId: reports.leadId,
      title: reports.title,
      date: reports.date,
      status: reports.status,
      metrics: reports.metrics,
      scores: reports.scores,
      decision: reports.decision,
      remarks: reports.remarks,
      summary: reports.summary,
      tat: reports.tat,
      tatDelayReason: reports.tatDelayReason,
      tatDelayRemark: reports.tatDelayRemark,
      fileSize: reports.fileSize,
      createdAt: reports.createdAt,
    };
    
    if (conditions.length === 0) {
      return await this.db.select(selectColumns).from(reports).orderBy(sql`${reports.createdAt} DESC`).limit(limit).offset(offset) as Report[];
    }
    
    return await this.db.select(selectColumns).from(reports).where(and(...conditions)).orderBy(sql`${reports.createdAt} DESC`).limit(limit).offset(offset) as Report[];
  }

  async getReportById(id: string): Promise<Report | undefined> {
    const result = await this.db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return result[0];
  }

  async getReportByLeadIdAndDate(leadId: string, date: string): Promise<Report | undefined> {
    const result = await this.db.select().from(reports)
      .where(and(eq(reports.leadId, leadId), eq(reports.date, date)))
      .limit(1);
    return result[0];
  }

  async deleteReport(id: string): Promise<boolean> {
    const result = await this.db.delete(reports).where(eq(reports.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateReportTAT(id: string, tat: any): Promise<Report | undefined> {
    const result = await this.db.update(reports)
      .set({ tat })
      .where(eq(reports.id, id))
      .returning();
    return result[0];
  }

  async updateReportTATDelay(id: string, reason: string | null, remark: string | null): Promise<Report | undefined> {
    const result = await this.db.update(reports)
      .set({ tatDelayReason: reason, tatDelayRemark: remark })
      .where(eq(reports.id, id))
      .returning();
    return result[0];
  }

  async updateReportScores(id: string, scores: any): Promise<Report | undefined> {
    const result = await this.db.update(reports)
      .set({ scores })
      .where(eq(reports.id, id))
      .returning();
    return result[0];
  }

  async getDashboardStats(month?: string, year?: string): Promise<{
    totalReports: number;
    avgScore: number;
    associates: Array<{
      id: string;
      name: string;
      avatar: string;
      reportCount: number;
      avgScore: number;
    }>;
  }> {
    const conditions = [];
    
    if (month && year) {
      const monthStr = month.padStart(2, '0');
      const yearStr = year;
      const datePrefix = `${yearStr}-${monthStr}`;
      conditions.push(sql`${reports.date} LIKE ${datePrefix + '%'}`);
    }
    
    // Only select columns needed for dashboard stats (exclude pdfContent for performance)
    const dashboardColumns = {
      id: reports.id,
      associateId: reports.associateId,
      date: reports.date,
      scores: reports.scores,
    };
    
    const filteredReports = conditions.length > 0
      ? await this.db.select(dashboardColumns).from(reports).where(and(...conditions))
      : await this.db.select(dashboardColumns).from(reports);
    
    const allUsers = await this.getAssociates();
    
    const totalReports = filteredReports.length;
    
    const totalScore = filteredReports.reduce((sum, report) => {
      const scores = report.scores as any;
      return sum + (scores?.overall || 0);
    }, 0);
    
    const avgScore = totalReports > 0 ? totalScore / totalReports : 0;
    
    const associateStats = allUsers.map(user => {
      const userReports = filteredReports.filter(r => r.associateId === user.id);
      const reportCount = userReports.length;
      
      const userTotalScore = userReports.reduce((sum, report) => {
        const scores = report.scores as any;
        return sum + (scores?.overall || 0);
      }, 0);
      
      const avgUserScore = reportCount > 0 ? userTotalScore / reportCount : 0;
      
      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        reportCount,
        avgScore: avgUserScore,
      };
    });
    
    return {
      totalReports,
      avgScore,
      associates: associateStats,
    };
  }

  // MIS methods - centralized MIS for all associates
  async getMisEntries(associateId?: string): Promise<MisEntry[]> {
    // Fallback for local development
    if (!this.hasDatabase) {
      return [...inMemoryMisEntries].sort((a, b) => (b.sno || 0) - (a.sno || 0));
    }
    // Return all entries (centralized MIS)
    return await this.db.select().from(misEntries)
      .orderBy(desc(misEntries.sno));
  }

  async createMisEntry(entry: InsertMisEntry): Promise<MisEntry> {
    // Fallback for local development
    if (!this.hasDatabase) {
      const misEntry = toMemMisEntry(entry, inMemoryMisEntries.length + 1);
      inMemoryMisEntries.push(misEntry);
      persist();
      return misEntry;
    }
    const result = await this.db.insert(misEntries).values(entry).returning();
    return result[0];
  }

  async createMisEntriesBulk(entries: InsertMisEntry[]): Promise<MisEntry[]> {
    if (entries.length === 0) return [];
    // Fallback for local development
    if (!this.hasDatabase) {
      const results: MisEntry[] = [];
      for (const entry of entries) {
        const misEntry = toMemMisEntry(entry, inMemoryMisEntries.length + 1);
        inMemoryMisEntries.push(misEntry);
        results.push(misEntry);
      }
      persist();
      return results;
    }
    const result = await this.db.insert(misEntries).values(entries).returning();
    return result;
  }

  async updateMisEntry(id: number, entry: Partial<InsertMisEntry>): Promise<MisEntry | undefined> {
    // Fallback for local development
    if (!this.hasDatabase) {
      const idx = inMemoryMisEntries.findIndex(e => e.id === id);
      if (idx !== -1) {
        inMemoryMisEntries[idx] = { ...inMemoryMisEntries[idx], ...entry };
        persist();
        return inMemoryMisEntries[idx];
      }
      return undefined;
    }
    const result = await this.db.update(misEntries)
      .set(entry)
      .where(eq(misEntries.id, id))
      .returning();
    return result[0];
  }

  async deleteMisEntry(id: number): Promise<boolean> {
    const result = await this.db.delete(misEntries).where(eq(misEntries.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextMisSno(associateId?: string): Promise<number> {
    // Fallback for local development
    if (!this.hasDatabase) {
      const maxSno = inMemoryMisEntries.reduce((max, e) => Math.max(max, e.sno || 0), 0);
      return maxSno + 1;
    }
    // Global SNO across all entries (centralized MIS)
    const result = await this.db.select({ maxSno: sql<number>`COALESCE(MAX(${misEntries.sno}), 0)` })
      .from(misEntries);
    return (result[0]?.maxSno ?? 0) + 1;
  }
  
  async getMisEntryByLeadId(leadId: string): Promise<MisEntry | undefined> {
    // Fallback for local development
    if (!this.hasDatabase) {
      return inMemoryMisEntries.find(e => e.leadId === leadId);
    }
    const result = await this.db.select().from(misEntries)
      .where(eq(misEntries.leadId, leadId))
      .limit(1);
    return result[0];
  }

  async getMisEntryByLeadIdAndCustomerName(leadId: string, customerName: string): Promise<MisEntry | undefined> {
    // Fallback for local development
    if (!this.hasDatabase) {
      return inMemoryMisEntries.find(e => e.leadId === leadId && e.customerName === customerName);
    }
    const result = await this.db.select().from(misEntries)
      .where(and(eq(misEntries.leadId, leadId), eq(misEntries.customerName, customerName)))
      .limit(1);
    return result[0];
  }

  async getReportByLeadIdAndTitle(leadId: string, title: string): Promise<Report | undefined> {
    // Fallback for local development
    if (!this.hasDatabase) {
      return inMemoryReports.find(r => r.leadId === leadId && r.title === title);
    }
    const result = await this.db.select().from(reports)
      .where(and(eq(reports.leadId, leadId), eq(reports.title, title)))
      .limit(1);
    return result[0];
  }

  // Archive stats methods
  async createArchiveStats(stats: InsertArchiveStats): Promise<ArchiveStats> {
    const result = await this.db.insert(archiveStats).values(stats).returning();
    return result[0];
  }

  async getArchiveStats(): Promise<ArchiveStats[]> {
    return await this.db.select().from(archiveStats).orderBy(sql`${archiveStats.createdAt} DESC`);
  }

  async getAllReportsForArchive(): Promise<Report[]> {
    // Get ALL reports without pagination for archiving
    return await this.db.select().from(reports).orderBy(sql`${reports.createdAt} DESC`);
  }

  async getReportsByDateRange(fromDate?: string, toDate?: string): Promise<Report[]> {
    // Get reports filtered by date range at database level for better performance
    let query = db.select().from(reports);
    
    if (fromDate && toDate) {
      query = query.where(and(
        sql`${reports.date} >= ${fromDate}`,
        sql`${reports.date} <= ${toDate}`
      )) as any;
    } else if (fromDate) {
      query = query.where(sql`${reports.date} >= ${fromDate}`) as any;
    } else if (toDate) {
      query = query.where(sql`${reports.date} <= ${toDate}`) as any;
    }
    
    return await query.orderBy(sql`${reports.createdAt} DESC`);
  }

  async deleteAllReports(): Promise<number> {
    const result = await this.db.delete(reports);
    return result.rowCount ?? 0;
  }

  async deleteAllMisEntries(): Promise<number> {
    const result = await this.db.delete(misEntries);
    return result.rowCount ?? 0;
  }

  async getTotalReportsCount(): Promise<number> {
    const result = await this.db.execute(sql`SELECT COUNT(*) as count FROM reports`);
    return parseInt((result.rows?.[0] as any)?.count || '0', 10);
  }

  async getTotalMisEntriesCount(): Promise<number> {
    const result = await this.db.execute(sql`SELECT COUNT(*) as count FROM mis_entries`);
    return parseInt((result.rows?.[0] as any)?.count || '0', 10);
  }

  async purgePdfContent(fromDate: string, toDate: string): Promise<number> {
    const result = await this.db.execute(
      sql`UPDATE reports SET pdf_content = NULL WHERE date >= ${fromDate} AND date <= ${toDate} AND pdf_content IS NOT NULL`
    );
    return result.rowCount ?? 0;
  }

  async createExpense(insertExpense: NewExpense): Promise<Expense> {
    const now = new Date();
    const status: ExpenseStatus = insertExpense.status ?? 'pending';
    const isApproved = status === 'approved' || status === 'paid';

    if (!this.hasDatabase) {
      const expense: Expense = {
        id: memSeq.expense++,
        userId: insertExpense.userId,
        date: insertExpense.date,
        category: insertExpense.category,
        description: insertExpense.description ?? '',
        amount: String(insertExpense.amount),
        approverId: insertExpense.approverId,
        billFileUrl: insertExpense.billFileUrl ?? null,
        status,
        approvedAt: isApproved ? now : null,
        paidAt: status === 'paid' ? now : null,
        rejectionReason: null,
        isOwnCost: insertExpense.isOwnCost ?? false,
        payments: [],
        createdAt: now,
      };
      inMemoryExpenses.push(expense);
      persist();
      return expense;
    }
    const values: any = {
      userId: insertExpense.userId,
      date: insertExpense.date,
      category: insertExpense.category,
      description: insertExpense.description ?? '',
      amount: String(insertExpense.amount),
      approverId: insertExpense.approverId,
      billFileUrl: insertExpense.billFileUrl ?? null,
      status,
      isOwnCost: insertExpense.isOwnCost ?? false,
    };
    if (isApproved) values.approvedAt = now;
    if (status === 'paid') values.paidAt = now;
    const result = await this.db.insert(expenses).values(values).returning();
    return result[0];
  }

  async getExpenses(filters?: { userId?: string; status?: ExpenseStatus; month?: string }): Promise<Expense[]> {
    if (!this.hasDatabase) {
      let filtered = [...inMemoryExpenses];
      if (filters?.userId) filtered = filtered.filter(e => e.userId === filters.userId);
      if (filters?.status) filtered = filtered.filter(e => e.status === filters.status);
      if (filters?.month) filtered = filtered.filter(e => e.date?.startsWith(filters.month!));
      return filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
    }
    const conditions: any[] = [];
    if (filters?.userId) conditions.push(eq(expenses.userId, filters.userId));
    if (filters?.status) conditions.push(eq(expenses.status, filters.status));
    if (filters?.month) conditions.push(sql`${expenses.date} LIKE ${filters.month + '%'}`);
    const q = conditions.length
      ? this.db.select().from(expenses).where(and(...conditions))
      : this.db.select().from(expenses);
    return await q.orderBy(sql`${expenses.date} DESC, ${expenses.id} DESC`) as Expense[];
  }

  async getExpenseById(id: number): Promise<Expense | undefined> {
    if (!this.hasDatabase) {
      return inMemoryExpenses.find(e => e.id === id);
    }
    const result = await this.db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    return result[0];
  }

  async updateExpenseStatus(
    id: number,
    status: ExpenseStatus,
    extra?: { rejectionReason?: string | null }
  ): Promise<Expense | undefined> {
    const now = new Date();
    const patch: Record<string, any> = { status };
    if (status === 'approved') patch.approvedAt = now;
    if (status === 'paid') patch.paidAt = now;
    if (status === 'rejected') patch.rejectionReason = extra?.rejectionReason ?? null;

    if (!this.hasDatabase) {
      const idx = inMemoryExpenses.findIndex(e => e.id === id);
      if (idx === -1) return undefined;
      inMemoryExpenses[idx] = { ...inMemoryExpenses[idx], ...patch } as Expense;
      persist();
      return inMemoryExpenses[idx];
    }
    const result = await this.db.update(expenses)
      .set(patch as any)
      .where(eq(expenses.id, id))
      .returning();
    return result[0];
  }

  // Apply a new/edited payments list to an expense and derive its status:
  // fully covered → 'paid' (stamp paidAt), otherwise keep it 'approved' (clear paidAt).
  // Returns the persisted row, or undefined if not found / not in a payable state.
  private buildPaymentPatch(exp: Expense, payments: ExpensePayment[], now: Date): Record<string, any> {
    const total = parseFloat(String(exp.amount)) || 0;
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // round to paise to avoid float dust deciding fully-paid
    const fullyPaid = Math.round(paid * 100) >= Math.round(total * 100);
    return {
      payments,
      status: fullyPaid ? 'paid' : 'approved',
      paidAt: fullyPaid ? (exp.paidAt ?? now) : null,
    };
  }

  async addExpensePayment(id: number, payment: ExpensePayment): Promise<Expense | undefined> {
    const now = new Date();
    if (!this.hasDatabase) {
      const idx = inMemoryExpenses.findIndex(e => e.id === id);
      if (idx === -1) return undefined;
      const exp = inMemoryExpenses[idx];
      const payments = [...(exp.payments ?? []), payment];
      inMemoryExpenses[idx] = { ...exp, ...this.buildPaymentPatch(exp, payments, now) } as Expense;
      persist();
      return inMemoryExpenses[idx];
    }
    const exp = await this.getExpenseById(id);
    if (!exp) return undefined;
    const payments = [...(exp.payments ?? []), payment];
    const result = await this.db.update(expenses)
      .set(this.buildPaymentPatch(exp, payments, now) as any)
      .where(eq(expenses.id, id))
      .returning();
    return result[0];
  }

  async removeExpensePayment(id: number, index: number): Promise<Expense | undefined> {
    const now = new Date();
    if (!this.hasDatabase) {
      const idx = inMemoryExpenses.findIndex(e => e.id === id);
      if (idx === -1) return undefined;
      const exp = inMemoryExpenses[idx];
      const payments = (exp.payments ?? []).filter((_, i) => i !== index);
      inMemoryExpenses[idx] = { ...exp, ...this.buildPaymentPatch(exp, payments, now) } as Expense;
      persist();
      return inMemoryExpenses[idx];
    }
    const exp = await this.getExpenseById(id);
    if (!exp) return undefined;
    const payments = (exp.payments ?? []).filter((_, i) => i !== index);
    const result = await this.db.update(expenses)
      .set(this.buildPaymentPatch(exp, payments, now) as any)
      .where(eq(expenses.id, id))
      .returning();
    return result[0];
  }

  async createBulkPayment(input: { date: string; paidVia: string; amount: number; createdBy: string }): Promise<BulkPayment> {
    const now = new Date();
    if (!this.hasDatabase) {
      const bp: BulkPayment = {
        id: memSeq.bulkPayment++,
        date: input.date,
        paidVia: input.paidVia,
        amount: String(input.amount),
        createdBy: input.createdBy,
        createdAt: now,
      };
      inMemoryBulkPayments.push(bp);
      persist();
      return bp;
    }
    const result = await this.db.insert(bulkPayments).values({
      date: input.date,
      paidVia: input.paidVia,
      amount: String(input.amount),
      createdBy: input.createdBy,
    }).returning();
    return result[0];
  }

  async getBulkPayments(): Promise<BulkPayment[]> {
    if (!this.hasDatabase) {
      return [...inMemoryBulkPayments].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
    }
    return await this.db.select().from(bulkPayments).orderBy(sql`${bulkPayments.date} DESC, ${bulkPayments.id} DESC`) as BulkPayment[];
  }

  async deleteExpense(id: number): Promise<boolean> {
    if (!this.hasDatabase) {
      const idx = inMemoryExpenses.findIndex(e => e.id === id);
      if (idx === -1) return false;
      inMemoryExpenses.splice(idx, 1);
      persist();
      return true;
    }
    const result = await this.db.delete(expenses).where(eq(expenses.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createBankStatement(input: {
    bankName: string;
    accountNumber?: string | null;
    month: string;
    openingBalance: number | string;
    closingBalance: number | string;
    sourceFileUrl?: string | null;
    uploadedBy: string;
    transactions: Array<{
      date: string;
      narration: string;
      debit?: number | string | null;
      credit?: number | string | null;
      balance?: number | string | null;
      rowIndex: number;
      category?: string;
    }>;
  }): Promise<{ statement: BankStatement; transactions: BankTransaction[] }> {
    const now = new Date();
    if (!this.hasDatabase) {
      const stmt: BankStatement = {
        id: memSeq.bankStmt++,
        bankName: input.bankName,
        accountNumber: input.accountNumber ?? null,
        month: input.month,
        openingBalance: String(input.openingBalance),
        closingBalance: String(input.closingBalance),
        sourceFileUrl: input.sourceFileUrl ?? null,
        uploadedBy: input.uploadedBy,
        createdAt: now,
      };
      inMemoryBankStatements.push(stmt);
      const txns: BankTransaction[] = input.transactions.map(t => ({
        id: memSeq.bankTxn++,
        statementId: stmt.id,
        date: t.date,
        narration: t.narration || '',
        debit: t.debit != null ? String(t.debit) : null,
        credit: t.credit != null ? String(t.credit) : null,
        balance: t.balance != null ? String(t.balance) : null,
        category: t.category || 'Unclassified',
        comment: '',
        rowIndex: t.rowIndex,
      }));
      inMemoryBankTransactions.push(...txns);
      persist();
      return { statement: stmt, transactions: txns };
    }
    const stmtRes = await this.db.insert(bankStatements).values({
      bankName: input.bankName,
      accountNumber: input.accountNumber ?? null,
      month: input.month,
      openingBalance: String(input.openingBalance),
      closingBalance: String(input.closingBalance),
      sourceFileUrl: input.sourceFileUrl ?? null,
      uploadedBy: input.uploadedBy,
    } as any).returning();
    const stmt = stmtRes[0];
    let txns: BankTransaction[] = [];
    if (input.transactions.length > 0) {
      const rows = input.transactions.map(t => ({
        statementId: stmt.id,
        date: t.date,
        narration: t.narration || '',
        debit: t.debit != null ? String(t.debit) : null,
        credit: t.credit != null ? String(t.credit) : null,
        balance: t.balance != null ? String(t.balance) : null,
        rowIndex: t.rowIndex,
        ...(t.category ? { category: t.category } : {}),
      }));
      txns = await this.db.insert(bankTransactions).values(rows as any).returning() as BankTransaction[];
    }
    return { statement: stmt, transactions: txns };
  }

  async listBankStatements(filters: { month?: string }): Promise<BankStatement[]> {
    if (!this.hasDatabase) {
      let list = [...inMemoryBankStatements];
      if (filters.month) list = list.filter(s => s.month === filters.month);
      return list.sort((a, b) => a.bankName.localeCompare(b.bankName));
    }
    const q = filters.month
      ? this.db.select().from(bankStatements).where(eq(bankStatements.month, filters.month))
      : this.db.select().from(bankStatements);
    return await q.orderBy(bankStatements.bankName) as BankStatement[];
  }

  async getBankStatementById(id: number): Promise<BankStatement | undefined> {
    if (!this.hasDatabase) return inMemoryBankStatements.find(s => s.id === id);
    const r = await this.db.select().from(bankStatements).where(eq(bankStatements.id, id)).limit(1);
    return r[0];
  }

  async updateBankStatement(id: number, patch: { bankName?: string; accountNumber?: string | null; openingBalance?: number | string; closingBalance?: number | string }): Promise<BankStatement | undefined> {
    const next: Record<string, any> = {};
    if (patch.bankName !== undefined) next.bankName = patch.bankName;
    if (patch.accountNumber !== undefined) next.accountNumber = patch.accountNumber;
    if (patch.openingBalance !== undefined) next.openingBalance = String(patch.openingBalance);
    if (patch.closingBalance !== undefined) next.closingBalance = String(patch.closingBalance);
    if (Object.keys(next).length === 0) {
      return this.getBankStatementById(id);
    }
    if (!this.hasDatabase) {
      const stmt = inMemoryBankStatements.find(s => s.id === id);
      if (!stmt) return undefined;
      Object.assign(stmt, next);
      persist();
      return stmt;
    }
    const result = await this.db.update(bankStatements).set(next).where(eq(bankStatements.id, id)).returning();
    return result[0];
  }

  async listBankTransactions(statementId: number): Promise<BankTransaction[]> {
    if (!this.hasDatabase) {
      return inMemoryBankTransactions
        .filter(t => t.statementId === statementId)
        .sort((a, b) => a.rowIndex - b.rowIndex || a.id - b.id);
    }
    return await this.db.select().from(bankTransactions)
      .where(eq(bankTransactions.statementId, statementId))
      .orderBy(bankTransactions.rowIndex, bankTransactions.id) as BankTransaction[];
  }

  async updateBankTransactionClassification(id: number, patch: { category?: string; comment?: string }): Promise<BankTransaction | undefined> {
    const next: Record<string, any> = {};
    if (patch.category !== undefined) next.category = patch.category;
    if (patch.comment !== undefined) next.comment = patch.comment;
    if (Object.keys(next).length === 0) {
      return this.hasDatabase
        ? (await this.db.select().from(bankTransactions).where(eq(bankTransactions.id, id)).limit(1))[0]
        : inMemoryBankTransactions.find(t => t.id === id);
    }
    if (!this.hasDatabase) {
      const idx = inMemoryBankTransactions.findIndex(t => t.id === id);
      if (idx === -1) return undefined;
      inMemoryBankTransactions[idx] = { ...inMemoryBankTransactions[idx], ...next } as BankTransaction;
      persist();
      return inMemoryBankTransactions[idx];
    }
    const r = await this.db.update(bankTransactions).set(next as any).where(eq(bankTransactions.id, id)).returning();
    return r[0];
  }

  async getLatestClosingBalanceBefore(bankName: string, month: string): Promise<{ month: string; closingBalance: string } | undefined> {
    if (!this.hasDatabase) {
      const candidates = inMemoryBankStatements
        .filter(s => s.bankName === bankName && s.month < month)
        .sort((a, b) => b.month.localeCompare(a.month));
      const top = candidates[0];
      return top ? { month: top.month, closingBalance: top.closingBalance } : undefined;
    }
    const rows = await this.db.select().from(bankStatements)
      .where(and(eq(bankStatements.bankName, bankName), sql`${bankStatements.month} < ${month}`))
      .orderBy(desc(bankStatements.month))
      .limit(1) as BankStatement[];
    const top = rows[0];
    return top ? { month: top.month, closingBalance: top.closingBalance } : undefined;
  }

  async findBankStatementForMerge(month: string, bankName: string, accountNumber: string | null): Promise<BankStatement | undefined> {
    const wantBank = bankName.trim().toLowerCase();
    const wantAcc = (accountNumber ?? '').trim();
    const sameMonth = await this.listBankStatements({ month });
    const sameBank = sameMonth.filter(s => s.bankName.trim().toLowerCase() === wantBank);
    if (sameBank.length === 0) return undefined;
    if (!wantAcc) return undefined;
    const exact = sameBank.find(s => (s.accountNumber ?? '').trim() === wantAcc);
    if (exact) return exact;
    return sameBank.find(s => !(s.accountNumber ?? '').trim());
  }

  async appendBankTransactions(
    statementId: number,
    transactions: Array<{
      date: string;
      narration: string;
      debit?: number | string | null;
      credit?: number | string | null;
      balance?: number | string | null;
      rowIndex: number;
      category?: string;
    }>,
    patch?: { accountNumber?: string | null; openingBalance?: number | string; closingBalance?: number | string; sourceFileUrl?: string | null }
  ): Promise<{ statement: BankStatement; appended: BankTransaction[] }> {
    const nextPatch: Record<string, any> = {};
    if (patch?.accountNumber !== undefined) nextPatch.accountNumber = patch.accountNumber;
    if (patch?.openingBalance !== undefined) nextPatch.openingBalance = String(patch.openingBalance);
    if (patch?.closingBalance !== undefined) nextPatch.closingBalance = String(patch.closingBalance);
    if (patch?.sourceFileUrl !== undefined) nextPatch.sourceFileUrl = patch.sourceFileUrl;

    if (!this.hasDatabase) {
      const stmt = inMemoryBankStatements.find(s => s.id === statementId);
      if (!stmt) throw new Error("Statement not found");
      if (Object.keys(nextPatch).length > 0) Object.assign(stmt, nextPatch);
      const appended: BankTransaction[] = transactions.map(t => ({
        id: memSeq.bankTxn++,
        statementId,
        date: t.date,
        narration: t.narration || '',
        debit: t.debit != null ? String(t.debit) : null,
        credit: t.credit != null ? String(t.credit) : null,
        balance: t.balance != null ? String(t.balance) : null,
        category: t.category || 'Unclassified',
        comment: '',
        rowIndex: t.rowIndex,
      }));
      inMemoryBankTransactions.push(...appended);
      persist();
      return { statement: stmt, appended };
    }

    let stmt: BankStatement | undefined;
    if (Object.keys(nextPatch).length > 0) {
      const r = await this.db.update(bankStatements).set(nextPatch).where(eq(bankStatements.id, statementId)).returning();
      stmt = r[0];
    } else {
      stmt = await this.getBankStatementById(statementId);
    }
    if (!stmt) throw new Error("Statement not found");

    let appended: BankTransaction[] = [];
    if (transactions.length > 0) {
      const rows = transactions.map(t => ({
        statementId,
        date: t.date,
        narration: t.narration || '',
        debit: t.debit != null ? String(t.debit) : null,
        credit: t.credit != null ? String(t.credit) : null,
        balance: t.balance != null ? String(t.balance) : null,
        rowIndex: t.rowIndex,
        ...(t.category ? { category: t.category } : {}),
      }));
      appended = await this.db.insert(bankTransactions).values(rows as any).returning() as BankTransaction[];
    }
    return { statement: stmt, appended };
  }

  async deleteBankStatement(id: number): Promise<boolean> {
    if (!this.hasDatabase) {
      const idx = inMemoryBankStatements.findIndex(s => s.id === id);
      if (idx === -1) return false;
      inMemoryBankStatements.splice(idx, 1);
      for (let i = inMemoryBankTransactions.length - 1; i >= 0; i--) {
        if (inMemoryBankTransactions[i].statementId === id) inMemoryBankTransactions.splice(i, 1);
      }
      persist();
      return true;
    }
    const r = await this.db.delete(bankStatements).where(eq(bankStatements.id, id));
    return (r.rowCount ?? 0) > 0;
  }
}

export const storage = new PostgresStorage();
