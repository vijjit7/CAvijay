// One-off: re-apply server/bank-txn-rules.ts to all "Unclassified" txns
// in tmp/dev-state.json. Stop the dev server before running so the file
// is not held open. After it finishes, restart the dev server.
import fs from 'fs';
import path from 'path';
import { classifyByRules } from '../server/bank-txn-rules';

const STATE_FILE = path.resolve(process.cwd(), 'tmp', 'dev-state.json');

const raw = fs.readFileSync(STATE_FILE, 'utf8');
const state = JSON.parse(raw);

const stmtCtx = new Map<number, { bankName: string; accountNumber: string | null }>();
for (const s of state.bankStatements ?? []) {
  stmtCtx.set(s.id, { bankName: s.bankName, accountNumber: s.accountNumber ?? null });
}

const before: Record<string, number> = {};
const after: Record<string, number> = {};
const changes: Record<string, number> = {};

for (const t of state.bankTransactions ?? []) {
  before[t.category] = (before[t.category] ?? 0) + 1;
  if (t.category !== 'Unclassified') {
    after[t.category] = (after[t.category] ?? 0) + 1;
    continue;
  }
  const debit = t.debit != null ? parseFloat(String(t.debit)) : null;
  const credit = t.credit != null ? parseFloat(String(t.credit)) : null;
  const ctx = stmtCtx.get(t.statementId);
  const cat = classifyByRules(t.narration, debit, credit, ctx);
  if (cat) {
    changes[cat] = (changes[cat] ?? 0) + 1;
    t.category = cat;
  }
  after[t.category] = (after[t.category] ?? 0) + 1;
}

const backup = STATE_FILE + '.bak-' + Date.now();
fs.copyFileSync(STATE_FILE, backup);
fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');

console.log('Backup written to', backup);
console.log('Before:', before);
console.log('After: ', after);
console.log('Newly classified:', changes);
