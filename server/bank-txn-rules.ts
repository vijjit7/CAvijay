import type { BankTxnCategory } from "@shared/schema";

// A classifier returns a category if it claims the transaction, or null to skip.
// Rules are applied in order — the first non-null result wins, so put more
// specific rules above broader ones. Optional `ctx` lets a rule scope itself
// to a particular bank account (e.g. spouse's statement).
export interface TxnContext {
  bankName?: string;
  accountNumber?: string | null;
}
export type Classifier = (
  narration: string,
  debit: number | null | undefined,
  credit: number | null | undefined,
  ctx?: TxnContext,
) => BankTxnCategory | null;

// Account numbers used by ctx-aware rules below.
const SPOUSE_ACCOUNT_NUMBER = '7614483220'; // ANV FINCORP, Indian Bank

const debitOf = (d: number | null | undefined) => (d ?? 0);
const creditOf = (c: number | null | undefined) => (c ?? 0);

// Add identifiers here (case-insensitive). Any narration that matches one of
// these is treated as a transfer between the user's own accounts → Internal
// Transfer. Use word boundaries to keep matches precise.
const OWN_ACCOUNT_IDENTIFIERS: RegExp[] = [
  /\bnandhan\b/i,                       // NANDHAN FINCORP — own proprietorship (Federal Bank)
  /\bHDFC0000545\b/i,                   // own HDFC current account IFSC
  /\bIDIB000H599\b/i,                   // spouse account IFSC (Indian Bank) — treated as own for receipts/payments view
  /\bICIC0000078\b/i,                   // own ICICI IFSC
  /\bvijay\s+kuma/i,                    // user's own name — catches "Vijay Kumar", "Vijay Kumar T", "Vijay Kuma" (UPI 11-char truncation)
  /\btogaru\b/i,                        // user's surname — distinctive enough to flag any narration mentioning it as own
  /vijaykumaraca@okhdfcbank/i,          // user's own UPI handle (HDFC)
  /vijaykumaraca[-\w]*@okicici/i,       // user's own UPI handle (ICICI), e.g. vijaykumaraca-1@okicici
];

export const TXN_RULES: Array<{ name: string; classify: Classifier }> = [
  {
    name: 'zerodha → investment',
    classify: (narration, debit, credit) => {
      if (!/\bzerodha\b/i.test(narration || '')) return null;
      if (debitOf(debit) > 0) return 'Investment addition';
      if (creditOf(credit) > 0) return 'Investment withdrawal';
      return null;
    },
  },
  {
    name: 'piramal credit → revenue',
    classify: (narration, _debit, credit) => {
      if (creditOf(credit) > 0 && /piramal/i.test(narration || '')) return 'Revenue - Piramal';
      return null;
    },
  },
  {
    name: 'andromeda credit → revenue',
    classify: (narration, _debit, credit) => {
      if (creditOf(credit) > 0 && /\bandro(meda)?\b/i.test(narration || '')) return 'Revenue - Andro';
      return null;
    },
  },
  {
    name: 'mucare credit → revenue',
    classify: (narration, _debit, credit) => {
      if (creditOf(credit) > 0 && /\bmucare\b/i.test(narration || '')) return 'Revenue - Mucare';
      return null;
    },
  },
  {
    name: 'transfer to T Achyuthaveni → wife AC',
    classify: (narration, debit) => {
      // Debits to the user's wife (T Achyuthaveni) are tracked as a separate
      // Wife AC line rather than rolled into Internal Transfer. Placed before
      // the own-account identifier rule so the spouse IFSC doesn't preempt it.
      if (debitOf(debit) <= 0) return null;
      if (/\bachyuthaveni\b/i.test(narration || '')) return 'Wife AC';
      return null;
    },
  },
  {
    name: 'sweep trf → internal transfer',
    classify: (narration) => {
      if (/\bsweep\s*trf\b/i.test(narration || '')) return 'Internal Transfer';
      if (/\brev\s*sweep\b/i.test(narration || '')) return 'Internal Transfer';
      return null;
    },
  },
  {
    name: 'own account identifier → internal transfer',
    classify: (narration) => {
      // Anything that names one of the user's own entities or own-bank IFSC /
      // account numbers — a transfer between own accounts. Add new identifiers
      // to OWN_ACCOUNT_IDENTIFIERS below as more banks/accounts are seen.
      const n = narration || '';
      for (const pat of OWN_ACCOUNT_IDENTIFIERS) {
        if (pat.test(n)) return 'Internal Transfer';
      }
      return null;
    },
  },
  {
    name: 'spouse account credit from vijay → internal transfer',
    classify: (narration, _debit, credit, ctx) => {
      // On the spouse's statement only: any credit whose narration mentions
      // "Vijay" is a transfer from the user's own account → internal.
      if (ctx?.accountNumber !== SPOUSE_ACCOUNT_NUMBER) return null;
      if (creditOf(credit) <= 0) return null;
      if (/\bvijay\b/i.test(narration || '')) return 'Internal Transfer';
      return null;
    },
  },
  {
    name: 'chit fund payees → chit payment',
    classify: (narration, debit) => {
      if (debitOf(debit) <= 0) return null;
      const n = narration || '';
      if (/\bshriram\b/i.test(n)) return 'Chit payment';
      if (/\bmargadarsi\b/i.test(n)) return 'Chit payment';
      return null;
    },
  },
  {
    name: 'cred → credit card payment',
    classify: (narration, debit) => {
      // Any debit (payment out) whose narration mentions the CRED app
      // (CRED / CRED CLUB) — settle a credit-card bill via CRED. Uses word
      // boundaries so "credit", "credited", "credentials" do not match.
      if (debitOf(debit) <= 0) return null;
      const n = narration || '';
      if (/\bcred\b/i.test(n)) return 'Credit Card Pmt';
      if (/\bcredclub\b/i.test(n)) return 'Credit Card Pmt';
      return null;
    },
  },
  {
    name: 'VALA PRAGATHI → office rent',
    classify: (narration, debit) => {
      if (debitOf(debit) <= 0) return null;
      if (/\bvala\s+pragathi\b/i.test(narration || '')) return 'Office rent';
      return null;
    },
  },
  {
    name: 'NIRMAL SOCIETY → office expense (maintenance)',
    classify: (narration, debit) => {
      // Match the society's name only. Do NOT match the account number
      // 97158042134 — that prefix appears on many TRANSFER TO narrations
      // for unrelated payees (salaries etc.) on this bank.
      if (debitOf(debit) <= 0) return null;
      if (/\bnirmal\s+society\b/i.test(narration || '')) return 'Office expense';
      return null;
    },
  },
  {
    name: 'firm employees → salary',
    classify: (narration, debit) => {
      if (debitOf(debit) <= 0) return null;
      const n = narration || '';
      // Distinctive surname/name combos to avoid false positives on common
      // first names like "anil", "nikhil", "mahesh", "shankar", "karthik".
      if (/\bbharathnath\b/i.test(n)) return 'Salary';
      if (/\bpavan\s+kumar\b/i.test(n)) return 'Salary';        // LLA PAVAN KUMAR
      if (/\besarapu\b/i.test(n)) return 'Salary';              // ESARAPU RAMANA
      if (/\banosh\b/i.test(n)) return 'Salary';                // ELLA ANOSH KUMAR / anosh
      if (/\bbhukya\s+anil\b/i.test(n)) return 'Salary';
      if (/\badapelli\s+nikhil\b/i.test(n)) return 'Salary';
      if (/\bbollamahesh\b/i.test(n)) return 'Salary';          // BOLLAMAHESH / Mahesh
      if (/\bsrikanth\s+yadav\b/i.test(n)) return 'Salary';
      if (/\bnaraboyina\b/i.test(n)) return 'Salary';           // NARABOYINA PRASHANTH
      if (/\bgolamari\b/i.test(n)) return 'Salary';             // GOLAMARI CHINNA KOND
      if (/\bk\s+karthik\b/i.test(n)) return 'Salary';
      if (/\bvupparipally\b/i.test(n)) return 'Salary';         // VUPPARIPALLY SHANKAR
      if (/\bdharavath\b/i.test(n)) return 'Salary';            // DHARAVATH GANESH
      return null;
    },
  },
  {
    name: 'entertainment payees → entertainment expense',
    classify: (narration, debit) => {
      // Fires only on debits (payments out). UPI handle "vaishailsandy2" is an
      // exact substring; names use word boundaries to avoid accidental matches.
      if (debitOf(debit) <= 0) return null;
      const n = narration || '';
      if (/vaishailsandy2/i.test(n)) return 'Entertainment Expense';
      if (/\bindumathi\b/i.test(n)) return 'Entertainment Expense';
      if (/\bmalapat/i.test(n)) return 'Entertainment Expense';
      if (/\bshaik\s+beb\w*\b/i.test(n)) return 'Entertainment Expense';
      return null;
    },
  },
  {
    name: 'GST → statutory',
    classify: (narration, debit) => {
      if (debitOf(debit) <= 0) return null;
      if (/\bgst\b/i.test(narration || '')) return 'Statutory (TDS/GST)';
      return null;
    },
  },
  {
    name: 'amount < 100 → misc',
    classify: (_narration, debit, credit) => {
      const d = debitOf(debit);
      const c = creditOf(credit);
      if ((d > 0 && d < 100) || (c > 0 && c < 100)) return 'Misc';
      return null;
    },
  },
  {
    name: 'small debit 100–1000 → personal expense',
    classify: (_narration, debit) => {
      // Fallback bucket: any debit between ₹100 and ₹1000 that no earlier
      // (more specific) rule has claimed is treated as a personal expense.
      // Placed last so payee-specific rules (Salary, Office, Internal, etc.)
      // always take precedence.
      const d = debitOf(debit);
      if (d >= 100 && d <= 1000) return 'Personal expense';
      return null;
    },
  },
];

export function classifyByRules(
  narration: string,
  debit: number | null | undefined,
  credit: number | null | undefined,
  ctx?: TxnContext,
): BankTxnCategory | null {
  for (const rule of TXN_RULES) {
    const cat = rule.classify(narration, debit, credit, ctx);
    if (cat) return cat;
  }
  return null;
}
