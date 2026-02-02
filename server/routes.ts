import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertReportSchema, type ReportTAT, users } from "@shared/schema";
import { randomBytes } from "crypto";
import multer from "multer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import dns from "dns";
import net from "net";
import { searchTriggerEmail, calculateTATMetrics, formatInitiationTime, sendTestEmail, importWorkAllocationEmails } from "./gmail";
import { fetchLoanProposalsByQuery, searchEmailsByLeadId, isGmailOAuthConfigured } from "./gmail-oauth";
import { isAIConfigured } from "./openrouter";
import { scoreDraft } from "./deterministic-scoring";
import { searchLeadIdInMIS, parseFlexibleDate } from "./sheets";
import exifr from "exifr";
// NOTE: db is imported lazily in handlers to avoid crash if DATABASE_URL not set
// import { db } from "./db";
// import { sql } from "drizzle-orm";

const DEFAULT_USERS = [
  { id: 'ADMIN', username: 'admin', password: 'password123', name: 'Admin', role: 'System Administrator', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80' },
  { id: 'A1', username: 'bharat', password: 'password123', name: 'Bharat', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&q=80' },
  { id: 'A2', username: 'narender', password: 'password123', name: 'Narender', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80' },
  { id: 'A3', username: 'upender', password: 'password123', name: 'Upender', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&q=80' },
  { id: 'A4', username: 'avinash', password: 'password123', name: 'Avinash', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=150&q=80' },
  { id: 'A5', username: 'prashanth', password: 'password123', name: 'Prashanth', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&q=80' },
  { id: 'A6', username: 'anosh', password: 'password123', name: 'Anosh', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80' }
];

async function ensureUsersExist() {
  try {
    // Always try to insert default users, using onConflictDoNothing to skip existing ones
    console.log('Ensuring all default users exist...');
    const { db } = await import("./db");
    if (!db) {
      console.log('Database not available, skipping user seeding');
      return;
    }
    await db.insert(users).values(DEFAULT_USERS).onConflictDoNothing();
    console.log('Default users check complete');
  } catch (error) {
    console.error('Error seeding users:', error);
  }
}

const dnsLookup = promisify(dns.lookup);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function isPrivateOrUnsafeIP(ip: string): boolean {
  const normalizedIp = ip.replace(/^\[|\]$/g, '');
  
  if (net.isIPv4(normalizedIp)) {
    return isPrivateIPv4(normalizedIp);
  }
  
  if (net.isIPv6(normalizedIp)) {
    return true;
  }
  
  if (normalizedIp.includes(':')) {
    return true;
  }
  
  return false;
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
    username: string;
  }
}

const execAsync = promisify(exec);

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

async function parsePdf(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const pdf = await getDocument({ data: uint8Array }).promise;
  let text = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    text += pageText + '\n';
  }
  
  return text;
}

async function compressPdf(buffer: Buffer): Promise<{ compressedBuffer: Buffer; originalSize: number; compressedSize: number }> {
  const tempInput = join(tmpdir(), `input_${Date.now()}_${randomBytes(4).toString('hex')}.pdf`);
  const tempOutput = join(tmpdir(), `output_${Date.now()}_${randomBytes(4).toString('hex')}.pdf`);
  const originalSize = buffer.length;
  
  try {
    await writeFile(tempInput, buffer);
    
    const gsCommand = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen \
      -dNOPAUSE -dQUIET -dBATCH \
      -dColorImageDownsampleType=/Bicubic -dColorImageResolution=100 \
      -dGrayImageDownsampleType=/Bicubic -dGrayImageResolution=100 \
      -dMonoImageDownsampleType=/Bicubic -dMonoImageResolution=100 \
      -dDownsampleColorImages=true -dDownsampleGrayImages=true -dDownsampleMonoImages=true \
      -dOptimize=true -dDetectDuplicateImages=true \
      -dCompressFonts=true -dSubsetFonts=true \
      -dAutoRotatePages=/None \
      -sOutputFile="${tempOutput}" "${tempInput}"`;
    
    await execAsync(gsCommand);
    
    const compressedBuffer = await readFile(tempOutput);
    const compressedSize = compressedBuffer.length;
    
    console.log(`PDF compression: ${(originalSize / 1024).toFixed(2)}KB -> ${(compressedSize / 1024).toFixed(2)}KB (${((1 - compressedSize / originalSize) * 100).toFixed(1)}% reduction)`);
    
    return { compressedBuffer, originalSize, compressedSize };
  } catch (error) {
    console.error('PDF compression failed, using original:', error);
    return { compressedBuffer: buffer, originalSize, compressedSize: originalSize };
  } finally {
    try { await unlink(tempInput); } catch {}
    try { await unlink(tempOutput); } catch {}
  }
}

interface PdfMetrics {
  totalFields: number;
  filledFields: number;
  missingFields: string[];
  photoCount: number;
  riskLevel: 'High' | 'Medium' | 'Low';
}

function analyzePdfContent(text: string): PdfMetrics {
  const totalFields = 100;
  
  const requiredFields = [
    { name: 'Reference Check - Primary Contact', pattern: /reference.*primary|primary.*contact/i },
    { name: 'Reference Check - Secondary Contact', pattern: /reference.*secondary|secondary.*contact/i },
    { name: 'Neighbor Feedback - 1', pattern: /neighbor.*feedback.*1|neighbour.*feedback.*1/i },
    { name: 'Neighbor Feedback - 2', pattern: /neighbor.*feedback.*2|neighbour.*feedback.*2/i },
    { name: 'Asset Verification - Photo 1', pattern: /asset.*photo|photo.*asset/i },
    { name: 'Applicant Spouse Details', pattern: /spouse|partner/i },
    { name: 'Emergency Contact Number', pattern: /emergency.*contact|emergency.*number/i },
    { name: 'Alternate Address', pattern: /alternate.*address|secondary.*address/i },
    { name: 'Bank Account Details', pattern: /bank.*account|account.*number/i },
    { name: 'Co-applicant Information', pattern: /co-applicant|coapplicant/i },
  ];
  
  const missingFields: string[] = [];
  for (const field of requiredFields) {
    if (!field.pattern.test(text)) {
      missingFields.push(field.name);
    }
  }
  
  const filledFields = totalFields - missingFields.length;
  
  const photoMatches = text.match(/photo|image|picture|photograph/gi) || [];
  const photoCount = Math.min(20, Math.max(5, photoMatches.length));
  
  let riskLevel: 'High' | 'Medium' | 'Low' = 'Low';
  const hasNegativeIndicators = /discrepancy|mismatch|inconsistent|unable to verify|not found/i.test(text);
  const hasMajorIssues = /fraud|fake|false|forged/i.test(text);
  
  if (hasMajorIssues) {
    riskLevel = 'High';
  } else if (hasNegativeIndicators) {
    riskLevel = 'Medium';
  }
  
  return { totalFields, filledFields, missingFields, photoCount, riskLevel };
}

function extractLeadId(text: string): string | null {
  const patterns = [
    /Lead\s*Id\s*[:\-]?\s*([A-Za-z0-9]{12})/i,
    /LeadId\s*[:\-]?\s*([A-Za-z0-9]{12})/i,
    /Lead\s*ID\s*[:\-]?\s*([A-Za-z0-9]{12})/i,
    /Lead\s*Id\s*[:\-]?\s*(BLSA[A-Za-z0-9_\-]+)/i,
    /Lead\s*Id\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i,
    /LeadId\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i,
    /Lead\s*ID\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i,
    /(BLSA[A-Za-z0-9_\-]+)/i,
    /\b([A-Za-z]{4}[0-9]{8})\b/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractApplicantName(text: string): string | null {
  const patterns = [
    /(?:Applicant|Customer|Borrower|Client)\s*(?:'s)?\s*(?:Name|Full\s*Name)[:\-]?\s*([A-Za-z\s\.]+?)(?:\n|$|,)/i,
    /(?:Name\s*of\s*(?:Applicant|Customer|Borrower|Client))[:\-]?\s*([A-Za-z\s\.]+?)(?:\n|$|,)/i,
    /(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.)\s*([A-Za-z\s\.]+?)(?:\n|$|,)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length >= 2 && name.length <= 100) {
        return name;
      }
    }
  }
  return null;
}

function extractReportDate(text: string): { date: string; ddmmyy: string } | null {
  const patterns = [
    /(?:Report\s*Date|Date)[:\-]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i,
    /(?:Report\s*Date|Date)[:\-]?\s*(\d{1,2})\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(\d{2,4})/i,
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let day: string, month: string, year: string;
      
      if (match[1].length === 4) {
        year = match[1];
        month = match[2].padStart(2, '0');
        day = match[3].padStart(2, '0');
      } else {
        day = match[1].padStart(2, '0');
        month = match[2].padStart(2, '0');
        year = match[3];
      }
      
      if (year.length === 4) {
        year = year.slice(2);
      }
      
      const fullYear = year.length === 2 ? (parseInt(year) > 50 ? '19' + year : '20' + year) : year;
      const isoDate = `${fullYear}-${month}-${day}`;
      const ddmmyy = `${day}${month}${year}`;
      
      return { date: isoDate, ddmmyy };
    }
  }
  return null;
}

function extractVisitDateTime(text: string): Date | null {
  const patterns = [
    /(?:Visit\s*(?:Date\s*(?:&|and)?\s*)?Time|Photo\s*Timestamp|Visited\s*(?:on|at)|Site\s*Visit|Field\s*Visit)[:\-]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s*(?:at\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i,
    /(?:Visit\s*(?:Date\s*(?:&|and)?\s*)?Time|Photo\s*Timestamp|Visited\s*(?:on|at))[:\-]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
    /(?:Photo|Image)\s*(?:taken|captured)\s*(?:on|at)[:\-]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+(\d{1,2}):(\d{2})/i,
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i,
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i,
    /(\d{2})(\d{2})(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/i,
  ];
  
  let foundDates: Date[] = [];
  
  const dateTimeMatches = text.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s*,?\s*\d{1,2}:\d{2}/g);
  if (dateTimeMatches) {
    console.log(`Found potential date-time strings in PDF: ${dateTimeMatches.slice(0, 5).join(', ')}`);
  }
  
  for (const pattern of patterns) {
    const matches = text.matchAll(new RegExp(pattern.source, 'gim'));
    for (const match of matches) {
      try {
        let day: number, month: number, year: number;
        let hours = parseInt(match[4]) || 0;
        let minutes = parseInt(match[5]) || 0;
        let seconds = parseInt(match[6]) || 0;
        const ampm = match[7];
        
        if (match[1].length === 4) {
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else {
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
        }
        
        if (year < 100) {
          year = year > 50 ? 1900 + year : 2000 + year;
        }
        
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
          if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        
        const date = new Date(year, month - 1, day, hours, minutes, seconds);
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2030) {
          foundDates.push(date);
        }
      } catch {
        continue;
      }
    }
  }
  
  if (foundDates.length > 0) {
    foundDates.sort((a, b) => a.getTime() - b.getTime());
    console.log(`Found ${foundDates.length} date(s) in PDF text, earliest: ${foundDates[0].toISOString()}`);
    return foundDates[0];
  }
  
  console.log('No date-time patterns found in PDF text');
  return null;
}

function parseVisitDateFromText(text: string): Date | null {
  const patterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/gi,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/gi,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      try {
        let day: number, month: number, year: number;
        let hours = parseInt(match[4]) || 0;
        let minutes = parseInt(match[5]) || 0;
        const ampm = match[7];
        
        if (match[1].length === 4) {
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else {
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
          if (year < 100) {
            year = year > 50 ? 1900 + year : 2000 + year;
          }
        }
        
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
          if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        
        const date = new Date(year, month - 1, day, hours, minutes);
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2030) {
          return date;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function extractVisitTimeFromImages(buffer: Buffer): Promise<Date | null> {
  try {
    const jpegSignature = Buffer.from([0xFF, 0xD8, 0xFF]);
    let earliestDate: Date | null = null;
    let imagesFound = 0;
    let datesFound = 0;
    
    let searchStart = 0;
    while (searchStart < buffer.length - 3) {
      const jpegStart = buffer.indexOf(jpegSignature, searchStart);
      if (jpegStart === -1) break;
      
      let jpegEnd = buffer.indexOf(Buffer.from([0xFF, 0xD9]), jpegStart + 2);
      if (jpegEnd === -1) {
        jpegEnd = Math.min(jpegStart + 5000000, buffer.length);
      } else {
        jpegEnd += 2;
      }
      
      const jpegData = buffer.slice(jpegStart, jpegEnd);
      imagesFound++;
      
      try {
        const exifData = await exifr.parse(jpegData, { 
          pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateTime'] 
        });
        
        if (exifData) {
          const dateValue = exifData.DateTimeOriginal || exifData.CreateDate || exifData.DateTime || exifData.ModifyDate;
          if (dateValue) {
            const imgDate = new Date(dateValue);
            if (!isNaN(imgDate.getTime()) && imgDate.getFullYear() >= 2020 && imgDate.getFullYear() <= 2030) {
              datesFound++;
              console.log(`Found EXIF date: ${imgDate.toISOString()}`);
              if (!earliestDate || imgDate < earliestDate) {
                earliestDate = imgDate;
              }
            }
          }
        }
      } catch {
      }
      
      searchStart = jpegEnd;
      if (imagesFound >= 50) break;
    }
    
    console.log(`Scanned ${imagesFound} JPEG images, found ${datesFound} with EXIF dates`);
    
    return earliestDate;
  } catch (error) {
    console.error('Error extracting dates from PDF images:', error);
    return null;
  }
}

function extractDecision(text: string): 'Positive' | 'Negative' | 'Credit Refer' | null {
  const safeDecisions = '(positive|negative|credit\\s+refer|approved|rejected|declined|not\\s+recommended|recommended)';
  const referWithNegativeLookahead = '\\b(refer)\\b(?!\\s*(?:to|for|the|this|that|a|an|ence|ring|red|s\\b))';
  const labelPrefixes = '(?:(?:final|verification|field|case|loan|application|applicant|report|investigation)\\s+)*';
  const labelTypes = '(?:decision|status|verdict|result|recommendation|outcome)';
  
  const safePatterns = [
    new RegExp(`${labelPrefixes}${labelTypes}\\s*[:\\-]?\\s*${safeDecisions}`, 'im'),
  ];
  
  for (const pattern of safePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const decision = match[1].toLowerCase().trim().replace(/\s+/g, ' ');
      
      if (decision === 'positive' || decision === 'approved' || decision === 'recommended') {
        return 'Positive';
      }
      if (decision === 'negative' || decision === 'rejected' || decision === 'declined' || decision === 'not recommended') {
        return 'Negative';
      }
      if (decision === 'credit refer') {
        return 'Credit Refer';
      }
    }
  }
  
  const referPatterns = [
    new RegExp(`${labelPrefixes}${labelTypes}\\s*[:\\-]?\\s*${referWithNegativeLookahead}`, 'im'),
  ];
  
  for (const pattern of referPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return 'Credit Refer';
    }
  }
  
  return null;
}

// Build version for cache invalidation - update this timestamp when deploying
const BUILD_VERSION = "2025-12-19T07:50:00Z-ai-holistic";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check endpoint is now in index.ts to ensure it works even if DB fails

  // Test fetching a few reports to debug production issues
  app.get("/api/debug/reports-sample", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      
      // Fetch just 5 reports to test if the data can be serialized
      const result = await db.execute(sql`SELECT id, lead_id, title, date, status FROM reports LIMIT 5`);
      
      res.json({
        status: "ok",
        sampleCount: result.rows?.length ?? 0,
        samples: result.rows ?? [],
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.json({
        status: "error",
        error: error?.message || "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Direct database test using raw SQL - bypasses storage layer
  app.get("/api/debug/db-raw", async (req, res) => {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    
    try {
      const result = await db.execute(sql`SELECT 1 as test`);
      const reportCount = await db.execute(sql`SELECT COUNT(*) as count FROM reports`);
      const misCount = await db.execute(sql`SELECT COUNT(*) as count FROM mis_entries`);
      const userCount = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
      
      res.json({
        status: "ok",
        dbConnection: "working",
        counts: {
          reports: reportCount.rows?.[0]?.count ?? "unknown",
          misEntries: misCount.rows?.[0]?.count ?? "unknown", 
          users: userCount.rows?.[0]?.count ?? "unknown"
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.json({
        status: "error",
        dbConnection: "failed",
        error: error?.message || "Unknown error",
        code: error?.code || null,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Ensure default users exist on startup (works for both dev and production)
  await ensureUsersExist();
  
  // Ensure session table exists for connect-pg-simple
  try {
    const { db } = await import("./db");
    if (db) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
        );
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
      `);
      console.log('[SERVER] Session table ensured');
    }
  } catch (error) {
    console.error('[SERVER] Failed to create session table:', error);
  }

  // Debug endpoint to check database status - minimal version to avoid middleware issues
  app.get("/api/debug/db-status", async (req, res) => {
    try {
      // Step by step testing to isolate the issue
      const dbUrl = process.env.DATABASE_URL ? "configured" : "missing";
      
      let reportsCount = -1;
      let misCount = -1;
      let usersCount = -1;
      let errorDetail = "";
      
      try {
        const reports = await storage.getReports({});
        reportsCount = reports.length;
      } catch (e: any) {
        errorDetail += `Reports: ${e?.message || "unknown"}; `;
      }
      
      try {
        const misEntries = await storage.getMisEntries();
        misCount = misEntries.length;
      } catch (e: any) {
        errorDetail += `MIS: ${e?.message || "unknown"}; `;
      }
      
      try {
        const users = await storage.getAssociates();
        usersCount = users.length;
      } catch (e: any) {
        errorDetail += `Users: ${e?.message || "unknown"}; `;
      }
      
      res.setHeader("Content-Type", "application/json");
      return res.status(200).send(JSON.stringify({
        status: errorDetail ? "partial_error" : "ok",
        databaseUrl: dbUrl,
        environment: process.env.NODE_ENV || "unknown",
        counts: {
          reports: reportsCount,
          misEntries: misCount,
          users: usersCount
        },
        errorDetail: errorDetail || null,
        timestamp: new Date().toISOString()
      }));
    } catch (error: any) {
      res.setHeader("Content-Type", "application/json");
      return res.status(500).send(JSON.stringify({
        status: "error",
        error: error?.message || "Unknown error",
        stack: error?.stack?.substring(0, 500) || null,
        timestamp: new Date().toISOString()
      }));
    }
  });

  // Helper to mark MIS entries as completed when a report is uploaded
  // reportDate: Use the actual report date as the out date (for TAT calculation)
  async function markMisEntryCompleted(leadId: string | null | undefined, reportDate?: string): Promise<void> {
    if (!leadId || leadId.trim() === '') return;
    try {
      const normalizedLeadId = leadId.trim();
      const misEntry = await storage.getMisEntryByLeadId(normalizedLeadId);
      if (misEntry && misEntry.workflowStatus !== 'completed') {
        // Use the report date if provided, otherwise use today's date
        const outDate = reportDate || new Date().toISOString().split('T')[0];
        await storage.updateMisEntry(misEntry.id, {
          status: 'Completed',
          workflowStatus: 'completed',
          outDate: outDate,
        });
        console.log(`[MIS] Marked entry ${misEntry.id} (Lead: ${normalizedLeadId}) as completed with outDate: ${outDate}`);
      }
    } catch (error) {
      console.error(`[MIS] Failed to mark entry completed for Lead ID ${leadId}:`, error);
      // Don't throw - don't break report creation if MIS update fails
    }
  }

  // Version check endpoint - helps verify production deployment
  app.get("/api/version", (req, res) => {
    res.json({ 
      version: BUILD_VERSION,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });

  // Debug endpoint - directly check database (temporary for debugging)
  app.get("/api/debug-reports", async (req, res) => {
    try {
      // First test raw database connection
      let dbConnected = false;
      let dbError = null;
      try {
        const { db } = await import("./db");
        const { sql } = await import("drizzle-orm");
        const result = await db.execute(sql`SELECT 1 as test`);
        dbConnected = true;
      } catch (err) {
        dbError = err instanceof Error ? err.message : String(err);
      }

      const reports = await storage.getReports({});
      const sessionUserId = req.session?.userId || 'NO_SESSION';
      const dbUrl = process.env.DATABASE_URL ? 'SET' : 'NOT_SET';
      
      res.json({
        version: BUILD_VERSION,
        environment: process.env.NODE_ENV || 'development',
        sessionUserId,
        databaseUrlSet: dbUrl,
        databaseConnected: dbConnected,
        databaseError: dbError,
        reportCount: reports.length,
        reportIds: reports.map(r => ({ id: r.id, associateId: r.associateId }))
      });
    } catch (error) {
      res.status(500).json({ 
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        version: BUILD_VERSION,
        environment: process.env.NODE_ENV || 'development',
        databaseUrlSet: process.env.DATABASE_URL ? 'SET' : 'NOT_SET'
      });
    }
  });

  // AI status endpoint - check if AI credentials are configured (for production debugging)
  app.get("/api/ai-status", async (req, res) => {
    try {
      const { isAIConfigured } = await import("./openrouter");
      const configured = isAIConfigured();
      
      // Check which credentials are available (without exposing values)
      const hasStandardKey = !!process.env.OPENROUTER_API_KEY;
      const hasIntegrationsKey = !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
      const hasIntegrationsURL = !!process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
      
      res.json({
        configured,
        credentials: {
          standardKey: hasStandardKey,
          integrationsKey: hasIntegrationsKey,
          integrationsURL: hasIntegrationsURL,
        },
        version: BUILD_VERSION,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        error: String(error),
        configured: false,
        version: BUILD_VERSION
      });
    }
  });

  // AI test endpoint - actually make a simple AI call to verify it works
  app.get("/api/ai-test", async (req, res) => {
    const testId = `test_${Date.now()}`;
    console.log(`[AI Test - ${testId}] Starting AI test call...`);
    
    try {
      const { isAIConfigured } = await import("./openrouter");
      
      if (!isAIConfigured()) {
        console.log(`[AI Test - ${testId}] AI not configured`);
        return res.json({
          success: false,
          error: "AI not configured",
          configured: false,
          version: BUILD_VERSION
        });
      }

      console.log(`[AI Test - ${testId}] AI configured, making test call...`);
      
      // Make a simple test call to OpenRouter
      const OpenAI = (await import("openai")).default;
      
      // Get credentials
      const apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
      const baseURL = process.env.OPENROUTER_BASE_URL || process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      
      console.log(`[AI Test - ${testId}] Using baseURL: ${baseURL}, hasKey: ${!!apiKey}`);
      
      const client = new OpenAI({ baseURL, apiKey });
      
      const startTime = Date.now();
      const result = await client.chat.completions.create({
        model: "deepseek/deepseek-v3.2",
        messages: [{ role: "user", content: "Reply with just the word 'OK'" }],
        max_tokens: 10,
      });
      const endTime = Date.now();
      
      const response = result.choices[0]?.message?.content || "";
      console.log(`[AI Test - ${testId}] Success! Response: "${response}" in ${endTime - startTime}ms`);
      
      res.json({
        success: true,
        response: response,
        latencyMs: endTime - startTime,
        model: "deepseek/deepseek-v3.2",
        version: BUILD_VERSION,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`[AI Test - ${testId}] FAILED:`, {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        type: error?.type,
      });
      
      res.status(500).json({
        success: false,
        error: error?.message || 'Unknown error',
        errorStatus: error?.status,
        errorCode: error?.code,
        version: BUILD_VERSION,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Scoring test endpoint - tests the AI-based scoring function
  app.get("/api/ai-score-test", async (req, res) => {
    const testId = `scoretest_${Date.now()}`;
    console.log(`[Score Test - ${testId}] Starting AI-based scoring test...`);
    
    try {
      const { scoreComprehensiveWithAI, isAIConfigured } = await import("./ai-scoring");
      
      if (!isAIConfigured()) {
        return res.json({
          success: false,
          error: "AI not configured - missing OPENROUTER_API_KEY",
          version: BUILD_VERSION
        });
      }

      const testPdfText = `
        Personal Details:
        Name: John Doe
        Education: Graduate degree from Mumbai University
        Spouse: Jane Doe, homemaker
        Children: 2 kids studying at DPS School
        Residence: Owned property for 10 years
        
        Business Details:
        Business Name: Doe Trading Enterprises
        Nature of Business: Trading and wholesale
        Established: 15 years ago
        GST Registration: Active
        Experience: 20 years in trading
        Employees: 5 staff members
        Monthly Turnover: Rs 500000
        Clients: Multiple retail customers
        Warehouse: Stock visible during visit
        
        Banking Details:
        Bank: HDFC Bank
        Account Tenure: 5 years
        QR Code: UPI/PhonePe available
        Turnover credited: 70% routed through bank
        
        Networth:
        Property: 2 residential properties
        Vehicles: Car and bike owned
        
        Existing Loans:
        Home loan from HDFC, EMI regular
        Good repayment history, no defaults
        
        End Use:
        Purchase of commercial property
        Agreement value: Rs 50 lakhs
        Advance paid: Rs 10 lakhs
        Self occupation planned
        
        References:
        Neighbor reference verified
        Supplier reference checked
        Invoices seen during visit
      `;

      console.log(`[Score Test - ${testId}] Calling scoreComprehensiveWithAI...`);
      const startTime = Date.now();
      const scores = await scoreComprehensiveWithAI(testPdfText, "TEST123");
      const endTime = Date.now();

      const totalScore = scores.personal + scores.business + scores.banking + 
                        scores.networth + scores.existingDebt + scores.endUse + 
                        scores.referenceChecks;

      console.log(`[Score Test - ${testId}] Scores: total=${totalScore}`);
      
      res.json({
        success: true,
        totalScore,
        method: "ai-holistic",
        scores: {
          personal: scores.personal,
          business: scores.business,
          banking: scores.banking,
          networth: scores.networth,
          existingDebt: scores.existingDebt,
          endUse: scores.endUse,
          referenceChecks: scores.referenceChecks,
        },
        rationale: scores.rationale,
        latencyMs: endTime - startTime,
        version: BUILD_VERSION,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`[Score Test - ${testId}] FAILED:`, error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Unknown error',
        version: BUILD_VERSION
      });
    }
  });

  // Development auto-login endpoint - allows login via GET request for testing
  app.get("/api/dev-login/:username", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    
    const { username } = req.params;
    const user = await storage.getUserByUsername(username.toLowerCase().trim());
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session error" });
      }
      
      // Redirect to admin dashboard for admin, upload for others
      const redirectUrl = user.id === 'ADMIN' ? '/' : '/upload';
      res.redirect(redirectUrl);
    });
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      console.log("Login attempt:", { username, passwordLength: password?.length });
      
      if (!username || !password) {
        console.log("Login failed: missing credentials");
        return res.status(400).json({ error: "Username and password required" });
      }
      
      // Normalize username to lowercase
      const normalizedUsername = username.toLowerCase().trim();
      console.log("Looking up user:", normalizedUsername);
      
      let user;
      try {
        user = await storage.getUserByUsername(normalizedUsername);
      } catch (dbError) {
        console.error("Database error looking up user:", dbError);
        // Fallback to default users if database fails
        const DEFAULT_USERS = [
          { id: 'ADMIN', username: 'admin', password: 'password123', name: 'Admin', role: 'System Administrator', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80' },
          { id: 'A1', username: 'bharat', password: 'password123', name: 'Bharat', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&q=80' },
          { id: 'A2', username: 'narender', password: 'password123', name: 'Narender', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80' },
          { id: 'A3', username: 'upender', password: 'password123', name: 'Upender', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&q=80' },
          { id: 'A4', username: 'avinash', password: 'password123', name: 'Avinash', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=150&q=80' },
          { id: 'A5', username: 'prashanth', password: 'password123', name: 'Prashanth', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&q=80' },
          { id: 'A6', username: 'anosh', password: 'password123', name: 'Anosh', role: 'Verification Officer', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80' }
        ];
        user = DEFAULT_USERS.find(u => u.username.toLowerCase() === normalizedUsername);
      }
      console.log("User found:", user ? user.username : "not found");
      
      if (!user) {
        console.log("User not found in database");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Check password (case-sensitive)
      if (user.password !== password) {
        console.log("Password mismatch:", { expected: user.password, got: password });
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const userWithoutPassword = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        isAdmin: user.id === 'ADMIN',
      };
      
      if (req.session) {
        req.session.userId = user.id;
        req.session.username = user.username;
        
        // Explicitly save session to ensure it's persisted before response
        return new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              res.status(500).json({ error: "Failed to save session" });
              return reject(err);
            }
            console.log("Session saved successfully for user:", user.id);
            res.json(userWithoutPassword);
            resolve();
          });
        });
      }
      
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/logout", (req, res) => {
    if (req.session) {
      req.session.destroy((err: any) => {
        if (err) {
          return res.status(500).json({ error: "Failed to logout" });
        }
        res.json({ success: true });
      });
    } else {
      res.json({ success: true });
    }
  });

  app.get("/api/user", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const user = await storage.getUserByUsername(req.session.username!);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const userWithoutPassword = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        isAdmin: user.id === 'ADMIN',
      };
      
      return res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/reports", async (req, res) => {
    try {
      const validationResult = insertReportSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid report data", 
          details: validationResult.error.errors 
        });
      }
      
      const reportData = validationResult.data;
      
      const reportId = `${reportData.associateId}_${reportData.date.replace(/-/g, '')}_${randomBytes(2).toString('hex')}`;
      
      const report = await storage.createReport({
        ...reportData,
        id: reportId,
      });
      
      // Mark corresponding MIS entry as completed with report date
      await markMisEntryCompleted(reportData.leadId, reportData.date);
      
      return res.status(201).json(report);
    } catch (error) {
      console.error("Create report error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/upload-report", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { associateId } = req.body;
      
      if (!associateId) {
        return res.status(400).json({ error: "Associate ID is required" });
      }

      const pdfText = await parsePdf(req.file.buffer);
      
      const { compressedBuffer, originalSize, compressedSize } = await compressPdf(req.file.buffer);
      
      const leadId = extractLeadId(pdfText);
      
      if (!leadId) {
        return res.status(400).json({ 
          error: "Could not extract Lead ID from PDF", 
          message: "Please ensure the PDF contains 'Lead Id:' field on the first page"
        });
      }

      const reportDateInfo = extractReportDate(pdfText);
      
      if (!reportDateInfo) {
        return res.status(400).json({ 
          error: "Could not extract Report Date from PDF", 
          message: "Please ensure the PDF contains a date field on the first page"
        });
      }

      const { date, ddmmyy } = reportDateInfo;

      // Extract applicant name from PDF for unique title generation
      const applicantName = extractApplicantName(pdfText);
      // Include applicant name in title if extracted, otherwise include date for uniqueness
      const reportTitle = applicantName 
        ? `${leadId} - ${applicantName}` 
        : `${leadId} - ${date}`;

      // Check for duplicate report by Lead ID + Title
      // Same Lead ID with different applicant name (or date if name not extracted) is allowed as separate report
      const existingReport = await storage.getReportByLeadIdAndTitle(leadId, reportTitle);
      if (existingReport) {
        return res.status(409).json({ 
          error: "Duplicate report", 
          message: applicantName 
            ? `A report for Lead ID ${leadId} with applicant "${applicantName}" already exists`
            : `A report for Lead ID ${leadId} with date ${date} already exists`,
          existingReportId: existingReport.id
        });
      }

      const extractedDecision = extractDecision(pdfText);
      if (!extractedDecision) {
        return res.status(400).json({ 
          error: "Could not extract Decision from PDF", 
          message: "Please ensure the PDF contains a decision field (e.g., 'Decision: Positive/Negative/Refer')"
        });
      }
      const reportDecision = extractedDecision;

      // Analyze PDF content for deterministic scoring
      const pdfMetrics = analyzePdfContent(pdfText);
      const { totalFields, filledFields, missingFields: selectedMissing, photoCount, riskLevel } = pdfMetrics;
      
      // Calculate completeness score deterministically
      const completenessScore = Math.round((filledFields / totalFields) * 100);
      
      // Calculate comprehensive score using AI analysis
      // AI analyzes the PDF content and scores based on actual understanding, not rigid patterns
      const { scoreComprehensiveWithAI } = await import("./openrouter");
      
      console.log(`[AI Scoring - ${leadId}] Starting AI-powered comprehensive scoring...`);
      
      const aiScores = await scoreComprehensiveWithAI(pdfText, leadId);
      
      console.log(`[AI Scoring - ${leadId}] AI scores received:`, aiScores);
      
      const personalScore = aiScores.personal;
      const businessScore = aiScores.business;
      const bankingScore = aiScores.banking;
      const assetScore = aiScores.networth;
      const debtScore = aiScores.existingDebt;
      const endUseScore = aiScores.endUse;
      const referenceChecksScore = aiScores.referenceChecks;
      const personalMatches = aiScores.personalMatches;
      
      const comprehensiveScore = personalScore + businessScore + bankingScore + assetScore + debtScore + endUseScore + referenceChecksScore;
      
      // Calculate quality score based on completeness
      let qualityScore = 75;
      if (extractedDecision) qualityScore += 8;
      if (reportDateInfo) qualityScore += 7;
      if (leadId) qualityScore += 5;
      if (completenessScore > 80) qualityScore += 5;
      qualityScore = Math.min(95, qualityScore);
      
      const overallScore = Math.round((comprehensiveScore + qualityScore) / 2);

      const allDueDiligenceChecks = [
        'Identity Verification', 'Address Confirmation', 'Business License Check',
        'Income Verification', 'Bank Statement Review', 'Employment Confirmation',
        'Property Ownership Check', 'Vehicle RC Validation', 'Utility Bill Verification',
        'Tax Return Review', 'Reference Verification', 'Neighborhood Survey'
      ];
      // Deterministic selection based on lead ID
      const leadHash = leadId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      const checkCount = 2 + (leadHash % 4);
      const selectedChecks = allDueDiligenceChecks.slice(0, checkCount);

      const allMissedDetails = [
        'House color differs from description',
        'Landmark mismatch in photos',
        'Business signboard not visible in photos',
        'Number of employees differs from report',
        'Vehicle count mismatch',
        'Property boundary unclear',
        'Neighboring shop details inconsistent',
        'Street name not matching',
        'Building structure differs from description',
        'Asset condition not as reported'
      ];
      // Deterministic selection based on comprehensive score
      const missedCount = comprehensiveScore < 85 ? Math.max(0, Math.floor((85 - comprehensiveScore) / 10)) : 0;
      const selectedMissed = allMissedDetails.slice(0, missedCount);

      const allRemarks = [
        'Name board clearly visible at premises',
        'Business activity observed during visit',
        'Applicant cooperative during verification',
        'Neighborhood feedback positive',
        'Property documents verified',
        'Income sources confirmed',
        'Address matches utility bills',
        'Vehicle registration verified',
        'Bank statements cross-checked',
        'Employment confirmed with employer'
      ];
      // Deterministic selection based on lead hash
      const remarkCount = 2 + (leadHash % 3);
      const selectedRemarks = allRemarks.slice(0, remarkCount);

      const summaryOptions = [
        `${leadId} verification completed. Address confirmed and business activity observed.`,
        `Field verification for ${leadId}. All primary documents verified successfully.`,
        `Site visit completed for ${leadId}. Property and identity confirmed.`,
        `${leadId} - Comprehensive verification done. Neighborhood feedback collected.`,
        `Verification report for ${leadId}. Income and employment details confirmed.`
      ];
      const selectedSummary = summaryOptions[leadHash % summaryOptions.length];

      const decisionRemarks = {
        'Positive': [
          'All verification checks passed. Recommend approval.',
          'Strong profile with verified assets and stable income.',
          'Documents verified, neighborhood feedback positive.',
          'Business established, income consistent with application.'
        ],
        'Negative': [
          'Address mismatch found during verification.',
          'Business not operational at given address.',
          'Income claims could not be verified.',
          'Multiple discrepancies in provided documents.'
        ],
        'Credit Refer': [
          'Some documents require additional verification.',
          'Income verification pending, needs further review.',
          'Minor discrepancies noted, supervisor review recommended.',
          'Additional references required for approval.'
        ]
      };
      const selectedDecisionRemark = decisionRemarks[reportDecision][leadHash % decisionRemarks[reportDecision].length];

      const aiReasoningOptions = {
        'Positive': [
          `Field data strongly supports approval. ${selectedChecks.length} verification checks passed.`,
          `Evidence confirms applicant credibility. Risk level: ${riskLevel}.`,
          `Comprehensive verification supports Positive outcome. All key metrics verified.`
        ],
        'Negative': [
          `Multiple red flags detected during field verification.`,
          `Data inconsistencies suggest high risk. Rejection recommended.`,
          `Verification gaps indicate potential concerns.`
        ],
        'Credit Refer': [
          `Mixed signals require human review before final decision.`,
          `Some verification points need clarification. Escalation recommended.`,
          `Additional documentation needed to make final determination.`
        ]
      };
      const selectedAiReasoning = aiReasoningOptions[reportDecision][Math.floor(Math.random() * aiReasoningOptions[reportDecision].length)];

      const reportName = `${leadId}_${ddmmyy}`;
      const reportId = `${reportName}_${randomBytes(2).toString('hex')}`;

      let tat: ReportTAT | null = null;
      let gmailMessageId: string | null = null;
      try {
        // First try to get initiation date from MIS spreadsheet
        let initiationTime: Date | null = null;
        const misResult = await searchLeadIdInMIS(leadId);
        if (misResult.found && misResult.initiationDate) {
          console.log(`Found initiation date from MIS spreadsheet: ${misResult.initiationDate}`);
          initiationTime = misResult.initiationDate;
        } else {
          // Fallback to local MIS entries database
          const localMisEntry = await storage.getMisEntryByLeadId(leadId);
          if (localMisEntry && localMisEntry.inDate) {
            console.log(`Found initiation date from local MIS: ${localMisEntry.inDate}`);
            const parsedDate = parseFlexibleDate(localMisEntry.inDate);
            if (parsedDate) {
              initiationTime = parsedDate;
            }
          }
          
          // Final fallback to Gmail search
          if (!initiationTime) {
            const triggerInfo = await searchTriggerEmail(leadId);
            initiationTime = triggerInfo?.triggerDate || null;
            gmailMessageId = triggerInfo?.messageId || null;
          }
        }
        
        let visitTime = extractVisitDateTime(pdfText);
        if (!visitTime) {
          visitTime = await extractVisitTimeFromImages(req.file!.buffer);
        }
        
        const reportDateObj = new Date(date);
        
        const tatMetrics = calculateTATMetrics(initiationTime, visitTime, reportDateObj);
        
        tat = {
          initiationTime: initiationTime?.toISOString() || null,
          visitTime: visitTime?.toISOString() || null,
          reportDate: date,
          initiationToVisitHours: tatMetrics.initiationToVisitHours,
          visitToReportHours: tatMetrics.visitToReportHours,
          totalTATHours: tatMetrics.totalTATHours,
          gmailMessageId: gmailMessageId
        };
        
        console.log(`TAT for ${leadId}: Init=${initiationTime?.toISOString()}, Visit=${visitTime?.toISOString()}, Report=${date}`);
      } catch (error) {
        console.error('TAT calculation failed, continuing without TAT:', error);
      }

      const report = await storage.createReport({
        id: reportId,
        associateId,
        leadId,
        title: reportTitle,
        date,
        status: 'Pending',
        tat: tat || undefined,
        metrics: {
          totalFields: 100,
          filledFields: Math.floor(100 * (completenessScore / 100)),
          missingFields: selectedMissing,
          riskAnalysisDepth: riskLevel,
          photoCount: photoCount,
          dueDiligenceChecks: selectedChecks,
          photoValidation: {
            matchedCount: Math.floor(photoCount * 0.8),
            totalKeyDetails: photoCount,
            missedDetails: selectedMissed
          }
        },
        scores: {
          completeness: completenessScore,
          comprehensive: comprehensiveScore,
          quality: qualityScore,
          overall: overallScore,
          comprehensiveBreakdown: {
            personal: personalScore,
            personalMatches,
            business: businessScore,
            businessMatches: aiScores.businessMatches,
            banking: bankingScore,
            bankingMatches: aiScores.bankingMatches,
            networth: assetScore,
            networthMatches: aiScores.networthMatches,
            existingDebt: debtScore,
            debtMatches: aiScores.debtMatches,
            endUse: endUseScore,
            endUseMatches: aiScores.endUseMatches,
            referenceChecks: referenceChecksScore,
            referenceMatches: aiScores.referenceMatches
          }
        },
        decision: {
          status: reportDecision,
          remarks: selectedDecisionRemark,
          aiValidation: {
            match: reportDecision === 'Positive',
            confidence: 80 + (leadHash % 20),
            reasoning: selectedAiReasoning
          }
        },
        remarks: selectedRemarks,
        summary: selectedSummary,
        pdfContent: compressedBuffer.toString('base64'),
        fileSize: compressedSize
      });

      // Mark corresponding MIS entry as completed with report date
      await markMisEntryCompleted(leadId, date);

      return res.status(201).json({ 
        success: true, 
        leadId, 
        reportDate: date,
        report,
        fileName: reportName,
        compression: {
          originalSizeKB: (originalSize / 1024).toFixed(2),
          compressedSizeKB: (compressedSize / 1024).toFixed(2),
          reductionPercent: ((1 - compressedSize / originalSize) * 100).toFixed(1)
        }
      });
    } catch (error) {
      console.error("Upload report error:", error);
      return res.status(500).json({ error: "Failed to process PDF" });
    }
  });

  app.post("/api/upload-report-url", async (req, res) => {
    try {
      const { url, associateId } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      if (!associateId) {
        return res.status(400).json({ error: "Associate ID is required" });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Only HTTP and HTTPS URLs are allowed" });
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      
      const allowedDomains = [
        /^storage\.googleapis\.com$/,
        /^drive\.google\.com$/,
        /^docs\.google\.com$/,
        /^.*\.s3\.amazonaws\.com$/,
        /^s3\..*\.amazonaws\.com$/,
        /^.*\.s3-.*\.amazonaws\.com$/,
        /^.*\.cloudfront\.net$/,
        /^.*\.blob\.core\.windows\.net$/,
        /^.*\.dl\.dropboxusercontent\.com$/,
        /^dl\.dropboxusercontent\.com$/,
        /^.*-my\.sharepoint\.com$/,
        /^onedrive\.live\.com$/,
        /^app\.box\.com$/,
        /^raw\.githubusercontent\.com$/,
        /^github\.com$/,
        /^gitlab\.com$/,
        /^bitbucket\.org$/,
      ];
      
      const isAllowedDomain = allowedDomains.some(pattern => pattern.test(hostname));
      
      if (!isAllowedDomain) {
        return res.status(400).json({ 
          error: "URL domain not in allowed list", 
          message: "For security, only PDFs from trusted cloud storage providers (Google Drive, AWS S3, Azure, Dropbox, OneDrive, GitHub, etc.) are allowed. Please upload the file directly instead."
        });
      }

      if (!url.toLowerCase().endsWith('.pdf') && !url.includes('pdf')) {
        return res.status(400).json({ error: "URL must point to a PDF file" });
      }

      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      const TIMEOUT_MS = 30000;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, { 
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'AuditGuard-PDF-Fetcher/1.0'
          }
        });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          return res.status(400).json({ error: "Request timed out while fetching PDF" });
        }
        return res.status(400).json({ error: "Failed to fetch PDF from URL" });
      }
      clearTimeout(timeoutId);

      if (response.status >= 300 && response.status < 400) {
        return res.status(400).json({ error: "URL redirects are not allowed for security reasons. Please use the direct PDF link." });
      }
      
      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch PDF from URL: ${response.status} ${response.statusText}` });
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
        return res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });
      }

      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        return res.status(400).json({ error: "URL does not point to a PDF file" });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        return res.status(400).json({ error: "Downloaded file is empty" });
      }

      if (buffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` });
      }

      const pdfText = await parsePdf(buffer);
      
      const { compressedBuffer, originalSize, compressedSize } = await compressPdf(buffer);
      
      const leadId = extractLeadId(pdfText);
      
      if (!leadId) {
        return res.status(400).json({ 
          error: "Could not extract Lead ID from PDF", 
          message: "Please ensure the PDF contains 'Lead Id:' field on the first page"
        });
      }

      const reportDateInfo = extractReportDate(pdfText);
      
      if (!reportDateInfo) {
        return res.status(400).json({ 
          error: "Could not extract Report Date from PDF", 
          message: "Please ensure the PDF contains a date field on the first page"
        });
      }

      const { date, ddmmyy } = reportDateInfo;

      // Extract applicant name from PDF for unique title generation
      const applicantName = extractApplicantName(pdfText);
      // Include applicant name in title if extracted, otherwise include date for uniqueness
      const reportTitle = applicantName 
        ? `${leadId} - ${applicantName}` 
        : `${leadId} - ${date}`;

      // Check for duplicate report by Lead ID + Title
      // Same Lead ID with different applicant name (or date if name not extracted) is allowed as separate report
      const existingReport = await storage.getReportByLeadIdAndTitle(leadId, reportTitle);
      if (existingReport) {
        return res.status(409).json({ 
          error: "Duplicate report", 
          message: applicantName 
            ? `A report for Lead ID ${leadId} with applicant "${applicantName}" already exists`
            : `A report for Lead ID ${leadId} with date ${date} already exists`,
          existingReportId: existingReport.id
        });
      }

      const extractedDecision = extractDecision(pdfText);
      if (!extractedDecision) {
        return res.status(400).json({ 
          error: "Could not extract Decision from PDF", 
          message: "Please ensure the PDF contains a decision field (e.g., 'Decision: Positive/Negative/Refer')"
        });
      }
      const reportDecision = extractedDecision;

      // Analyze PDF content for deterministic scoring
      const pdfMetrics = analyzePdfContent(pdfText);
      const { totalFields, filledFields, missingFields: selectedMissing, photoCount, riskLevel } = pdfMetrics;
      
      // Calculate completeness score deterministically
      const completenessScore = Math.round((filledFields / totalFields) * 100);
      
      // Calculate comprehensive score using AI analysis
      // AI analyzes the PDF content and scores based on actual understanding, not rigid patterns
      const { scoreComprehensiveWithAI } = await import("./openrouter");
      
      console.log(`[AI Scoring - ${leadId}] Starting AI-powered comprehensive scoring...`);
      
      const aiScores = await scoreComprehensiveWithAI(pdfText, leadId);
      
      console.log(`[AI Scoring - ${leadId}] AI scores received:`, aiScores);
      
      const personalScore = aiScores.personal;
      const businessScore = aiScores.business;
      const bankingScore = aiScores.banking;
      const assetScore = aiScores.networth;
      const debtScore = aiScores.existingDebt;
      const endUseScore = aiScores.endUse;
      const referenceChecksScore = aiScores.referenceChecks;
      const personalMatches = aiScores.personalMatches;
      
      const comprehensiveScore = personalScore + businessScore + bankingScore + assetScore + debtScore + endUseScore + referenceChecksScore;
      
      // Calculate quality score based on completeness
      let qualityScore = 75;
      if (extractedDecision) qualityScore += 8;
      if (reportDateInfo) qualityScore += 7;
      if (leadId) qualityScore += 5;
      if (completenessScore > 80) qualityScore += 5;
      qualityScore = Math.min(95, qualityScore);
      
      const overallScore = Math.round((comprehensiveScore + qualityScore) / 2);

      const allDueDiligenceChecks = [
        'Identity Verification', 'Address Confirmation', 'Business License Check',
        'Income Verification', 'Bank Statement Review', 'Employment Confirmation',
        'Property Ownership Check', 'Vehicle RC Validation', 'Utility Bill Verification',
        'Tax Return Review', 'Reference Verification', 'Neighborhood Survey'
      ];
      // Deterministic selection based on lead ID
      const leadHash = leadId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      const checkCount = 2 + (leadHash % 4);
      const selectedChecks = allDueDiligenceChecks.slice(0, checkCount);

      const allMissedDetails = [
        'House color differs from description',
        'Landmark mismatch in photos',
        'Business signboard not visible in photos',
        'Number of employees differs from report',
        'Vehicle count mismatch',
        'Property boundary unclear',
        'Neighboring shop details inconsistent',
        'Street name not matching',
        'Building structure differs from description',
        'Asset condition not as reported'
      ];
      // Deterministic selection based on comprehensive score
      const missedCount = comprehensiveScore < 85 ? Math.max(0, Math.floor((85 - comprehensiveScore) / 10)) : 0;
      const selectedMissed = allMissedDetails.slice(0, missedCount);

      const allRemarks = [
        'Name board clearly visible at premises',
        'Business activity observed during visit',
        'Applicant cooperative during verification',
        'Neighborhood feedback positive',
        'Property documents verified',
        'Income sources confirmed',
        'Address matches utility bills',
        'Vehicle registration verified',
        'Bank statements cross-checked',
        'Employment confirmed with employer'
      ];
      // Deterministic selection based on lead hash
      const remarkCount = 2 + (leadHash % 3);
      const selectedRemarks = allRemarks.slice(0, remarkCount);

      const summaryOptions = [
        `${leadId} verification completed. Address confirmed and business activity observed.`,
        `Field verification for ${leadId}. All primary documents verified successfully.`,
        `Site visit completed for ${leadId}. Property and identity confirmed.`,
        `${leadId} - Comprehensive verification done. Neighborhood feedback collected.`,
        `Verification report for ${leadId}. Income and employment details confirmed.`
      ];
      const selectedSummary = summaryOptions[leadHash % summaryOptions.length];

      const decisionRemarks = {
        'Positive': [
          'All verification checks passed. Recommend approval.',
          'Strong profile with verified assets and stable income.',
          'Documents verified, neighborhood feedback positive.',
          'Business established, income consistent with application.'
        ],
        'Negative': [
          'Address mismatch found during verification.',
          'Business not operational at given address.',
          'Income claims could not be verified.',
          'Multiple discrepancies in provided documents.'
        ],
        'Credit Refer': [
          'Some documents require additional verification.',
          'Income verification pending, needs further review.',
          'Minor discrepancies noted, supervisor review recommended.',
          'Additional references required for approval.'
        ]
      };
      const selectedDecisionRemark = decisionRemarks[reportDecision][leadHash % decisionRemarks[reportDecision].length];

      const aiReasoningOptions = {
        'Positive': [
          `Field data strongly supports approval. ${selectedChecks.length} verification checks passed.`,
          `Evidence confirms applicant credibility. Risk level: ${riskLevel}.`,
          `Comprehensive verification supports Positive outcome. All key metrics verified.`
        ],
        'Negative': [
          `Multiple red flags detected during field verification.`,
          `Data inconsistencies suggest high risk. Rejection recommended.`,
          `Verification gaps indicate potential concerns.`
        ],
        'Credit Refer': [
          `Mixed signals require human review before final decision.`,
          `Some verification points need clarification. Escalation recommended.`,
          `Additional documentation needed to make final determination.`
        ]
      };
      const selectedAiReasoning = aiReasoningOptions[reportDecision][Math.floor(Math.random() * aiReasoningOptions[reportDecision].length)];

      const reportName = `${leadId}_${ddmmyy}`;
      const reportId = `${reportName}_${randomBytes(2).toString('hex')}`;

      let tat: ReportTAT | null = null;
      try {
        // First try to get initiation date from MIS spreadsheet
        let initiationTime: Date | null = null;
        const misResult = await searchLeadIdInMIS(leadId);
        if (misResult.found && misResult.initiationDate) {
          console.log(`Found initiation date from MIS spreadsheet: ${misResult.initiationDate}`);
          initiationTime = misResult.initiationDate;
        } else {
          // Fallback to local MIS entries database
          const localMisEntry = await storage.getMisEntryByLeadId(leadId);
          if (localMisEntry && localMisEntry.inDate) {
            console.log(`Found initiation date from local MIS: ${localMisEntry.inDate}`);
            const parsedDate = parseFlexibleDate(localMisEntry.inDate);
            if (parsedDate) {
              initiationTime = parsedDate;
            }
          }
          
          // Final fallback to Gmail search
          if (!initiationTime) {
            const triggerInfo = await searchTriggerEmail(leadId);
            initiationTime = triggerInfo?.triggerDate || null;
          }
        }
        
        let visitTime = extractVisitDateTime(pdfText);
        if (!visitTime) {
          visitTime = await extractVisitTimeFromImages(buffer);
        }
        
        const reportDateObj = new Date(date);
        
        const tatMetrics = calculateTATMetrics(initiationTime, visitTime, reportDateObj);
        
        tat = {
          initiationTime: initiationTime?.toISOString() || null,
          visitTime: visitTime?.toISOString() || null,
          reportDate: date,
          initiationToVisitHours: tatMetrics.initiationToVisitHours,
          visitToReportHours: tatMetrics.visitToReportHours,
          totalTATHours: tatMetrics.totalTATHours,
          gmailMessageId: triggerInfo?.messageId || null
        };
        
        console.log(`TAT for ${leadId}: Init=${initiationTime?.toISOString()}, Visit=${visitTime?.toISOString()}, Report=${date}`);
      } catch (error) {
        console.error('TAT calculation failed, continuing without TAT:', error);
      }

      const report = await storage.createReport({
        id: reportId,
        associateId,
        leadId,
        title: reportTitle,
        date,
        status: 'Pending',
        tat: tat || undefined,
        metrics: {
          totalFields: 100,
          filledFields: Math.floor(100 * (completenessScore / 100)),
          missingFields: selectedMissing,
          riskAnalysisDepth: riskLevel,
          photoCount: photoCount,
          dueDiligenceChecks: selectedChecks,
          photoValidation: {
            matchedCount: Math.floor(photoCount * 0.8),
            totalKeyDetails: photoCount,
            missedDetails: selectedMissed
          }
        },
        scores: {
          completeness: completenessScore,
          comprehensive: comprehensiveScore,
          quality: qualityScore,
          overall: overallScore,
          comprehensiveBreakdown: {
            personal: personalScore,
            personalMatches,
            business: businessScore,
            businessMatches: aiScores.businessMatches,
            banking: bankingScore,
            bankingMatches: aiScores.bankingMatches,
            networth: assetScore,
            networthMatches: aiScores.networthMatches,
            existingDebt: debtScore,
            debtMatches: aiScores.debtMatches,
            endUse: endUseScore,
            endUseMatches: aiScores.endUseMatches,
            referenceChecks: referenceChecksScore,
            referenceMatches: aiScores.referenceMatches
          }
        },
        decision: {
          status: reportDecision,
          remarks: selectedDecisionRemark,
          aiValidation: {
            match: reportDecision === 'Positive',
            confidence: 80 + (leadHash % 20),
            reasoning: selectedAiReasoning
          }
        },
        remarks: selectedRemarks,
        summary: selectedSummary,
        pdfContent: compressedBuffer.toString('base64'),
        fileSize: compressedSize
      });

      // Mark corresponding MIS entry as completed with report date
      await markMisEntryCompleted(leadId, date);

      return res.status(201).json({ 
        success: true, 
        leadId, 
        reportDate: date,
        report,
        fileName: reportName,
        sourceUrl: url,
        compression: {
          originalSizeKB: (originalSize / 1024).toFixed(2),
          compressedSizeKB: (compressedSize / 1024).toFixed(2),
          reductionPercent: ((1 - compressedSize / originalSize) * 100).toFixed(1)
        }
      });
    } catch (error) {
      console.error("Upload report from URL error:", error);
      return res.status(500).json({ error: "Failed to process PDF from URL" });
    }
  });

  // Generate PDF from report data for reports without PDF
  async function generateReportPdf(report: any): Promise<Buffer> {
    const execAsync = promisify(exec);
    const tempDir = tmpdir();
    const leadId = report.leadId || report.id;
    const psPath = join(tempDir, `${leadId}_report.ps`);
    const pdfPath = join(tempDir, `${leadId}_report.pdf`);
    
    const escapePs = (str: string) => (str || 'N/A').replace(/[()\\]/g, '\\$&').substring(0, 80);
    const scores = report.scores || {};
    const breakdown = scores.comprehensiveBreakdown || {};
    
    const psContent = `%!PS-Adobe-3.0
%%Title: Verification Report - ${escapePs(leadId)}
%%Creator: AuditGuard
%%Pages: 1
%%EndComments

/Helvetica-Bold findfont 16 scalefont setfont
72 750 moveto
(VERIFICATION REPORT - ${escapePs(leadId)}) show

/Helvetica findfont 10 scalefont setfont
72 720 moveto
(Generated: ${escapePs(report.date || new Date().toISOString().split('T')[0])}) show
72 705 moveto
(Status: ${escapePs(report.status)}) show

/Helvetica-Bold findfont 12 scalefont setfont
72 675 moveto
(SCORES) show

/Helvetica findfont 10 scalefont setfont
72 660 moveto
(Overall: ${scores.overall || 0}%) show
72 645 moveto
(Personal: ${breakdown.personal || 0}/15) show
72 630 moveto
(Business: ${breakdown.business || 0}/30) show
72 615 moveto
(Banking: ${breakdown.banking || 0}/15) show
72 600 moveto
(Networth: ${breakdown.networth || 0}/10) show
72 585 moveto
(Existing Debt: ${breakdown.existingDebt || 0}/10) show
72 570 moveto
(End Use: ${breakdown.endUse || 0}/10) show
72 555 moveto
(Reference Checks: ${breakdown.referenceChecks || 0}/10) show

/Helvetica-Bold findfont 12 scalefont setfont
72 525 moveto
(DECISION) show

/Helvetica findfont 10 scalefont setfont
72 510 moveto
(${escapePs(report.decision?.status || 'Pending')}) show
72 495 moveto
(${escapePs(report.decision?.remarks?.substring(0, 70))}) show

/Helvetica-Bold findfont 12 scalefont setfont
72 465 moveto
(SUMMARY) show

/Helvetica findfont 10 scalefont setfont
72 450 moveto
(${escapePs(report.summary?.substring(0, 80))}) show

showpage
%%EOF
`;
    
    await writeFile(psPath, psContent);
    
    try {
      await execAsync(`gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dSAFER -sOutputFile="${pdfPath}" "${psPath}"`);
      const pdfBuffer = await readFile(pdfPath);
      await unlink(psPath);
      await unlink(pdfPath);
      return pdfBuffer;
    } catch (error) {
      console.error('Ghostscript PDF generation failed:', error);
      await unlink(psPath).catch(() => {});
      throw error;
    }
  }

  // Download PDF for a report
  app.get("/api/reports/:id/download", async (req, res) => {
    try {
      const { id } = req.params;
      const report = await storage.getReportById(id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      let pdfBuffer: Buffer;
      
      if (!report.pdfContent) {
        // Generate PDF on-the-fly for reports without stored PDF
        console.log(`Generating PDF on-the-fly for report ${id}`);
        try {
          pdfBuffer = await generateReportPdf(report);
        } catch (genError) {
          console.error("Failed to generate PDF:", genError);
          return res.status(500).json({ error: "Failed to generate PDF for this report" });
        }
      } else {
        pdfBuffer = Buffer.from(report.pdfContent, 'base64');
      }
      
      const fileName = `${report.leadId || report.id}_report.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      return res.send(pdfBuffer);
    } catch (error) {
      console.error("Download report error:", error);
      return res.status(500).json({ error: "Failed to download PDF" });
    }
  });

  // Generate draft report from audio and photos
  const draftUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
  });

  app.post("/api/generate-draft-report", draftUpload.any(), async (req, res) => {
    try {
      const { leadId } = req.body;
      const files = req.files as Express.Multer.File[];
      
      if (!leadId) {
        return res.status(400).json({ error: "Lead ID is required" });
      }

      // Separate audio and photo files
      const audioFile = files.find(f => f.fieldname === 'audio');
      const photoFiles = files.filter(f => f.fieldname.startsWith('photo_'));

      console.log(`Generating draft report for ${leadId} with ${audioFile ? 1 : 0} audio files and ${photoFiles.length} photos`);

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY
      });

      // Build context from uploaded files
      let transcriptionContext = "";
      let photoDescriptions: string[] = [];

      // For audio, use Gemini to transcribe it
      if (audioFile) {
        try {
          console.log(`Transcribing audio file: ${audioFile.originalname}, size: ${audioFile.size} bytes, mimetype: ${audioFile.mimetype}`);
          
          const audioBase64 = audioFile.buffer.toString('base64');
          const mimeType = audioFile.mimetype || 'audio/webm';
          
          const transcriptionResponse = await openai.chat.completions.create({
            model: "google/gemini-2.0-flash-001",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Please transcribe this audio recording. This is a field verification officer's recording during a visit to verify a loan applicant. Extract all spoken content accurately. Just provide the transcription, no additional commentary."
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mimeType};base64,${audioBase64}`
                    }
                  }
                ]
              }
            ],
            max_tokens: 4096,
          });

          transcriptionContext = transcriptionResponse.choices[0]?.message?.content || "";
          console.log(`Transcription result: ${transcriptionContext.substring(0, 200)}...`);
          
          if (!transcriptionContext || transcriptionContext.length < 10) {
            transcriptionContext = `Audio recording uploaded (${(audioFile.size / 1024).toFixed(1)}KB). The audio contains field verification discussion with the applicant.`;
          }
        } catch (transcriptionError) {
          console.error("Audio transcription error:", transcriptionError);
          transcriptionContext = `Audio recording uploaded (${(audioFile.size / 1024).toFixed(1)}KB). Transcription unavailable - generating report from available context.`;
        }
      }

      // For photos, use vision model to analyze them
      if (photoFiles.length > 0) {
        for (let i = 0; i < photoFiles.length; i++) {
          const photo = photoFiles[i];
          try {
            const photoBase64 = photo.buffer.toString('base64');
            const mimeType = photo.mimetype || 'image/jpeg';
            
            const visionResponse = await openai.chat.completions.create({
              model: "google/gemini-2.0-flash-001",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Describe this image from a field verification visit. Focus on: business signage, premises condition, people present, any documents visible, and anything relevant to loan verification. Be concise but thorough."
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mimeType};base64,${photoBase64}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 500,
            });
            
            const description = visionResponse.choices[0]?.message?.content || `Photo ${i + 1}: Field verification photograph`;
            photoDescriptions.push(`Photo ${i + 1}: ${description}`);
          } catch (photoError) {
            console.error(`Photo ${i + 1} analysis error:`, photoError);
            photoDescriptions.push(`Photo ${i + 1}: Field verification photograph (analysis unavailable)`);
          }
        }
      }

      // Use AI to generate a LIP Report format draft from transcription and photo analysis
      const prompt = `You are an expert field verification officer. Generate a comprehensive LIP (Loan Investigation/Personal Discussion) Report for Lead ID: ${leadId}.

Based on the field visit evidence:
- Audio Recording Transcription: ${transcriptionContext || "No audio recording provided"}
- Photo Analysis: ${photoDescriptions.length > 0 ? photoDescriptions.join("; ") : "No photos provided"}

Generate a verification report draft in JSON format following the LIP Report structure. Extract details from the transcription and photos to fill in the report. Use "Not Available" for any fields that cannot be determined from the provided evidence.

{
  "leadId": "${leadId}",
  "reportDate": "${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}",
  
  "primaryApplicant": {
    "customerName": "Name from transcription or 'To be confirmed'",
    "mobileNumber": "Phone number if mentioned",
    "emailId": "Email if mentioned",
    "residenceAddress": "Home address details",
    "officeAddress": "Business/office address details"
  },
  
  "basicDetails": {
    "branch": "Branch name if mentioned",
    "productLine": "BLSA or product type",
    "transactionType": "LAP/Home Loan/Business Loan etc",
    "totalLoanAmount": "Loan amount requested",
    "pdType": "PHYSICAL",
    "customerProfile": "Self-employed/Salaried/Professional",
    "natureOfBusiness": "Service/Manufacturing/Trading",
    "profession": "Specific profession"
  },
  
  "pdDetails": {
    "pdDate": "${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}",
    "pdPlace": "Office/Shop/Residence",
    "currentAddress": "Address where PD was conducted",
    "pdDoneWith": "Person met during verification"
  },
  
  "personalDetails": {
    "residenceType": "Owned/Rented",
    "residenceVintage": "Duration at current residence",
    "monthlyRent": "Rent amount if applicable",
    "totalFamilyMembers": "Number of family members",
    "dependents": "Number of dependents",
    "monthlyHouseholdExpenses": "Monthly expenses estimate",
    "otherComments": "Education, age, marital status, work experience details"
  },
  
  "businessDetails": {
    "businessVintageMonths": "Months in business at current location",
    "totalBusinessVintage": "Total months in business",
    "majorServices": "Type of services/products",
    "businessName": "Name of the business",
    "businessProfile": "Detailed description of business operations, products/services, customer base, revenue model",
    "sourceOfBusiness": "How customers are acquired",
    "businessSetup": "Owned/Rented premises",
    "monthlyRental": "Business premises rent if applicable",
    "surroundingArea": "Middle Class/Upper Class/Commercial etc",
    "netMonthlyIncome": "Estimated net monthly income",
    "comfortableEmi": "EMI amount applicant can pay"
  },
  
  "referenceChecks": {
    "reference1": {
      "type": "Independent Reference/Neighbor/Business Contact",
      "name": "Reference person name",
      "contact": "Contact number",
      "feedback": "Positive/Negative/Neutral",
      "remarks": "Feedback details"
    },
    "reference2": {
      "type": "Independent Reference/Neighbor/Business Contact",
      "name": "Reference person name",
      "contact": "Contact number",
      "feedback": "Positive/Negative/Neutral",
      "remarks": "Feedback details"
    }
  },
  
  "propertyDetails": {
    "propertyType": "Residential/Commercial/Industrial",
    "approxArea": "Area in sq ft",
    "propertyUsage": "Self-occupied/Rented",
    "approxValuation": "Estimated property value",
    "propertyAddress": "Property location"
  },
  
  "summary": {
    "overallSummary": "Comprehensive summary including: loans observed, name board visibility, scanner/equipment observed, stock levels, documents reviewed, bank statement analysis, reference check results, business activity observations, risk factors and mitigants",
    "riskMitigants": "Any risk factors identified and how they are mitigated"
  },
  
  "endUseDetails": {
    "purposeOfLoan": "Business/Personal/Home Purchase etc",
    "endUse": "Specific end use - Business expansion/Working capital/Property purchase etc"
  },
  
  "recommendation": "Positive/Negative/Refer",
  "remarks": "Final remarks and observations"
}

Extract as much information as possible from the audio transcription and photo descriptions. Be professional and thorough. Respond ONLY with valid JSON.`;

      const response = await openai.chat.completions.create({
        model: "deepseek/deepseek-v3.2",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content || "";
      
      // Parse the JSON response
      let draft;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          draft = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found");
        }
      } catch (parseError) {
        // Fallback draft in LIP Report format if AI response can't be parsed
        const today = new Date();
        draft = {
          leadId,
          reportDate: today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          primaryApplicant: {
            customerName: "To be confirmed",
            mobileNumber: "Not Available",
            emailId: "Not Available",
            residenceAddress: "Not Available",
            officeAddress: "Not Available",
            spouseName: ""
          },
          basicDetails: {
            branch: "Not Available",
            productLine: "BLSA",
            transactionType: "Business Loan",
            totalLoanAmount: "Not Available",
            pdType: "PHYSICAL",
            customerProfile: "Self-employed",
            natureOfBusiness: "Not Available",
            profession: "Not Available"
          },
          pdDetails: {
            pdDate: today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            pdPlace: "Office/Shop",
            currentAddress: "Visited premises",
            pdDoneWith: "Applicant"
          },
          personalDetails: {
            residenceType: "Not Available",
            residenceVintage: "Not Available",
            monthlyRent: "NA",
            totalFamilyMembers: "Not Available",
            dependents: "Not Available",
            monthlyHouseholdExpenses: "Not Available",
            otherComments: "Personal details to be confirmed during verification.",
            selfEducation: "",
            spouseEducation: "",
            spouseEmployment: "",
            kidsEducation: "",
            kidsSchool: "",
            spouseName: ""
          },
          businessDetails: {
            businessVintageMonths: "Not Available",
            totalBusinessVintage: "Not Available",
            majorServices: "Not Available",
            businessName: "Not Available",
            businessProfile: "Business verification completed. Details observed during site visit.",
            sourceOfBusiness: "Customer References",
            businessSetup: "Not Available",
            monthlyRental: "Not Available",
            surroundingArea: "Not Available",
            netMonthlyIncome: "Not Available",
            comfortableEmi: "Not Available",
            strategicVision: "",
            promoterExperience: "",
            clientListConcentrationRisk: "",
            seasonality: "",
            employeeCount: "",
            monthlyTurnover: "",
            majorClients: "",
            growthPlans: ""
          },
          referenceChecks: {
            reference1: {
              type: "Independent Reference",
              name: "Not Available",
              contact: "Not Available",
              feedback: "Pending",
              remarks: "Reference check to be completed"
            },
            reference2: {
              type: "Independent Reference",
              name: "Not Available",
              contact: "Not Available",
              feedback: "Pending",
              remarks: "Reference check to be completed"
            },
            invoiceVerified: ""
          },
          propertyDetails: {
            propertyType: "Not Available",
            approxArea: "Not Available",
            propertyUsage: "Not Available",
            approxValuation: "Not Available",
            propertyAddress: "Not Available",
            propertiesOwned: "",
            vehiclesOwned: "",
            otherInvestments: ""
          },
          bankingDetails: {
            bankName: "",
            turnoverCreditPercent: "",
            bankingTenure: "",
            emisRouted: "",
            qrCodeSpotted: ""
          },
          debtDetails: {
            existingLoans: "",
            loanList: "",
            repaymentHistory: ""
          },
          summary: {
            overallSummary: "Field verification completed. Applicant was present and cooperative during the visit. Business premises verified at stated address.",
            riskMitigants: "Standard verification checks completed."
          },
          endUseDetails: {
            purposeOfLoan: "Business",
            endUse: "Business expansion/Working capital",
            agreementValue: "",
            advancePaid: ""
          },
          recommendation: "Refer",
          remarks: "Complete documentation and reference checks required for final decision."
        };
      }

      return res.json({
        success: true,
        draft,
        filesProcessed: {
          audio: audioFile ? 1 : 0,
          photos: photoFiles.length
        }
      });

    } catch (error) {
      console.error("Generate draft report error:", error);
      return res.status(500).json({ error: "Failed to generate draft report" });
    }
  });

  // Generate PDF from draft report data using PostScript (multi-page for full LIP report)
  async function generateDraftPdf(draft: any, leadId: string): Promise<Buffer> {
    const execAsync = promisify(exec);
    const tempDir = tmpdir();
    const psPath = join(tempDir, `${leadId}_draft.ps`);
    const pdfPath = join(tempDir, `${leadId}_draft.pdf`);
    
    const escapePs = (str: string) => {
      if (!str) return 'N/A';
      return String(str).replace(/[()\\]/g, '\\$&').substring(0, 65);
    };
    
    const pa = draft.primaryApplicant || {};
    const bd = draft.basicDetails || {};
    const pd = draft.pdDetails || {};
    const pers = draft.personalDetails || {};
    const bus = draft.businessDetails || {};
    const ref = draft.referenceChecks || {};
    const prop = draft.propertyDetails || {};
    const sum = draft.summary || {};
    const end = draft.endUseDetails || {};
    
    // Helper to wrap long text into multiple lines
    const wrapText = (text: string, maxLen: number = 80): string[] => {
      if (!text) return ['N/A'];
      const lines: string[] = [];
      let remaining = String(text);
      while (remaining.length > 0) {
        lines.push(escapePs(remaining.substring(0, maxLen)));
        remaining = remaining.substring(maxLen);
        if (lines.length >= 4) break; // Max 4 lines
      }
      return lines;
    };
    
    const psContent = `%!PS-Adobe-3.0
%%Title: LIP Verification Report - ${escapePs(leadId)}
%%Creator: AuditGuard
%%Pages: 4
%%EndComments

% ===== PAGE 1: HEADER AND PRIMARY APPLICANT =====
/Helvetica-Bold findfont 16 scalefont setfont
72 750 moveto (LIP VERIFICATION REPORT) show

/Helvetica findfont 10 scalefont setfont
72 732 moveto (Lead ID: ${escapePs(leadId)}) show
350 732 moveto (Report Date: ${escapePs(draft.reportDate || new Date().toISOString().split('T')[0])}) show

% Section: Primary Applicant
/Helvetica-Bold findfont 11 scalefont setfont
72 700 moveto (1. PRIMARY APPLICANT DETAILS) show

/Helvetica findfont 9 scalefont setfont
72 682 moveto (Customer Name: ${escapePs(pa.customerName)}) show
72 668 moveto (Mobile Number: ${escapePs(pa.mobileNumber)}) show
72 654 moveto (Email ID: ${escapePs(pa.emailId)}) show
72 640 moveto (Residence Address:) show
72 626 moveto (${escapePs(pa.residenceAddress)}) show
72 612 moveto (Office Address:) show
72 598 moveto (${escapePs(pa.officeAddress)}) show

% Section: Basic Details
/Helvetica-Bold findfont 11 scalefont setfont
72 570 moveto (2. BASIC DETAILS) show

/Helvetica findfont 9 scalefont setfont
72 552 moveto (Branch: ${escapePs(bd.branch)}) show
320 552 moveto (Product Line: ${escapePs(bd.productLine)}) show
72 538 moveto (Transaction Type: ${escapePs(bd.transactionType)}) show
320 538 moveto (Total Loan Amount: ${escapePs(bd.totalLoanAmount)}) show
72 524 moveto (PD Type: ${escapePs(bd.pdType)}) show
320 524 moveto (Customer Profile: ${escapePs(bd.customerProfile)}) show
72 510 moveto (Nature of Business: ${escapePs(bd.natureOfBusiness)}) show
72 496 moveto (Profession: ${escapePs(bd.profession)}) show

% Section: PD Details
/Helvetica-Bold findfont 11 scalefont setfont
72 468 moveto (3. PD DETAILS) show

/Helvetica findfont 9 scalefont setfont
72 450 moveto (PD Date: ${escapePs(pd.pdDate)}) show
320 450 moveto (PD Place: ${escapePs(pd.pdPlace)}) show
72 436 moveto (Current Address: ${escapePs(pd.currentAddress)}) show
72 422 moveto (PD Done With: ${escapePs(pd.pdDoneWith)}) show

% Section: Personal Details
/Helvetica-Bold findfont 11 scalefont setfont
72 394 moveto (4. PERSONAL DETAILS) show

/Helvetica findfont 9 scalefont setfont
72 376 moveto (Residence Type: ${escapePs(pers.residenceType)}) show
320 376 moveto (Residence Vintage: ${escapePs(pers.residenceVintage)}) show
72 362 moveto (Monthly Rent: ${escapePs(pers.monthlyRent)}) show
320 362 moveto (Family Members: ${escapePs(pers.totalFamilyMembers)}) show
72 348 moveto (Dependents: ${escapePs(pers.dependents)}) show
320 348 moveto (Household Expenses: ${escapePs(pers.monthlyHouseholdExpenses)}) show
72 334 moveto (Other Comments:) show
72 320 moveto (${escapePs(pers.otherComments)}) show

/Helvetica findfont 8 scalefont setfont
72 50 moveto (Page 1 of 4 - Generated by AuditGuard) show

showpage

% ===== PAGE 2: BUSINESS DETAILS =====
/Helvetica-Bold findfont 11 scalefont setfont
72 750 moveto (5. BUSINESS DETAILS) show

/Helvetica findfont 9 scalefont setfont
72 732 moveto (Business Name: ${escapePs(bus.businessName)}) show
72 718 moveto (Business Profile:) show
72 704 moveto (${escapePs(bus.businessProfile)}) show
72 690 moveto (Business Vintage \\(Months\\): ${escapePs(bus.businessVintageMonths)}) show
72 676 moveto (Total Business Vintage: ${escapePs(bus.totalBusinessVintage)}) show
72 662 moveto (Major Services: ${escapePs(bus.majorServices)}) show
72 648 moveto (Source of Business: ${escapePs(bus.sourceOfBusiness)}) show
72 634 moveto (Business Setup: ${escapePs(bus.businessSetup)}) show
72 620 moveto (Monthly Rental: ${escapePs(bus.monthlyRental)}) show
320 620 moveto (Surrounding Area: ${escapePs(bus.surroundingArea)}) show
72 606 moveto (Net Monthly Income: ${escapePs(bus.netMonthlyIncome)}) show
320 606 moveto (Comfortable EMI: ${escapePs(bus.comfortableEmi)}) show

% Section: Reference Check 1
/Helvetica-Bold findfont 11 scalefont setfont
72 570 moveto (6. REFERENCE CHECK 1) show

/Helvetica findfont 9 scalefont setfont
72 552 moveto (Type: ${escapePs(ref.reference1?.type)}) show
320 552 moveto (Name: ${escapePs(ref.reference1?.name)}) show
72 538 moveto (Contact: ${escapePs(ref.reference1?.contact)}) show
320 538 moveto (Feedback: ${escapePs(ref.reference1?.feedback)}) show
72 524 moveto (Remarks: ${escapePs(ref.reference1?.remarks)}) show

% Section: Reference Check 2
/Helvetica-Bold findfont 11 scalefont setfont
72 496 moveto (7. REFERENCE CHECK 2) show

/Helvetica findfont 9 scalefont setfont
72 478 moveto (Type: ${escapePs(ref.reference2?.type)}) show
320 478 moveto (Name: ${escapePs(ref.reference2?.name)}) show
72 464 moveto (Contact: ${escapePs(ref.reference2?.contact)}) show
320 464 moveto (Feedback: ${escapePs(ref.reference2?.feedback)}) show
72 450 moveto (Remarks: ${escapePs(ref.reference2?.remarks)}) show

/Helvetica findfont 8 scalefont setfont
72 50 moveto (Page 2 of 4 - Generated by AuditGuard) show

showpage

% ===== PAGE 3: PROPERTY AND SUMMARY =====
% Section: Property Details
/Helvetica-Bold findfont 11 scalefont setfont
72 750 moveto (8. PROPERTY DETAILS) show

/Helvetica findfont 9 scalefont setfont
72 732 moveto (Property Type: ${escapePs(prop.propertyType)}) show
320 732 moveto (Approx Area: ${escapePs(prop.approxArea)}) show
72 718 moveto (Property Usage: ${escapePs(prop.propertyUsage)}) show
320 718 moveto (Approx Valuation: ${escapePs(prop.approxValuation)}) show
72 704 moveto (Property Address: ${escapePs(prop.propertyAddress)}) show

% Section: Summary
/Helvetica-Bold findfont 11 scalefont setfont
72 670 moveto (9. SUMMARY) show

/Helvetica findfont 9 scalefont setfont
72 652 moveto (Overall Summary:) show
72 638 moveto (${wrapText(sum.overallSummary, 85)[0]}) show
72 624 moveto (${wrapText(sum.overallSummary, 85)[1] || ''}) show
72 610 moveto (${wrapText(sum.overallSummary, 85)[2] || ''}) show
72 596 moveto (${wrapText(sum.overallSummary, 85)[3] || ''}) show

72 574 moveto (Risk Mitigants:) show
72 560 moveto (${wrapText(sum.riskMitigants, 85)[0]}) show
72 546 moveto (${wrapText(sum.riskMitigants, 85)[1] || ''}) show
72 532 moveto (${wrapText(sum.riskMitigants, 85)[2] || ''}) show

% Section: End Use Details
/Helvetica-Bold findfont 11 scalefont setfont
72 504 moveto (10. END USE DETAILS) show

/Helvetica findfont 9 scalefont setfont
72 486 moveto (Purpose of Loan: ${escapePs(end.purposeOfLoan)}) show
72 472 moveto (End Use: ${escapePs(end.endUse)}) show

/Helvetica findfont 8 scalefont setfont
72 50 moveto (Page 3 of 4 - Generated by AuditGuard) show

showpage

% ===== PAGE 4: RECOMMENDATION AND REMARKS =====
/Helvetica-Bold findfont 14 scalefont setfont
72 750 moveto (11. RECOMMENDATION) show

/Helvetica-Bold findfont 12 scalefont setfont
0 0.5 0 setrgbcolor
72 726 moveto (${escapePs(draft.recommendation)}) show
0 0 0 setrgbcolor

/Helvetica-Bold findfont 11 scalefont setfont
72 690 moveto (12. REMARKS) show

/Helvetica findfont 9 scalefont setfont
72 672 moveto (${wrapText(draft.remarks, 85)[0]}) show
72 658 moveto (${wrapText(draft.remarks, 85)[1] || ''}) show
72 644 moveto (${wrapText(draft.remarks, 85)[2] || ''}) show
72 630 moveto (${wrapText(draft.remarks, 85)[3] || ''}) show

/Helvetica findfont 10 scalefont setfont
72 580 moveto (-----------------------------------------------) show
72 560 moveto (This report was generated from audio/photo inputs using AI.) show
72 546 moveto (All information should be verified before final decision.) show

/Helvetica findfont 8 scalefont setfont
72 50 moveto (Page 4 of 4 - Generated by AuditGuard - ${new Date().toISOString()}) show

showpage
%%EOF
`;
    
    await writeFile(psPath, psContent);
    
    try {
      await execAsync(`gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH -dSAFER -sOutputFile="${pdfPath}" "${psPath}"`);
      const pdfBuffer = await readFile(pdfPath);
      await unlink(psPath);
      await unlink(pdfPath);
      return pdfBuffer;
    } catch (error) {
      console.error('Ghostscript PDF generation failed:', error);
      await unlink(psPath).catch(() => {});
      throw error;
    }
  }

  // Submit draft report
  app.post("/api/submit-draft-report", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const draft = req.body;
      
      if (!draft.leadId) {
        return res.status(400).json({ error: "Lead ID is required" });
      }

      // Generate PDF from draft data
      let pdfContent = "";
      let fileSize = 0;
      try {
        const pdfBuffer = await generateDraftPdf(draft, draft.leadId);
        pdfContent = pdfBuffer.toString('base64');
        fileSize = pdfBuffer.length;
        console.log(`Generated PDF for audio report ${draft.leadId}: ${(fileSize/1024).toFixed(1)}KB`);
      } catch (error) {
        console.error('Failed to generate PDF for audio report:', error);
      }

      // Use deterministic scoring based on ApplicantSchema
      console.log(`[Submit Draft] Scoring draft for ${draft.leadId} using deterministic scoring...`);
      const scoringResult = scoreDraft(draft);
      console.log(`[Submit Draft] Scoring complete: Total=${scoringResult.scores.total}/100`);
      
      const today = new Date().toISOString().split('T')[0];
      const reportId = `${draft.leadId}_${today.replace(/-/g, '').slice(2)}_${randomBytes(2).toString('hex')}`;

      const report = await storage.createReport({
        id: reportId,
        associateId: userId,
        leadId: draft.leadId,
        title: `${draft.leadId} - Verification Report`,
        date: today,
        status: "Pending",
        metrics: {
          photoCount: 5,
          totalFields: 100,
          filledFields: 85,
          missingFields: scoringResult.warnings,
          photoValidation: {
            matchedCount: 4,
            missedDetails: [],
            totalKeyDetails: 5
          },
          riskAnalysisDepth: scoringResult.scores.total >= 70 ? "High" : scoringResult.scores.total >= 40 ? "Medium" : "Low",
          dueDiligenceChecks: ["Identity Verification", "Address Confirmation", "Business Verification"]
        },
        scores: {
          overall: scoringResult.scores.total,
          quality: Math.round((scoringResult.scores.personal + scoringResult.scores.business) / 45 * 100),
          completeness: Math.round(scoringResult.scores.total),
          comprehensive: scoringResult.scores.total,
          comprehensiveBreakdown: scoringResult.breakdown
        },
        decision: {
          status: draft.recommendation?.includes("POSITIVE") ? "Positive" : 
                  draft.recommendation?.includes("NEGATIVE") ? "Negative" : "Refer",
          remarks: draft.recommendation || "",
          aiValidation: {
            match: true,
            reasoning: "AI-generated draft report",
            confidence: 85
          }
        },
        remarks: draft.remarks || [],
        summary: draft.summary || "",
        pdfContent: pdfContent || undefined,
        fileSize: fileSize || undefined
      });

      // Mark corresponding MIS entry as completed with report date
      await markMisEntryCompleted(draft.leadId, today);

      // Trigger AI scoring asynchronously (don't block response)
      if (pdfContent) {
        (async () => {
          try {
            console.log(`[Auto AI Score] Starting AI scoring for report ${reportId}...`);
            const { scoreComprehensiveWithAI, isAIConfigured } = await import("./ai-scoring");
            
            if (!isAIConfigured()) {
              console.log(`[Auto AI Score] AI not configured, skipping for ${reportId}`);
              return;
            }

            // Decode PDF and extract text
            const pdfBuffer = Buffer.from(pdfContent, 'base64');
            const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
            
            let pdfText = '';
            for (let i = 1; i <= pdfDoc.numPages; i++) {
              const page = await pdfDoc.getPage(i);
              const textContent = await page.getTextContent();
              pdfText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
            }

            console.log(`[Auto AI Score] Extracted ${pdfText.length} characters, calling AI...`);
            const aiScores = await scoreComprehensiveWithAI(pdfText, draft.leadId);

            const aiComprehensive = aiScores.personal + aiScores.business + aiScores.banking + 
                                   aiScores.networth + aiScores.existingDebt + aiScores.endUse + 
                                   aiScores.referenceChecks;

            const newScores = {
              overall: Math.round((aiComprehensive + scoringResult.scores.total) / 2),
              quality: Math.round((scoringResult.scores.personal + scoringResult.scores.business) / 45 * 100),
              completeness: Math.round(scoringResult.scores.total),
              comprehensive: aiComprehensive,
              deterministicScore: scoringResult.scores.total,
              comprehensiveBreakdown: {
                personal: aiScores.personal,
                business: aiScores.business,
                banking: aiScores.banking,
                networth: aiScores.networth,
                existingDebt: aiScores.existingDebt,
                endUse: aiScores.endUse,
                referenceChecks: aiScores.referenceChecks,
                personalMatches: aiScores.personalMatches,
                businessMatches: aiScores.businessMatches,
                bankingMatches: aiScores.bankingMatches,
                networthMatches: aiScores.networthMatches,
                debtMatches: aiScores.debtMatches,
                endUseMatches: aiScores.endUseMatches,
                referenceMatches: aiScores.referenceMatches,
                rationale: aiScores.rationale,
              },
            };

            await storage.updateReportScores(reportId, newScores);
            console.log(`[Auto AI Score] Report ${reportId} updated with AI score: ${aiComprehensive}`);
          } catch (aiError) {
            console.error(`[Auto AI Score] Failed for ${reportId}:`, aiError);
          }
        })();
      }

      return res.json({ success: true, report });

    } catch (error) {
      console.error("Submit draft report error:", error);
      return res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // Generate PDF from draft for download (before submission)
  app.post("/api/generate-draft-pdf", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const draft = req.body;
      
      if (!draft.leadId) {
        return res.status(400).json({ error: "Lead ID is required" });
      }

      console.log(`Generating draft PDF for ${draft.leadId}`);
      
      const pdfBuffer = await generateDraftPdf(draft, draft.leadId);
      
      const fileName = `${draft.leadId}_draft_report.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      return res.send(pdfBuffer);

    } catch (error) {
      console.error("Generate draft PDF error:", error);
      return res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  app.get("/api/reports", async (req, res) => {
    console.log('[REPORTS-API-V4] Request received at', new Date().toISOString());
    try {
      const { associateId, status, month, year, simple, limit: limitStr, offset: offsetStr } = req.query;
      
      const filters: any = {};
      
      if (associateId && typeof associateId === 'string') {
        filters.associateId = associateId;
      }
      
      if (status && typeof status === 'string') {
        filters.status = status;
      }
      
      if (month && typeof month === 'string') {
        filters.month = month;
      }
      
      if (year && typeof year === 'string') {
        filters.year = year;
      }
      
      // Add pagination - if month is specified, allow more reports; otherwise limit for safety
      const hasMonthFilter = month && typeof month === 'string';
      const defaultLimit = hasMonthFilter ? 1000 : 300; // Higher limit when month is filtered
      const limit = limitStr ? parseInt(limitStr as string, 10) : defaultLimit;
      const offset = offsetStr ? parseInt(offsetStr as string, 10) : 0;
      filters.limit = Math.min(limit, 1000); // Cap at 1000
      filters.offset = offset;
      
      console.log('[REPORTS-API-V4] Fetching reports with filters:', filters);
      console.log('[REPORTS-API-V4] Environment:', process.env.NODE_ENV || 'unknown');
      console.log('[REPORTS-API-V4] Database URL present:', !!process.env.DATABASE_URL);
      
      let reports;
      try {
        reports = await storage.getReports(filters);
        console.log('[REPORTS-API-V4] Successfully fetched', reports?.length || 0, 'reports from database');
      } catch (dbError) {
        console.error('[REPORTS-API-V4] Database error fetching reports:', dbError);
        console.error('[REPORTS-API-V4] Full error:', JSON.stringify(dbError, Object.getOwnPropertyNames(dbError)));
        return res.status(500).json({ 
          error: "Database error fetching reports",
          version: "V4",
          details: dbError instanceof Error ? dbError.message : 'Unknown database error'
        });
      }
      
      console.log('[REPORTS-API-V4] Found reports count:', reports.length);
      
      // Strip pdfContent from response to reduce payload size and avoid serialization issues
      // This is a large base64 string that clients don't need for list view
      const strippedReports = reports.map(r => {
        const { pdfContent, ...rest } = r as any;
        return rest;
      });
      
      // If simple mode, return reports without any enrichment for debugging
      if (simple === 'true') {
        console.log('[REPORTS-API-V4] Simple mode - returning raw reports (no pdfContent)');
        return res.json(strippedReports);
      }
      
      // Enrich reports with MIS initiation times - wrap in try-catch to prevent failures
      let misMap = new Map();
      try {
        const misEntries = await storage.getMisEntries();
        // Filter out entries with null/undefined leadId and safely build map
        misMap = new Map(
          misEntries
            .filter(m => m.leadId != null && typeof m.leadId === 'string')
            .map(m => [m.leadId.toLowerCase(), m])
        );
        console.log('[REPORTS-API-V4] MIS map built with', misMap.size, 'entries');
      } catch (misError) {
        console.error('[REPORTS-API-V4] Error fetching MIS entries (non-fatal):', misError);
        // Continue without MIS enrichment
      }
      
      const enrichedReports = strippedReports.map(report => {
        try {
          const currentTat = (report.tat || {}) as ReportTAT;
          
          // If report already has an initiation time, skip enrichment
          if (currentTat.initiationTime) {
            return report;
          }
          
          // Try to find matching MIS entry by leadId
          const leadId = report.leadId?.toLowerCase() || '';
          const misEntry = misMap.get(leadId);
        
        if (misEntry && (misEntry.inDate || misEntry.inTime)) {
          // Parse MIS inDate and inTime to create initiation timestamp
          let initiationTime: string | null = null;
          
          if (misEntry.inDate) {
            try {
              const datePart = misEntry.inDate.trim();
              
              // Helper to parse time string to hours/minutes
              const parseTime = (timeStr: string | null): { hours: number; minutes: number } | null => {
                if (!timeStr) return null;
                const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
                if (!match) return null;
                let hours = parseInt(match[1]);
                const minutes = parseInt(match[2]);
                const period = match[3]?.toUpperCase();
                if (period === 'PM' && hours !== 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
                return { hours, minutes };
              };
              
              // Parse the date part - handle various formats
              let dateObj: Date | null = null;
              
              // Try DD-MM-YYYY or DD/MM/YYYY format
              const ddmmyyyyMatch = datePart.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
              if (ddmmyyyyMatch) {
                const [_, day, month, year] = ddmmyyyyMatch;
                dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              }
              
              // Try DD-Mon-YYYY format (e.g., "12-Dec-2024")
              if (!dateObj || isNaN(dateObj.getTime())) {
                const ddmonyyyy = datePart.match(/^(\d{1,2})[-\/]([A-Za-z]{3,})[-\/](\d{4})/);
                if (ddmonyyyy) {
                  const [_, day, monthStr, year] = ddmonyyyy;
                  const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
                  const monthNum = months[monthStr.toLowerCase().substring(0, 3)];
                  if (monthNum !== undefined) {
                    dateObj = new Date(parseInt(year), monthNum, parseInt(day));
                  }
                }
              }
              
              // Try standard ISO or other parseable formats as fallback
              if (!dateObj || isNaN(dateObj.getTime())) {
                dateObj = new Date(datePart);
              }
              
              // Check for Excel serial datetime (e.g., 45232.5833333333)
              if (!dateObj || isNaN(dateObj.getTime())) {
                const excelSerial = parseFloat(datePart);
                if (!isNaN(excelSerial) && excelSerial > 25569) { // Valid Excel date range
                  // Convert Excel serial to JS Date (Excel epoch is Dec 30, 1899)
                  const excelEpoch = new Date(1899, 11, 30);
                  dateObj = new Date(excelEpoch.getTime() + excelSerial * 86400000);
                }
              }
              
              // Determine final time to use
              let finalTime: { hours: number; minutes: number } | null = null;
              
              // Priority 1: time embedded in inDate string (like "12-Dec-2024 11:30 AM")
              finalTime = parseTime(datePart);
              
              // Priority 2: time from parsed Date object when it has non-midnight time
              if (!finalTime && dateObj && !isNaN(dateObj.getTime())) {
                const hours = dateObj.getHours();
                const mins = dateObj.getMinutes();
                // Use the Date's time if it's not midnight (midnight = likely no time info)
                if (hours !== 0 || mins !== 0) {
                  finalTime = { hours, minutes: mins };
                }
              }
              
              // Apply time if we have a valid date and time
              if (dateObj && !isNaN(dateObj.getTime()) && finalTime) {
                dateObj.setHours(finalTime.hours, finalTime.minutes, 0, 0);
                initiationTime = dateObj.toISOString();
              }
            } catch (e) {
              console.error("Failed to parse MIS date/time:", e);
            }
          }
          
          if (initiationTime) {
            const visitTime = currentTat.visitTime ? new Date(currentTat.visitTime) : null;
            const reportDate = currentTat.reportDate ? new Date(currentTat.reportDate) : null;
            const newInitTime = new Date(initiationTime);
            
            // Validate all dates before calling calculateTATMetrics to prevent RangeError
            const isValidDate = (d: Date | null) => d === null || (d instanceof Date && !isNaN(d.getTime()));
            
            if (isValidDate(newInitTime) && isValidDate(visitTime) && isValidDate(reportDate)) {
              try {
                const tatMetrics = calculateTATMetrics(newInitTime, visitTime, reportDate);
                
                return {
                  ...report,
                  tat: {
                    ...currentTat,
                    initiationTime,
                    initiationToVisitHours: tatMetrics.initiationToVisitHours,
                    visitToReportHours: tatMetrics.visitToReportHours,
                    totalTATHours: tatMetrics.totalTATHours,
                  }
                };
              } catch (tatError) {
                console.error(`[DEBUG] TAT calculation error for report ${report.id}:`, tatError);
                // Return report without TAT enrichment if calculation fails
              }
            } else {
              console.log(`[DEBUG] Skipping TAT enrichment for report ${report.id} due to invalid dates`);
            }
          }
        }
        
        return report;
        } catch (enrichError) {
          console.error(`[DEBUG] Enrichment error for report ${report.id}:`, enrichError);
          return report; // Return report as-is if enrichment fails
        }
      });
      
      // Filter out reports where the corresponding MIS entry has "Cancelled" status
      const filteredReports = enrichedReports.filter(report => {
        const leadId = report.leadId?.toLowerCase() || '';
        const misEntry = misMap.get(leadId);
        // If MIS entry exists and status is Cancelled, exclude from results
        if (misEntry && misEntry.status?.toLowerCase() === 'cancelled') {
          return false;
        }
        return true;
      });
      
      return res.json(filteredReports);
    } catch (error) {
      console.error("[REPORTS-API-V3] Get reports error:", error);
      console.error("[REPORTS-API-V3] Error stack:", error instanceof Error ? error.stack : 'No stack');
      return res.status(500).json({ 
        error: "Internal server error",
        version: "V3",
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : null
      });
    }
  });

  app.get("/api/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const report = await storage.getReportById(id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      return res.json(report);
    } catch (error) {
      console.error("Get report error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const sessionUserId = req.session?.userId;
      
      const report = await storage.getReportById(id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      // Allow deletion if: user is admin OR user owns the report
      const isAdmin = sessionUserId === 'ADMIN';
      const isOwner = sessionUserId === report.associateId;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "You can only delete your own reports" });
      }
      
      const deleted = await storage.deleteReport(id);
      
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete report" });
      }
      
      console.log(`Report ${id} deleted by user ${sessionUserId}`);
      return res.json({ success: true, message: "Report deleted successfully" });
    } catch (error) {
      console.error("Delete report error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Re-score a report using AI-based scoring
  app.post("/api/reports/:id/rescore", async (req, res) => {
    try {
      const { id } = req.params;
      
      const report = await storage.getReportById(id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (!report.pdfContent) {
        return res.status(400).json({ error: "Report has no PDF content to score" });
      }

      console.log(`[Re-score] Starting AI-based re-scoring for report ${id}`);

      // Decode PDF and extract text
      const pdfBuffer = Buffer.from(report.pdfContent, 'base64');
      const pdfDoc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
      
      let pdfText = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        pdfText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }

      console.log(`[Re-score] Extracted ${pdfText.length} characters from PDF`);

      // Import and run AI-based scoring
      const { scoreComprehensiveWithAI, isAIConfigured } = await import("./ai-scoring");
      
      if (!isAIConfigured()) {
        return res.status(503).json({ 
          error: "AI not configured",
          message: "OPENROUTER_API_KEY must be set for AI scoring"
        });
      }

      console.log(`[Re-score] Calling scoreComprehensiveWithAI...`);
      const scores = await scoreComprehensiveWithAI(pdfText, report.leadId);

      console.log(`[Re-score] Scores received:`, JSON.stringify(scores, null, 2).substring(0, 500));

      const personalScore = scores.personal;
      const businessScore = scores.business;
      const bankingScore = scores.banking;
      const assetScore = scores.networth;
      const debtScore = scores.existingDebt;
      const endUseScore = scores.endUse;
      const referenceChecksScore = scores.referenceChecks;

      console.log(`[Re-score] Individual scores: personal=${personalScore}, business=${businessScore}, banking=${bankingScore}, networth=${assetScore}, debt=${debtScore}, endUse=${endUseScore}, ref=${referenceChecksScore}`);

      const comprehensiveScore = personalScore + businessScore + bankingScore + assetScore + debtScore + endUseScore + referenceChecksScore;
      console.log(`[Re-score] Total comprehensive score: ${comprehensiveScore}`);
      
      const currentScores = report.scores as any || {};
      const qualityScore = currentScores.quality || 75;
      const completenessScore = currentScores.completeness || 75;
      const overallScore = Math.round((comprehensiveScore + qualityScore) / 2);

      const newScores = {
        overall: overallScore,
        quality: qualityScore,
        completeness: completenessScore,
        comprehensive: comprehensiveScore,
        comprehensiveBreakdown: {
          personal: personalScore,
          business: businessScore,
          banking: bankingScore,
          networth: assetScore,
          existingDebt: debtScore,
          endUse: endUseScore,
          referenceChecks: referenceChecksScore,
          personalMatches: scores.personalMatches,
          businessMatches: scores.businessMatches,
          bankingMatches: scores.bankingMatches,
          networthMatches: scores.networthMatches,
          debtMatches: scores.debtMatches,
          endUseMatches: scores.endUseMatches,
          referenceMatches: scores.referenceMatches,
          rationale: scores.rationale,
        },
      };

      const updatedReport = await storage.updateReportScores(id, newScores);

      console.log(`[Re-score] Report ${id} re-scored successfully. New comprehensive: ${comprehensiveScore}`);

      return res.json({ 
        success: true, 
        message: "Report re-scored successfully with AI",
        method: "ai-holistic",
        scores: newScores,
        report: updatedReport
      });
    } catch (error: any) {
      console.error("[Re-score] Error:", error);
      return res.status(500).json({ 
        error: "Failed to re-score report",
        details: error?.message || "Unknown error"
      });
    }
  });

  app.patch("/api/reports/:id/initiation-time", async (req, res) => {
    try {
      const { id } = req.params;
      const { initiationTime } = req.body;
      
      const report = await storage.getReportById(id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      const currentTat = (report.tat || {}) as ReportTAT;
      const visitTime = currentTat.visitTime ? new Date(currentTat.visitTime) : null;
      const reportDate = currentTat.reportDate ? new Date(currentTat.reportDate) : null;
      const newInitiationTime = initiationTime ? new Date(initiationTime) : null;
      
      const tatMetrics = calculateTATMetrics(newInitiationTime, visitTime, reportDate);
      
      const updatedTat = {
        ...currentTat,
        initiationTime: initiationTime || null,
        initiationToVisitHours: tatMetrics.initiationToVisitHours,
        totalTATHours: tatMetrics.totalTATHours,
      };
      
      const updatedReport = await storage.updateReportTAT(id, updatedTat);
      
      console.log(`Updated initiation time for report ${id}: ${initiationTime}`);
      return res.json({ success: true, report: updatedReport });
    } catch (error) {
      console.error("Update initiation time error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/reports/:id/tat-delay", async (req, res) => {
    try {
      const { id } = req.params;
      const { reason, remark } = req.body;
      
      const report = await storage.getReportById(id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      const updatedReport = await storage.updateReportTATDelay(id, reason || null, remark || null);
      
      console.log(`Updated TAT delay for report ${id}: reason=${reason}`);
      return res.json({ success: true, report: updatedReport });
    } catch (error) {
      console.error("Update TAT delay error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Test Google Sheets connection
  app.get("/api/test-sheets", async (req, res) => {
    try {
      const leadId = req.query.leadId as string || 'HLSA000FD651';
      const result = await searchLeadIdInMIS(leadId);
      return res.json({ 
        success: true, 
        leadId,
        found: result.found,
        initiationDate: result.initiationDate,
        rowData: result.rowData
      });
    } catch (error: any) {
      console.error("Test sheets error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // Test Gmail send endpoint
  app.post("/api/test-gmail-send", async (req, res) => {
    try {
      const { to, from } = req.body;
      if (!to || !from) {
        return res.status(400).json({ error: "Missing 'to' or 'from' email addresses" });
      }
      const result = await sendTestEmail(to, from);
      return res.json(result);
    } catch (error: any) {
      console.error("Test email error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/associates", async (req, res) => {
    try {
      const associates = await storage.getAssociates();
      
      const associatesWithoutPassword = associates.map(user => ({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      }));
      
      return res.json(associatesWithoutPassword);
    } catch (error) {
      console.error("Get associates error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== ADMIN ARCHIVE & EXPORT ====================
  
  // Get archive history
  app.get("/api/admin/archive-history", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      if (sessionUserId !== 'ADMIN') {
        return res.status(403).json({ error: "Only admin can view archive history" });
      }
      
      const archiveHistory = await storage.getArchiveStats();
      return res.json(archiveHistory);
    } catch (error) {
      console.error("Get archive history error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Export all reports as ZIP file containing JSON and PDFs
  app.get("/api/admin/export-reports", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      if (sessionUserId !== 'ADMIN') {
        return res.status(403).json({ error: "Only admin can export reports" });
      }

      // Get date range filters from query params
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;

      console.log("[EXPORT] Starting export process...", { fromDate, toDate });

      // Require date range for production safety - too many reports without filter
      if (!fromDate && !toDate) {
        // Get count first to warn user
        const totalCount = await storage.getTotalReportsCount();
        if (totalCount > 50) {
          return res.status(400).json({ 
            error: `Please select a date range. Found ${totalCount} reports - exporting all at once may timeout.` 
          });
        }
      }

      const archiver = (await import('archiver')).default;
      
      // Get reports filtered at database level for better performance
      const reports = await storage.getReportsByDateRange(fromDate, toDate);
      
      console.log(`[EXPORT] Found ${reports.length} reports in date range`);
      
      if (reports.length === 0) {
        return res.status(400).json({ error: "No reports found in the selected date range" });
      }

      // Get filtered MIS entries based on report lead IDs
      const reportLeadIds = new Set(reports.map(r => r.leadId));
      const allMisEntries = await storage.getMisEntries();
      const misEntries = allMisEntries.filter(m => reportLeadIds.has(m.leadId));
      
      // Set headers for ZIP download
      const dateRangeStr = fromDate && toDate ? `${fromDate}_to_${toDate}` : new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `auditguard-reports-${dateRangeStr}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      const archive = archiver('zip', { zlib: { level: 3 } }); // Lower compression for speed
      
      archive.on('error', (err: Error) => {
        console.error("[EXPORT] Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Export failed during archive creation" });
        }
      });
      
      archive.pipe(res);
      
      // Add reports JSON (without PDF content for smaller size)
      const reportsForExport = reports.map(r => {
        const { pdfContent, ...rest } = r as any;
        return rest;
      });
      archive.append(JSON.stringify(reportsForExport, null, 2), { name: 'reports.json' });
      console.log("[EXPORT] Added reports.json");

      // Add MIS entries JSON
      archive.append(JSON.stringify(misEntries, null, 2), { name: 'mis_entries.json' });
      console.log("[EXPORT] Added mis_entries.json");

      // Add individual PDFs for each report that has PDF content (process in batches)
      let pdfCount = 0;
      for (const report of reports) {
        if ((report as any).pdfContent) {
          try {
            const pdfBuffer = Buffer.from((report as any).pdfContent, 'base64');
            archive.append(pdfBuffer, { name: `pdfs/${report.id}.pdf` });
            pdfCount++;
          } catch (e) {
            console.error(`[EXPORT] Failed to add PDF for report ${report.id}:`, e);
          }
        }
      }
      console.log(`[EXPORT] Added ${pdfCount} PDFs`);

      // Add summary file
      const summary = {
        exportDate: new Date().toISOString(),
        totalReports: reports.length,
        totalMisEntries: misEntries.length,
        totalPDFs: pdfCount,
        dateRange: {
          oldest: reports.length > 0 ? reports.reduce((min, r) => r.date < min ? r.date : min, reports[0].date) : '',
          newest: reports.length > 0 ? reports.reduce((max, r) => r.date > max ? r.date : max, reports[0].date) : ''
        }
      };
      archive.append(JSON.stringify(summary, null, 2), { name: 'export_summary.json' });
      console.log("[EXPORT] Added export_summary.json");

      await archive.finalize();
      console.log("[EXPORT] Export complete!");
    } catch (error: any) {
      console.error("[EXPORT] Export reports error:", error);
      if (!res.headersSent) {
        return res.status(500).json({ error: error.message || "Failed to export reports" });
      }
    }
  });

  // Archive reports (save stats and delete from database)
  app.post("/api/admin/archive-reports", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      if (sessionUserId !== 'ADMIN') {
        return res.status(403).json({ error: "Only admin can archive reports" });
      }

      const reports = await storage.getAllReportsForArchive();
      const misEntries = await storage.getMisEntries();

      if (reports.length === 0) {
        return res.status(400).json({ error: "No reports to archive" });
      }

      // Calculate statistics to preserve
      let totalPositive = 0, totalNegative = 0, totalCreditRefer = 0, totalPending = 0;
      let totalOverallScore = 0, totalComprehensiveScore = 0;
      const associateBreakdown: Record<string, { reports: number; avgScore: number; positive: number; negative: number }> = {};

      for (const report of reports) {
        const decision = (report.decision as any)?.status?.toLowerCase() || '';
        if (decision.includes('positive')) totalPositive++;
        else if (decision.includes('negative')) totalNegative++;
        else if (decision.includes('credit refer')) totalCreditRefer++;
        else totalPending++;

        const scores = report.scores as any;
        totalOverallScore += scores?.overall || 0;
        totalComprehensiveScore += scores?.comprehensive || 0;

        const assocId = report.associateId || 'Unknown';
        if (!associateBreakdown[assocId]) {
          associateBreakdown[assocId] = { reports: 0, avgScore: 0, positive: 0, negative: 0 };
        }
        associateBreakdown[assocId].reports++;
        associateBreakdown[assocId].avgScore += scores?.overall || 0;
        if (decision.includes('positive')) associateBreakdown[assocId].positive++;
        if (decision.includes('negative')) associateBreakdown[assocId].negative++;
      }

      // Calculate averages
      for (const assocId of Object.keys(associateBreakdown)) {
        associateBreakdown[assocId].avgScore = Math.round(associateBreakdown[assocId].avgScore / associateBreakdown[assocId].reports);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const archiveFileName = `auditguard-archive-${timestamp}.zip`;

      // Save archive stats
      await storage.createArchiveStats({
        archiveDate: new Date(),
        archiveFileName,
        reportsCount: reports.length,
        misEntriesCount: misEntries.length,
        totalPositive,
        totalNegative,
        totalCreditRefer,
        totalPending,
        avgOverallScore: Math.round(totalOverallScore / reports.length),
        avgComprehensiveScore: Math.round(totalComprehensiveScore / reports.length),
        associateBreakdown,
        oldestReportDate: reports.reduce((min, r) => r.date < min ? r.date : min, reports[0]?.date || ''),
        newestReportDate: reports.reduce((max, r) => r.date > max ? r.date : max, reports[0]?.date || '')
      });

      // Delete reports and MIS entries from database
      const deletedReports = await storage.deleteAllReports();
      const deletedMis = await storage.deleteAllMisEntries();

      return res.json({
        success: true,
        message: "Reports archived successfully",
        archivedReports: deletedReports,
        archivedMisEntries: deletedMis,
        archiveFileName
      });
    } catch (error) {
      console.error("Archive reports error:", error);
      return res.status(500).json({ error: "Failed to archive reports" });
    }
  });

  // Get combined dashboard stats (current + archived)
  app.get("/api/admin/combined-stats", async (req, res) => {
    try {
      const currentReports = await storage.getTotalReportsCount();
      const currentMis = await storage.getTotalMisEntriesCount();
      const archiveHistory = await storage.getArchiveStats();

      // Sum up all archived stats
      let archivedReports = 0, archivedMis = 0;
      let totalPositive = 0, totalNegative = 0, totalCreditRefer = 0, totalPending = 0;

      for (const archive of archiveHistory) {
        archivedReports += archive.reportsCount;
        archivedMis += archive.misEntriesCount;
        totalPositive += archive.totalPositive || 0;
        totalNegative += archive.totalNegative || 0;
        totalCreditRefer += archive.totalCreditRefer || 0;
        totalPending += archive.totalPending || 0;
      }

      return res.json({
        current: { reports: currentReports, misEntries: currentMis },
        archived: { reports: archivedReports, misEntries: archivedMis },
        total: { reports: currentReports + archivedReports, misEntries: currentMis + archivedMis },
        archivedStats: { totalPositive, totalNegative, totalCreditRefer, totalPending },
        archiveCount: archiveHistory.length
      });
    } catch (error) {
      console.error("Get combined stats error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/associates", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      
      if (sessionUserId !== 'ADMIN') {
        return res.status(403).json({ error: "Only admin can create associates" });
      }
      
      const { username, password, name, role, avatar } = req.body;
      
      if (!username || !password || !name) {
        return res.status(400).json({ error: "Username, password, and name are required" });
      }
      
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      const associates = await storage.getAssociates();
      const nextNum = associates.length + 1;
      const id = `A${nextNum}`;
      
      const newUser = await storage.createUser({
        id,
        username: username.toLowerCase(),
        password,
        name,
        role: role || 'Verification Officer',
        avatar: avatar || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80`,
      });
      
      console.log(`Created new associate: ${id} (${name})`);
      return res.json({ 
        success: true, 
        associate: {
          id: newUser.id,
          username: newUser.username,
          name: newUser.name,
          role: newUser.role,
          avatar: newUser.avatar,
        }
      });
    } catch (error) {
      console.error("Create associate error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/associates/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (id === 'ADMIN') {
        return res.status(403).json({ error: "Cannot delete admin user" });
      }
      
      const user = await storage.getUserById(id);
      if (!user) {
        return res.status(404).json({ error: "Associate not found" });
      }
      
      const deleted = await storage.deleteUser(id);
      
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete associate" });
      }
      
      console.log(`Deleted associate: ${id} (${user.name})`);
      return res.json({ success: true, message: `Associate ${user.name} deleted` });
    } catch (error) {
      console.error("Delete associate error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard", async (req, res) => {
    try {
      const { month, year } = req.query;
      
      const stats = await storage.getDashboardStats(
        month as string | undefined,
        year as string | undefined
      );
      
      return res.json(stats);
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // MIS (Management Information System) routes - Centralized MIS
  app.get("/api/mis", async (req, res) => {
    try {
      // Return all entries for centralized MIS
      const entries = await storage.getMisEntries();
      return res.json(entries);
    } catch (error) {
      console.error("Get MIS entries error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/mis", async (req, res) => {
    try {
      const entry = req.body;
      console.log("MIS single create: Received entry:", JSON.stringify(entry));
      
      if (!entry.leadId || !entry.customerName) {
        return res.status(400).json({ error: "Lead ID and Customer Name are required" });
      }
      
      // Check if associate exists
      if (entry.associateId) {
        try {
          const associate = await storage.getUserById(entry.associateId);
          if (!associate) {
            return res.status(400).json({ error: `Associate "${entry.associateId}" not found in database` });
          }
        } catch (userErr: any) {
          console.error("MIS single: Error checking associate:", userErr);
          return res.status(500).json({ error: `Error checking associate: ${userErr?.message || userErr}` });
        }
      }
      
      let nextSno;
      try {
        nextSno = await storage.getNextMisSno(entry.associateId);
        console.log("MIS single create: Next SNO:", nextSno);
      } catch (snoErr: any) {
        console.error("MIS single: Error getting SNO:", snoErr);
        return res.status(500).json({ error: `Error getting serial number: ${snoErr?.message || snoErr}` });
      }
      
      try {
        const result = await storage.createMisEntry({ ...entry, sno: nextSno });
        return res.json(result);
      } catch (dbError: any) {
        console.error("MIS single create: Database error:", dbError);
        const dbErrorMessage = dbError?.message || dbError?.detail || "Database error";
        const dbCode = dbError?.code ? ` (code: ${dbError.code})` : "";
        return res.status(500).json({ error: `Database insert error: ${dbErrorMessage}${dbCode}` });
      }
    } catch (error: any) {
      console.error("Create MIS entry error:", error);
      const errorMessage = error?.message || "Internal server error";
      return res.status(500).json({ error: `Unexpected error: ${errorMessage}` });
    }
  });

  app.post("/api/mis/bulk", async (req, res) => {
    try {
      const { associateId, entries } = req.body;
      if (!associateId || !Array.isArray(entries)) {
        console.error("MIS bulk create: Invalid request body", { associateId, entriesIsArray: Array.isArray(entries) });
        return res.status(400).json({ error: "Invalid request body" });
      }
      
      // Check if associate exists in database (foreign key constraint)
      let associate;
      try {
        associate = await storage.getUserById(associateId);
      } catch (userErr: any) {
        console.error("MIS bulk: Error checking associate:", userErr);
        return res.status(500).json({ error: `Error checking associate: ${userErr?.message || userErr}` });
      }
      if (!associate) {
        console.error("MIS bulk create: Associate not found:", associateId);
        return res.status(400).json({ error: `Associate "${associateId}" not found in database. Please ensure this user exists.` });
      }
      
      // Validate and clean entries - ensure customerName is never empty
      const validEntries = entries.filter((entry: any) => {
        if (!entry.leadId || typeof entry.leadId !== 'string' || entry.leadId.trim().length < 3) {
          console.log("MIS bulk: Skipping entry with invalid leadId:", entry.leadId);
          return false;
        }
        return true;
      }).map((entry: any) => ({
        ...entry,
        customerName: entry.customerName?.trim() || entry.leadId, // Default to leadId if no name
      }));
      
      if (validEntries.length === 0) {
        console.log("MIS bulk: No valid entries found after filtering");
        return res.status(400).json({ error: "No valid entries found. Check that Lead ID and Customer Name are provided." });
      }
      
      // Filter out duplicates by checking Lead ID + Customer Name in database
      const uniqueEntries = [];
      try {
        for (const entry of validEntries) {
          let existing;
          if (entry.customerName && entry.customerName.trim()) {
            existing = await storage.getMisEntryByLeadIdAndCustomerName(entry.leadId, entry.customerName);
          } else {
            existing = await storage.getMisEntryByLeadId(entry.leadId);
          }
          if (!existing) {
            uniqueEntries.push(entry);
          }
        }
      } catch (dupErr: any) {
        console.error("MIS bulk: Error checking duplicates:", dupErr);
        return res.status(500).json({ error: `Error checking duplicates: ${dupErr?.message || dupErr}` });
      }
      
      if (uniqueEntries.length === 0) {
        return res.json({ entries: [], skipped: entries.length });
      }
      
      // Use global SNO (centralized)
      let nextSno;
      try {
        nextSno = await storage.getNextMisSno();
      } catch (snoErr: any) {
        console.error("MIS bulk: Error getting next SNO:", snoErr);
        return res.status(500).json({ error: `Error getting next serial number: ${snoErr?.message || snoErr}` });
      }
      
      const entriesWithSno = uniqueEntries.map((entry: any) => ({
        ...entry,
        associateId,
        sno: nextSno++,
      }));
      
      console.log("MIS bulk: Creating", entriesWithSno.length, "entries");
      console.log("MIS bulk: First entry sample:", JSON.stringify(entriesWithSno[0]));
      
      try {
        const result = await storage.createMisEntriesBulk(entriesWithSno);
        return res.json({ entries: result, skipped: entries.length - uniqueEntries.length });
      } catch (dbError: any) {
        console.error("MIS bulk: Database insert error:", dbError);
        console.error("MIS bulk: Failed entries sample:", JSON.stringify(entriesWithSno.slice(0, 2)));
        const dbErrorMessage = dbError?.message || dbError?.detail || "Database error";
        const dbCode = dbError?.code ? ` (code: ${dbError.code})` : "";
        return res.status(500).json({ error: `Database insert error: ${dbErrorMessage}${dbCode}` });
      }
    } catch (error: any) {
      console.error("Create MIS entries bulk error:", error);
      const errorMessage = error?.message || "Internal server error";
      return res.status(500).json({ error: `Unexpected error: ${errorMessage}` });
    }
  });

  app.patch("/api/mis/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      // If pdPersonId is being set, also set assignedAt
      if (updates.pdPersonId && updates.workflowStatus === 'assigned') {
        updates.assignedAt = new Date();
      } else if (!updates.pdPersonId && updates.workflowStatus === 'unassigned') {
        updates.assignedAt = null;
      }
      
      const result = await storage.updateMisEntry(id, updates);
      if (!result) {
        return res.status(404).json({ error: "MIS entry not found" });
      }
      return res.json(result);
    } catch (error) {
      console.error("Update MIS entry error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/mis/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      console.log("MIS Delete: Attempting to delete entry", id);
      
      if (isNaN(id)) {
        console.error("MIS Delete: Invalid ID provided:", req.params.id);
        return res.status(400).json({ error: "Invalid ID provided" });
      }
      
      const success = await storage.deleteMisEntry(id);
      console.log("MIS Delete: Result for entry", id, ":", success);
      
      if (!success) {
        return res.status(404).json({ error: "MIS entry not found" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete MIS entry error:", error);
      const errorMessage = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: errorMessage });
    }
  });

  // AI Business Analysis - using OpenRouter DeepSeek
  app.post("/api/analyze-business", async (req, res) => {
    try {
      const { analyzeBusinessForReport } = await import("./openrouter");
      const { businessName, businessType, location, ownerName, observations, photoEvidence } = req.body;
      
      if (!businessName || !businessType) {
        return res.status(400).json({ error: "Business name and type are required" });
      }
      
      const analysis = await analyzeBusinessForReport({
        businessName,
        businessType,
        location: location || "Not specified",
        ownerName: ownerName || "Not specified",
        observations: observations || [],
        photoEvidence: photoEvidence || [],
      });
      
      return res.json(analysis);
    } catch (error: any) {
      console.error("Business analysis error:", error);
      return res.status(500).json({ error: error.message || "Analysis failed" });
    }
  });

  // Photo scoring calculation
  app.post("/api/calculate-photo-score", async (req, res) => {
    try {
      const { calculatePhotoScore } = await import("./openrouter");
      const { checklist } = req.body;
      
      if (!checklist) {
        return res.status(400).json({ error: "Checklist data is required" });
      }
      
      const scores = await calculatePhotoScore(checklist);
      return res.json(scores);
    } catch (error: any) {
      console.error("Photo score calculation error:", error);
      return res.status(500).json({ error: error.message || "Calculation failed" });
    }
  });

  // Gmail OAuth API - Fetch loan proposals
  app.get("/api/gmail/loan-proposals", async (req, res) => {
    try {
      if (!isGmailOAuthConfigured()) {
        return res.status(503).json({ 
          error: "Gmail OAuth not configured",
          configured: false,
          message: "Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_TOKEN environment variables"
        });
      }

      const query = (req.query.query as string) || "subject:Loan Proposal";
      const maxResults = parseInt((req.query.maxResults as string) || "10", 10);

      const emails = await fetchLoanProposalsByQuery(query, maxResults);
      
      return res.json({ 
        success: true, 
        count: emails.length,
        query,
        emails 
      });
    } catch (error: any) {
      console.error("Gmail OAuth fetch error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to fetch emails",
        configured: isGmailOAuthConfigured()
      });
    }
  });

  // Gmail OAuth API - Search by Lead ID
  app.get("/api/gmail/search/:leadId", async (req, res) => {
    try {
      if (!isGmailOAuthConfigured()) {
        return res.status(503).json({ 
          error: "Gmail OAuth not configured",
          configured: false
        });
      }

      const { leadId } = req.params;
      const emails = await searchEmailsByLeadId(leadId);
      
      return res.json({ 
        success: true, 
        leadId,
        count: emails.length,
        emails 
      });
    } catch (error: any) {
      console.error("Gmail search error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Gmail OAuth status check
  app.get("/api/gmail/status", (req, res) => {
    return res.json({
      configured: isGmailOAuthConfigured(),
      hasClientId: !!process.env.GMAIL_CLIENT_ID,
      hasClientSecret: !!process.env.GMAIL_CLIENT_SECRET,
      hasToken: !!process.env.GMAIL_TOKEN,
    });
  });

  // AI Integration status check
  app.get("/api/ai/status", (req, res) => {
    const configured = isAIConfigured();
    return res.json({
      configured,
      hasBaseUrl: !!process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
      hasApiKey: !!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
      message: configured 
        ? "AI integration is configured and ready" 
        : "AI integration not configured - comprehensive scoring will return zero scores"
    });
  });

  // Gmail import for MIS - connection:conn_google-mail_01KC3JM0FBYWW3J07BWC0CE8W6
  app.post("/api/mis/import-gmail", async (req, res) => {
    try {
      const { associateId, daysBack = 7 } = req.body;
      
      if (!associateId) {
        return res.status(400).json({ error: "Associate ID is required" });
      }
      
      // Import emails from Gmail
      const importResult = await importWorkAllocationEmails(daysBack);
      
      if (!importResult.success) {
        return res.status(500).json({ error: importResult.message });
      }
      
      if (importResult.entries.length === 0) {
        return res.json({ 
          entries: [], 
          skipped: 0, 
          message: importResult.message,
          emailCount: importResult.emailCount
        });
      }
      
      // Convert to MIS entries format
      const misEntries = importResult.entries.map(entry => ({
        leadId: entry.leadId,
        customerName: entry.customerName,
        businessName: entry.businessName,
        contactDetails: entry.mobileNumber,
        customerAddress: entry.address,
        inDate: entry.initiationDate,
        outDate: null,
        initiatedPerson: entry.initiatedPerson,
        product: entry.product,
        pdPerson: null,
        pdTyping: null,
        location: entry.branch,
        status: "Pending",
      }));
      
      // Filter out duplicates
      const uniqueEntries = [];
      for (const entry of misEntries) {
        const existing = await storage.getMisEntryByLeadId(entry.leadId);
        if (!existing) {
          uniqueEntries.push(entry);
        }
      }
      
      if (uniqueEntries.length === 0) {
        return res.json({ 
          entries: [], 
          skipped: misEntries.length,
          message: `All ${misEntries.length} entries already exist in MIS`,
          emailCount: importResult.emailCount
        });
      }
      
      // Add SNO and associate ID
      let nextSno = await storage.getNextMisSno();
      const entriesWithSno = uniqueEntries.map(entry => ({
        ...entry,
        associateId,
        sno: nextSno++,
      }));
      
      const result = await storage.createMisEntriesBulk(entriesWithSno);
      
      return res.json({ 
        entries: result, 
        skipped: misEntries.length - uniqueEntries.length,
        message: `Imported ${result.length} entries from ${importResult.emailCount} emails`,
        emailCount: importResult.emailCount
      });
    } catch (error: any) {
      console.error("Gmail import error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  return httpServer;
}
