import { google } from 'googleapis';

export interface TriggerEmailInfo {
  triggerDate: Date;
  messageId: string;
  subject: string;
  from: string;
}

export function formatInitiationTime(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
}

// Gmail OAuth integration - connection:conn_google-mail_01KC3JM0FBYWW3J07BWC0CE8W6
let connectionSettings: any = null;

async function getAccessToken() {
  // Always fetch fresh credentials - don't rely on cache for OAuth tokens
  connectionSettings = null;
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function sendTestEmail(to: string, from: string): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`Sending test email from ${from} to ${to}`);
    const gmail = await getGmailClient();
    
    const emailContent = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: AuditGuard Gmail Test`,
      '',
      'This is a test email from AuditGuard to verify Gmail connectivity.',
      '',
      `Sent at: ${new Date().toISOString()}`
    ].join('\r\n');
    
    const encodedEmail = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    });
    
    console.log('Test email sent successfully');
    return { success: true, message: 'Test email sent successfully' };
  } catch (error: any) {
    console.error('Error sending test email:', error.message);
    return { success: false, message: error.message };
  }
}

export async function searchTriggerEmail(leadId: string): Promise<TriggerEmailInfo | null> {
  try {
    console.log(`Searching Gmail for Lead ID: ${leadId}`);
    console.log('Note: Gmail OAuth only has send permissions. Reading emails requires gmail.readonly scope which is not available.');
    
    const gmail = await getGmailClient();
    
    // Search for emails containing the lead ID
    const query = `${leadId}`;
    console.log(`Gmail search query: ${query}`);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10
    });

    const messages = response.data.messages;
    
    if (!messages || messages.length === 0) {
      console.log(`No emails found for Lead ID: ${leadId}`);
      return null;
    }

    console.log(`Found ${messages.length} emails containing ${leadId}`);

    let mostRecentEmail: TriggerEmailInfo | null = null;
    let mostRecentDate: Date | null = null;

    // Process each message to find the most recent one
    for (const message of messages) {
      if (!message.id) continue;
      
      try {
        const msgDetails = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['Date', 'Subject', 'From']
        });

        const headers = msgDetails.data.payload?.headers || [];
        const dateHeader = headers.find(h => h.name === 'Date')?.value;
        const subjectHeader = headers.find(h => h.name === 'Subject')?.value || '';
        const fromHeader = headers.find(h => h.name === 'From')?.value || '';

        if (dateHeader) {
          const emailDate = new Date(dateHeader);
          
          if (!mostRecentDate || emailDate > mostRecentDate) {
            mostRecentDate = emailDate;
            mostRecentEmail = {
              triggerDate: emailDate,
              messageId: message.id,
              subject: subjectHeader,
              from: fromHeader
            };
          }
        }
      } catch (msgErr) {
        console.error(`Error fetching message ${message.id}:`, msgErr);
      }
    }

    if (mostRecentEmail) {
      console.log(`Found initiation email for ${leadId}: "${mostRecentEmail.subject}" from ${mostRecentEmail.triggerDate.toISOString()}`);
    }

    return mostRecentEmail;
  } catch (error: any) {
    console.error('Gmail API Error:', error.message || error);
    return null;
  }
}

export interface WorkAllocationEntry {
  product: string | null;
  businessName: string | null;
  entityType: string | null;
  customerName: string;
  leadId: string;
  branch: string | null;
  initiationDate: string | null;
  mobileNumber: string | null;
  address: string | null;
  initiatedPerson: string | null;
}

export interface EmailImportResult {
  success: boolean;
  message: string;
  entries: WorkAllocationEntry[];
  emailCount: number;
}

function parseWorkAllocationTable(htmlContent: string): WorkAllocationEntry[] {
  const entries: WorkAllocationEntry[] = [];
  
  // Look for table rows containing work allocation data
  // Piramal email format: Product | Business Name | Entity Type | Name of Applicant | Lead ID | Branch | Initiation Date | Mobile Number | Address
  
  // Try to find table data by looking for common patterns
  const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  
  let rowMatch;
  while ((rowMatch = tableRowPattern.exec(htmlContent)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    let cellMatch;
    
    while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
      // Strip HTML tags and get text content
      const cellText = cellMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(cellText);
    }
    
    // Need at least 5 cells to be a valid row (Product, Business Name, Entity Type, Applicant Name, Lead ID)
    if (cells.length >= 5) {
      // Skip header rows
      const firstCell = cells[0].toLowerCase();
      if (firstCell.includes('product') || firstCell.includes('s.no') || firstCell.includes('sr.no')) {
        continue;
      }
      
      // Check if this looks like a data row (has a valid Lead ID pattern)
      const leadIdIndex = cells.findIndex(c => /^[A-Z]{2,}[A-Z0-9_-]+$/i.test(c.trim()));
      
      if (leadIdIndex >= 0 || cells.length >= 5) {
        // Standard format: Product | Business Name | Entity Type | Name of Applicant | Lead ID | Branch | Initiation Date | Mobile Number | Address
        const entry: WorkAllocationEntry = {
          product: cells[0] || null,
          businessName: cells[1] || null,
          entityType: cells[2] || null,
          customerName: cells[3] || '',
          leadId: cells[4] || '',
          branch: cells[5] || null,
          initiationDate: cells[6] || null,
          mobileNumber: cells[7] ? cells[7].replace(/^(ph:|phone:|tel:|mob:|mobile:)/i, '').trim() : null,
          address: cells[8] || null,
          initiatedPerson: null, // Will be populated from email sender
        };
        
        // Only add if we have a valid lead ID and customer name
        if (entry.leadId && entry.customerName) {
          entries.push(entry);
        }
      }
    }
  }
  
  // Also try plain text parsing for non-HTML or poorly formatted HTML
  if (entries.length === 0) {
    const lines = htmlContent.split(/\r?\n/);
    for (const line of lines) {
      // Try tab or pipe separated
      let parts = line.includes('\t') ? line.split('\t') : line.split('|');
      parts = parts.map(p => p.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      
      if (parts.length >= 5) {
        const firstPart = parts[0].toLowerCase();
        if (firstPart.includes('product') || firstPart.includes('s.no') || firstPart.includes('sr.no')) {
          continue;
        }
        
        const entry: WorkAllocationEntry = {
          product: parts[0] || null,
          businessName: parts[1] || null,
          entityType: parts[2] || null,
          customerName: parts[3] || '',
          leadId: parts[4] || '',
          branch: parts[5] || null,
          initiationDate: parts[6] || null,
          mobileNumber: parts[7] ? parts[7].replace(/^(ph:|phone:|tel:|mob:|mobile:)/i, '').trim() : null,
          address: parts[8] || null,
          initiatedPerson: null, // Will be populated from email sender
        };
        
        if (entry.leadId && entry.customerName) {
          entries.push(entry);
        }
      }
    }
  }
  
  return entries;
}

function extractBodyFromParts(parts: any[], preferHtml: boolean = true): string {
  let htmlContent = '';
  let plainContent = '';
  
  for (const part of parts) {
    const mimeType = part.mimeType || '';
    
    if (mimeType === 'text/html' && part.body?.data) {
      htmlContent = Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (mimeType === 'text/plain' && part.body?.data) {
      plainContent = Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (mimeType.startsWith('multipart/') && part.parts) {
      const nestedContent = extractBodyFromParts(part.parts, preferHtml);
      if (nestedContent) {
        if (mimeType === 'multipart/alternative') {
          if (!htmlContent) htmlContent = nestedContent;
        } else {
          if (!htmlContent && !plainContent) {
            htmlContent = nestedContent;
          }
        }
      }
    }
  }
  
  return preferHtml ? (htmlContent || plainContent) : (plainContent || htmlContent);
}

export async function importWorkAllocationEmails(daysBack: number = 7): Promise<EmailImportResult> {
  try {
    console.log(`Importing work allocation emails from last ${daysBack} days`);
    const gmail = await getGmailClient();
    
    // Calculate date filter
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - daysBack);
    const afterDateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
    
    // Search for Piramal work allocation emails
    // Common patterns: subject contains "allocation" or "assigned" or from piramal domain
    const query = `after:${afterDateStr} (subject:allocation OR subject:assigned OR subject:"work order" OR from:piramal)`;
    console.log(`Gmail search query: ${query}`);
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    });

    const messages = response.data.messages;
    
    if (!messages || messages.length === 0) {
      console.log('No work allocation emails found');
      return {
        success: true,
        message: 'No work allocation emails found in the last ' + daysBack + ' days',
        entries: [],
        emailCount: 0
      };
    }

    console.log(`Found ${messages.length} potential work allocation emails`);
    const allEntries: WorkAllocationEntry[] = [];

    for (const message of messages) {
      if (!message.id) continue;
      
      try {
        const msgDetails = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        // Extract sender from headers
        const headers = msgDetails.data.payload?.headers || [];
        const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        // Parse sender name from "Name <email>" or just "email" format
        let senderName: string | null = null;
        const nameMatch = fromHeader.match(/^([^<]+)\s*<.+>$/);
        if (nameMatch) {
          senderName = nameMatch[1].trim().replace(/"/g, '');
        } else if (fromHeader.includes('@')) {
          senderName = fromHeader.split('@')[0].replace(/[._-]/g, ' ');
        }

        // Extract body content - handle nested multipart messages
        let bodyContent = '';
        const payload = msgDetails.data.payload;
        
        if (payload?.body?.data) {
          bodyContent = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        } else if (payload?.parts) {
          bodyContent = extractBodyFromParts(payload.parts, true);
        }

        if (bodyContent) {
          const entries = parseWorkAllocationTable(bodyContent);
          if (entries.length > 0) {
            // Populate initiatedPerson from email sender
            entries.forEach(entry => {
              entry.initiatedPerson = senderName;
            });
            console.log(`Parsed ${entries.length} entries from email ${message.id} (from: ${senderName})`);
            allEntries.push(...entries);
          }
        }
      } catch (msgErr: any) {
        console.error(`Error processing email ${message.id}:`, msgErr.message);
      }
    }

    // Deduplicate by Lead ID
    const uniqueEntries = allEntries.reduce((acc, entry) => {
      if (!acc.find(e => e.leadId === entry.leadId)) {
        acc.push(entry);
      }
      return acc;
    }, [] as WorkAllocationEntry[]);

    console.log(`Total unique entries extracted: ${uniqueEntries.length}`);

    return {
      success: true,
      message: `Found ${uniqueEntries.length} unique work allocations from ${messages.length} emails`,
      entries: uniqueEntries,
      emailCount: messages.length
    };
  } catch (error: any) {
    console.error('Error importing work allocation emails:', error.message);
    return {
      success: false,
      message: 'Failed to import emails: ' + error.message,
      entries: [],
      emailCount: 0
    };
  }
}

const holidays2026: Set<string> = new Set([
  "2026-01-01", "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15",
  "2026-03-19", "2026-03-21", "2026-03-26",
  "2026-04-03",
  "2026-08-15",
  "2026-09-14",
  "2026-10-02", "2026-10-20",
  "2026-11-08",
  "2026-12-25"
]);

function isSecondSaturday(date: Date): boolean {
  if (date.getDay() !== 6) return false;
  const dayOfMonth = date.getDate();
  // Only the second Saturday (days 8-14) is excluded from working days
  // First Saturday (days 1-7) is now included as a working day
  return dayOfMonth >= 8 && dayOfMonth <= 14;
}

function isWorkingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return false; // Sunday excluded
  if (isSecondSaturday(date)) return false; // Only second Saturday excluded
  const dateStr = date.toISOString().split('T')[0];
  if (holidays2026.has(dateStr)) return false;
  return true;
}

function countWorkingDays(startDate: Date, endDate: Date): number {
  if (startDate >= endDate) return 0;
  
  let workingDays = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  while (current < end) {
    if (isWorkingDay(current)) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
}

export function calculateTATMetrics(
  initiationTime: Date | null,
  visitTime: Date | null,
  reportDate: Date | null
): {
  initiationToVisitHours: number | null;
  visitToReportHours: number | null;
  totalTATHours: number | null;
} {
  let initiationToVisitHours: number | null = null;
  let visitToReportHours: number | null = null;
  let totalTATHours: number | null = null;

  if (initiationTime && visitTime) {
    const workingDays = countWorkingDays(initiationTime, visitTime);
    initiationToVisitHours = Math.round(workingDays * 24 * 10) / 10;
  }

  if (visitTime && reportDate) {
    const workingDays = countWorkingDays(visitTime, reportDate);
    visitToReportHours = Math.round(workingDays * 24 * 10) / 10;
  }

  if (initiationTime && reportDate) {
    const workingDays = countWorkingDays(initiationTime, reportDate);
    totalTATHours = Math.round(workingDays * 24 * 10) / 10;
  }

  return {
    initiationToVisitHours: initiationToVisitHours !== null ? Math.max(0, initiationToVisitHours) : null,
    visitToReportHours: visitToReportHours !== null ? Math.max(0, visitToReportHours) : null,
    totalTATHours: totalTATHours !== null ? Math.max(0, totalTATHours) : null
  };
}
