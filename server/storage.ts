import { type User, type InsertUser, type Report, type InsertReport, type MisEntry, type InsertMisEntry, type ArchiveStats, type InsertArchiveStats, users, reports, misEntries, archiveStats } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc } from "drizzle-orm";

export interface IStorage {
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
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
}

export class PostgresStorage implements IStorage {
  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserById(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createReport(insertReport: InsertReport & { id: string }): Promise<Report> {
    const result = await db.insert(reports).values(insertReport).returning();
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
    
    if (conditions.length === 0) {
      return await db.select().from(reports).orderBy(sql`${reports.createdAt} DESC`).limit(limit).offset(offset);
    }
    
    return await db.select().from(reports).where(and(...conditions)).orderBy(sql`${reports.createdAt} DESC`).limit(limit).offset(offset);
  }

  async getReportById(id: string): Promise<Report | undefined> {
    const result = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return result[0];
  }

  async getReportByLeadIdAndDate(leadId: string, date: string): Promise<Report | undefined> {
    const result = await db.select().from(reports)
      .where(and(eq(reports.leadId, leadId), eq(reports.date, date)))
      .limit(1);
    return result[0];
  }

  async deleteReport(id: string): Promise<boolean> {
    const result = await db.delete(reports).where(eq(reports.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateReportTAT(id: string, tat: any): Promise<Report | undefined> {
    const result = await db.update(reports)
      .set({ tat })
      .where(eq(reports.id, id))
      .returning();
    return result[0];
  }

  async updateReportTATDelay(id: string, reason: string | null, remark: string | null): Promise<Report | undefined> {
    const result = await db.update(reports)
      .set({ tatDelayReason: reason, tatDelayRemark: remark })
      .where(eq(reports.id, id))
      .returning();
    return result[0];
  }

  async updateReportScores(id: string, scores: any): Promise<Report | undefined> {
    const result = await db.update(reports)
      .set({ scores })
      .where(eq(reports.id, id))
      .returning();
    return result[0];
  }

  async getAssociates(): Promise<User[]> {
    return await db.select().from(users).where(sql`${users.id} != 'ADMIN'`);
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
    
    const filteredReports = conditions.length > 0
      ? await db.select().from(reports).where(and(...conditions))
      : await db.select().from(reports);
    
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
    // Return all entries (centralized MIS)
    return await db.select().from(misEntries)
      .orderBy(desc(misEntries.sno));
  }

  async createMisEntry(entry: InsertMisEntry): Promise<MisEntry> {
    const result = await db.insert(misEntries).values(entry).returning();
    return result[0];
  }

  async createMisEntriesBulk(entries: InsertMisEntry[]): Promise<MisEntry[]> {
    if (entries.length === 0) return [];
    const result = await db.insert(misEntries).values(entries).returning();
    return result;
  }

  async updateMisEntry(id: number, entry: Partial<InsertMisEntry>): Promise<MisEntry | undefined> {
    const result = await db.update(misEntries)
      .set(entry)
      .where(eq(misEntries.id, id))
      .returning();
    return result[0];
  }

  async deleteMisEntry(id: number): Promise<boolean> {
    const result = await db.delete(misEntries).where(eq(misEntries.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextMisSno(associateId?: string): Promise<number> {
    // Global SNO across all entries (centralized MIS)
    const result = await db.select({ maxSno: sql<number>`COALESCE(MAX(${misEntries.sno}), 0)` })
      .from(misEntries);
    return (result[0]?.maxSno ?? 0) + 1;
  }
  
  async getMisEntryByLeadId(leadId: string): Promise<MisEntry | undefined> {
    const result = await db.select().from(misEntries)
      .where(eq(misEntries.leadId, leadId))
      .limit(1);
    return result[0];
  }

  async getMisEntryByLeadIdAndCustomerName(leadId: string, customerName: string): Promise<MisEntry | undefined> {
    const result = await db.select().from(misEntries)
      .where(and(eq(misEntries.leadId, leadId), eq(misEntries.customerName, customerName)))
      .limit(1);
    return result[0];
  }

  async getReportByLeadIdAndTitle(leadId: string, title: string): Promise<Report | undefined> {
    const result = await db.select().from(reports)
      .where(and(eq(reports.leadId, leadId), eq(reports.title, title)))
      .limit(1);
    return result[0];
  }

  // Archive stats methods
  async createArchiveStats(stats: InsertArchiveStats): Promise<ArchiveStats> {
    const result = await db.insert(archiveStats).values(stats).returning();
    return result[0];
  }

  async getArchiveStats(): Promise<ArchiveStats[]> {
    return await db.select().from(archiveStats).orderBy(sql`${archiveStats.createdAt} DESC`);
  }

  async getAllReportsForArchive(): Promise<Report[]> {
    // Get ALL reports without pagination for archiving
    return await db.select().from(reports).orderBy(sql`${reports.createdAt} DESC`);
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
    const result = await db.delete(reports);
    return result.rowCount ?? 0;
  }

  async deleteAllMisEntries(): Promise<number> {
    const result = await db.delete(misEntries);
    return result.rowCount ?? 0;
  }

  async getTotalReportsCount(): Promise<number> {
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM reports`);
    return parseInt((result.rows?.[0] as any)?.count || '0', 10);
  }

  async getTotalMisEntriesCount(): Promise<number> {
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM mis_entries`);
    return parseInt((result.rows?.[0] as any)?.count || '0', 10);
  }
}

export const storage = new PostgresStorage();
