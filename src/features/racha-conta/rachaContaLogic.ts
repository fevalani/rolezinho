import type {
  GroupMember,
  Expense,
  Payment,
  DebtTransaction,
} from "@/lib/types";

// ─── Algoritmo de mínimo de transações ───────────────────────────────────────

export function computeDebts(
  members: GroupMember[],
  expenses: Expense[],
  payments: Payment[],
): DebtTransaction[] {
  const balance: Record<string, number> = {};
  members.forEach((m) => (balance[m.id] = 0));

  expenses.forEach((exp) => {
    const parts = exp.participant_ids;
    const shares: Record<string, number> = {};
    if (exp.split_type === "equal") {
      const share = exp.amount / parts.length;
      parts.forEach((p) => (shares[p] = share));
    } else if (exp.split_type === "custom") {
      Object.assign(shares, exp.splits);
    } else {
      parts.forEach(
        (p) => (shares[p] = ((exp.splits[p] ?? 0) / 100) * exp.amount),
      );
    }
    parts.forEach((p) => {
      if (p !== exp.paid_by) {
        balance[exp.paid_by] = (balance[exp.paid_by] ?? 0) + (shares[p] ?? 0);
        balance[p] = (balance[p] ?? 0) - (shares[p] ?? 0);
      }
    });
  });

  payments.forEach((pay) => {
    balance[pay.from_member_id] =
      (balance[pay.from_member_id] ?? 0) + pay.amount;
    balance[pay.to_member_id] = (balance[pay.to_member_id] ?? 0) - pay.amount;
  });

  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];
  Object.entries(balance).forEach(([id, val]) => {
    if (val > 0.005) creditors.push({ id, amount: val });
    if (val < -0.005) debtors.push({ id, amount: -val });
  });
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const txs: DebtTransaction[] = [];
  let ci = 0,
    di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.amount, d.amount);
    txs.push({ from: d.id, to: c.id, amount: parseFloat(amount.toFixed(2)) });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount < 0.005) ci++;
    if (d.amount < 0.005) di++;
  }
  return txs;
}
