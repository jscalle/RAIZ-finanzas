export interface Topic {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH';
  icon: string; // Lucide icon key
  color: string; // Tailwind tint (e.g. "cyan", "emerald", "amber")
  monthlyLimit?: number;
}

export interface Income {
  id: string;
  description: string;
  amount: number;
  topicId: string;
  date: string;
  confirmed: boolean;
  method?: 'DIGITAL' | 'EFECTIVO';
  verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL';
  reconciliationStatus?: 'PENDING' | 'VERIFIED';
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  topicId: string;
  date: string;
  source: 'INGRESOS' | 'AHORROS';
  confirmed: boolean;
  paymentMethod?: 'DEBITO' | 'CREDITO' | 'EFECTIVO';
  verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL';
  reconciliationStatus?: 'PENDING' | 'VERIFIED';
}

export interface SavingGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number; // Sum of contributions or manually set
  deadline: string;
  topicId: string;
}

export interface SavingContribution {
  id: string;
  goalId: string; // Goal ID, or "GENERAL"
  amount: number;
  date: string;
  description: string;
}

export interface Withdrawal {
  id: string;
  description: string;
  amount: number;
  date: string;
}

// One slice of the expenses-by-category breakdown (see mathEngine.expensesByCategory).
export interface CategorySlice {
  topicId: string;
  name: string;
  color: string; // Tailwind tint key (e.g. "cyan"), mapped to a hex for charts.
  total: number;
  percent: number; // 0-100, share of the grand total.
}

// One budgeted category's consumption for the active period.
export interface BudgetRow {
  topicId: string;
  name: string;
  color: string; // Tailwind tint key.
  icon: string; // Lucide icon key.
  spent: number;
  limit: number;
  remaining: number; // limit - spent (negative when exceeded).
  percent: number; // spent / limit * 100.
  status: 'normal' | 'warning' | 'exceeded';
}

// Roll-up of all budgeted categories (see mathEngine.budgetByCategory).
export interface BudgetSummary {
  totalSpent: number;
  totalLimit: number;
  totalRemaining: number;
  percent: number;
  exceededCount: number;
}

// Raw movement returned by the /api/parse-movement service.
export interface ParsedMovement {
  type: string;
  amount: number;
  description: string;
  explanation: string;
  currency?: string;
  sourceCategory?: string;
  targetCategory?: string;
  confidence?: number;
}

// Editable form state derived from a parsed movement before import.
export interface EditingMovement {
  description: string;
  amount: number;
  type: string;
  targetCategory: string;
  source: 'INGRESOS' | 'AHORROS';
  paymentMethod: string;
  date: string;
  explanation: string;
  verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL';
  reconciliationStatus?: 'PENDING' | 'VERIFIED';
}

export interface PendingTransaction {
  id: string;
  spaceId: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'DEBT_PAYMENT' | 'UNCATEGORIZED';
  amount: number;
  currency: string;
  description: string;
  category: string;
  topicId?: string;
  date: string;
  explanation: string;
  status: 'PENDING' | 'APPROVED' | 'DISCARDED';
  source: 'SMS_WEBHOOK' | 'GMAIL' | 'MANUAL';
  createdAt: string;
  rawText?: string;
  paymentMethod?: string;
}

// One message of the in-app assistant conversation, written by the server at
// spaces/{spaceId}/assistant_threads/{uid}/messages/{id} and only read by the client.
export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  /** text: an answer or the user's words; draft: a pending movement to confirm;
   *  notice: something the user should know; error: the message could not be processed. */
  kind: 'text' | 'draft' | 'notice' | 'error';
  text: string;
  createdAt: string;
  /** User messages only. */
  status?: 'analyzing' | 'done' | 'failed';
  usedFallback?: boolean;
  attachment?: { kind: 'image' | 'audio'; mimeType: string; sizeBytes: number };
  /** Assistant messages: the user message they answer. */
  replyTo?: string;
  /** Draft messages: the pending_transactions document and a snapshot to render it. */
  draftId?: string;
  draft?: {
    type: string;
    amount: number;
    currency: string;
    description: string;
    category: string;
    paymentMethod: string;
    date: string;
  };
}
