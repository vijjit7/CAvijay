import { google } from 'googleapis';

// Google Sheets integration - connection:conn_google-sheet_01KC99521K0ZQ5ZE0XSZQAQ94N
let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getSheetsClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export interface InitiationDateResult {
  initiationDate: Date | null;
  found: boolean;
  rowData?: any;
}

// MIS Spreadsheet configuration
const MIS_SPREADSHEET_ID = '1VWJsiKp0GgYHgv9JnRI-rW1eV9UkNP4O';
const MIS_SHEET_GID = 2067088679; // Sheet ID from URL

export async function searchLeadIdInMIS(leadId: string): Promise<InitiationDateResult> {
  try {
    console.log(`Searching for Lead ID ${leadId} in MIS spreadsheet...`);
    
    const sheets = await getSheetsClient();
    
    // First, get spreadsheet metadata to find sheet names
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: MIS_SPREADSHEET_ID,
    });
    
    // Find the sheet with matching GID, or use the first sheet
    let sheetName = 'Sheet1';
    const sheetsInfo = spreadsheet.data.sheets || [];
    console.log(`Found ${sheetsInfo.length} sheets`);
    
    for (const sheet of sheetsInfo) {
      const sheetId = sheet.properties?.sheetId;
      const title = sheet.properties?.title;
      console.log(`Sheet: ${title}, ID: ${sheetId}`);
      
      if (sheetId === MIS_SHEET_GID) {
        sheetName = title || 'Sheet1';
        console.log(`Using sheet: ${sheetName} (matched GID ${MIS_SHEET_GID})`);
        break;
      }
    }
    
    // If no match found, use first sheet
    if (sheetsInfo.length > 0 && !sheetsInfo.find(s => s.properties?.sheetId === MIS_SHEET_GID)) {
      sheetName = sheetsInfo[0].properties?.title || 'Sheet1';
      console.log(`GID not found, using first sheet: ${sheetName}`);
    }
    
    // Get all data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: MIS_SPREADSHEET_ID,
      range: `${sheetName}`,
    });
    
    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      console.log('No data found in spreadsheet');
      return { initiationDate: null, found: false };
    }
    
    // Find header row to identify Lead ID and Date columns
    const headerRow = rows[0];
    console.log(`Headers: ${headerRow.join(', ')}`);
    
    // Find Lead ID column (look for variations)
    let leadIdColIndex = -1;
    let dateColIndex = -1;
    let inDateColIndex = -1;
    
    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i] || '').toLowerCase().trim();
      
      // Check for Lead ID column
      if (header.includes('lead') && header.includes('id') || 
          header === 'leadid' || 
          header === 'lead_id' ||
          header === 'lead id') {
        leadIdColIndex = i;
      }
      
      // Priority: Look specifically for "In Date" column first
      if (header === 'in date' || header === 'indate' || header === 'in_date') {
        inDateColIndex = i;
        console.log(`Found "In Date" column at index ${i}`);
      }
      
      // Check for Date column (initiation date, date, created date, etc.) as fallback
      if (header.includes('date') || 
          header.includes('initiation') ||
          header.includes('created') ||
          header.includes('assigned')) {
        if (dateColIndex === -1) { // Take the first date-like column
          dateColIndex = i;
        }
      }
    }
    
    // Use "In Date" column if found, otherwise fall back to generic date column
    if (inDateColIndex !== -1) {
      dateColIndex = inDateColIndex;
      console.log(`Using "In Date" column (index ${inDateColIndex}) for initiation time`);
    }
    
    console.log(`Lead ID column index: ${leadIdColIndex}, Date column index: ${dateColIndex}`);
    
    if (leadIdColIndex === -1) {
      console.log('Could not find Lead ID column in spreadsheet');
      return { initiationDate: null, found: false };
    }
    
    // Search for the Lead ID in the data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cellValue = String(row[leadIdColIndex] || '').trim();
      
      if (cellValue.toUpperCase() === leadId.toUpperCase()) {
        console.log(`Found Lead ID ${leadId} in row ${i + 1}`);
        
        // Get the date from the date column
        if (dateColIndex !== -1 && row[dateColIndex]) {
          const dateValue = row[dateColIndex];
          console.log(`Date value found: ${dateValue}`);
          
          // Parse the date
          const parsedDate = parseFlexibleDate(dateValue);
          
          if (parsedDate) {
            return { 
              initiationDate: parsedDate, 
              found: true,
              rowData: row 
            };
          }
        }
        
        return { initiationDate: null, found: true, rowData: row };
      }
    }
    
    console.log(`Lead ID ${leadId} not found in spreadsheet`);
    return { initiationDate: null, found: false };
    
  } catch (error: any) {
    console.error('Error searching MIS spreadsheet:', error.message);
    return { initiationDate: null, found: false };
  }
}

export function parseFlexibleDate(dateValue: string): Date | null {
  try {
    // Handle various date formats
    const value = String(dateValue).trim();
    
    // DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // YYYY-MM-DD
    const yyyymmdd = value.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (yyyymmdd) {
      const [, year, month, day] = yyyymmdd;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // DD MMM YYYY (e.g., 12 Nov 2025)
    const ddmmmyyyy = value.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/i);
    if (ddmmmyyyy) {
      const [, day, monthStr, year] = ddmmmyyyy;
      const months: { [key: string]: number } = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      const month = months[monthStr.toLowerCase()];
      if (month !== undefined) {
        return new Date(parseInt(year), month, parseInt(day));
      }
    }
    
    // Try standard Date parsing as fallback
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    
    return null;
  } catch {
    return null;
  }
}
