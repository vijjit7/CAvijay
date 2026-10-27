// Decisive read-only check for "emails are in the mailbox but the app imports 0".
// Prints WHICH Google account the app's token is actually connected to, then runs
// the exact query the importer uses plus progressively broader fallbacks — so you
// can tell at a glance whether the problem is the wrong account, the date window,
// or the subject text.
//
//   npx tsx script/diagnose-gmail-account.ts            # last 7 days (importer default)
//   npx tsx script/diagnose-gmail-account.ts --days 3
//
import "dotenv/config";
import { isGmailOAuthConfigured, getGmailReadClient } from "../server/gmail-oauth";

function parseDays(): number {
  const i = process.argv.indexOf("--days");
  if (i !== -1 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 7;
}

async function count(gmail: any, q: string): Promise<{ n: number; sample: string[] }> {
  const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 10 });
  const msgs = res.data.messages || [];
  const sample: string[] = [];
  for (const m of msgs.slice(0, 5)) {
    const d = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["Subject", "Date", "To"],
    });
    const h = d.data.payload?.headers || [];
    const subj = h.find((x: any) => x.name === "Subject")?.value || "";
    const date = h.find((x: any) => x.name === "Date")?.value || "";
    sample.push(`    • ${date}  |  ${subj.slice(0, 70)}`);
  }
  // resultSizeEstimate is approximate but good enough to tell 0 from "many".
  return { n: msgs.length, sample };
}

async function main() {
  if (!isGmailOAuthConfigured()) {
    console.error(
      "GMAIL_CLIENT_ID/SECRET/TOKEN not all set in this environment — run this where\n" +
        "the production Gmail env vars are loaded (or copy them into a local .env).",
    );
    process.exit(1);
  }

  const gmail = getGmailReadClient();

  // 1) WHICH account does the token actually read? This is the whole ballgame.
  const profile = await gmail.users.getProfile({ userId: "me" });
  console.log("\n──────────────────────────────────────────────");
  console.log(`App is connected to Gmail account:  ${profile.data.emailAddress}`);
  console.log(`(total messages in that mailbox: ${profile.data.messagesTotal})`);
  console.log("──────────────────────────────────────────────");
  console.log("If that address is NOT the inbox you checked, that's the bug —");
  console.log("the token points at the wrong account. Regenerate GMAIL_TOKEN");
  console.log("against the correct account (gmail.readonly scope).\n");

  const days = parseDays();
  const after = new Date();
  after.setDate(after.getDate() - days);
  const afterStr = after.toISOString().split("T")[0].replace(/-/g, "/");

  // 2) The EXACT query the importer runs.
  const exact = `after:${afterStr} subject:"New PD Assigned"`;
  // 3) Same subject, no date window — isolates a date-window problem.
  const noDate = `subject:"New PD Assigned"`;
  // 4) Subject words without phrase/date — isolates a wording change.
  const loose = `New PD Assigned newer_than:${days}d`;
  // 5) Anything from the usual sender in the window — isolates delivery to this account.
  const anyRecent = `newer_than:${days}d`;

  for (const [label, q] of [
    [`importer query (last ${days}d)`, exact],
    [`subject only, no date`, noDate],
    [`loose words, last ${days}d`, loose],
    [`ANY mail, last ${days}d`, anyRecent],
  ] as const) {
    const { n, sample } = await count(gmail, q);
    console.log(`[${n === 0 ? "  0" : n >= 10 ? "10+" : ` ${n} `}]  ${label}`);
    console.log(`        q = ${q}`);
    if (sample.length) console.log(sample.join("\n"));
    console.log("");
  }

  console.log("Read: if 'ANY mail' is also 0 → token reads an empty/wrong account.");
  console.log("If 'subject only' has hits but 'importer query' is 0 → date-window issue.");
  console.log("If 'loose words' has hits but 'subject only' is 0 → the subject text changed.\n");
}

main().catch((err) => {
  console.error("Diagnose failed:", err?.message || err);
  process.exit(1);
});
