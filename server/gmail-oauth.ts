import { google } from "googleapis";

export interface LoanProposalEmail {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  threadId?: string;
}

let oAuth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;

function getOAuthClient() {
  if (!oAuth2Client) {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_REDIRECT_URI || "https://developers.google.com/oauthplayground";

    if (!clientId || !clientSecret) {
      throw new Error("Gmail OAuth credentials not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.");
    }

    oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const tokenJson = process.env.GMAIL_TOKEN;
    if (tokenJson) {
      try {
        const tokens = JSON.parse(tokenJson);
        oAuth2Client.setCredentials(tokens);
      } catch (e) {
        console.error("Failed to parse GMAIL_TOKEN:", e);
      }
    }
  }
  return oAuth2Client;
}

export function isGmailOAuthConfigured(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_TOKEN);
}

export async function fetchLoanProposalsByQuery(
  query: string = "subject:Loan Proposal",
  maxResults: number = 10
): Promise<LoanProposalEmail[]> {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = res.data.messages || [];
  const results: LoanProposalEmail[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({ userId: "me", id: msg.id });
    const headers = full.data.payload?.headers || [];
    
    const subject = headers.find(h => h.name === "Subject")?.value || "";
    const from = headers.find(h => h.name === "From")?.value || "";
    const date = headers.find(h => h.name === "Date")?.value || "";

    results.push({
      id: msg.id,
      subject,
      from,
      snippet: full.data.snippet || "",
      date,
      threadId: msg.threadId || undefined,
    });
  }

  return results;
}

export async function searchEmailsByLeadId(leadId: string): Promise<LoanProposalEmail[]> {
  return fetchLoanProposalsByQuery(`subject:${leadId}`, 5);
}

export async function getEmailContent(messageId: string): Promise<{
  subject: string;
  from: string;
  date: string;
  body: string;
}> {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const full = await gmail.users.messages.get({ 
    userId: "me", 
    id: messageId,
    format: "full"
  });

  const headers = full.data.payload?.headers || [];
  const subject = headers.find(h => h.name === "Subject")?.value || "";
  const from = headers.find(h => h.name === "From")?.value || "";
  const date = headers.find(h => h.name === "Date")?.value || "";

  let body = "";
  const payload = full.data.payload;
  
  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, "base64").toString("utf-8");
  } else if (payload?.parts) {
    const textPart = payload.parts.find(p => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
    }
  }

  return { subject, from, date, body };
}
