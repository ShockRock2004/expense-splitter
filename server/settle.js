// Greedy: match the largest debtor with the largest creditor until everyone is settled.
export function settle(balances) {
  const byAmount = (a, b) => b.cents - a.cents;
  const creditors = balances.filter((b) => b.cents > 0).map((b) => ({ ...b })).sort(byAmount);
  const debtors = balances.filter((b) => b.cents < 0).map((b) => ({ ...b, cents: -b.cents })).sort(byAmount);

  const payments = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].cents, creditors[j].cents);
    payments.push({ from: debtors[i].name, to: creditors[j].name, amount: amt / 100 });
    if ((debtors[i].cents -= amt) === 0) i++;
    if ((creditors[j].cents -= amt) === 0) j++;
  }
  return payments;
}
