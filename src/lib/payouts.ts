/**
 * Expert payout rules (from the plan):
 *  - Commission base = 1 month of recurring bundle value (assumption for prototype).
 *  - 70% on connection (activation), 30% retention bonus at 6 months.
 *  - Clawback of the connection payout if churn within 3 months.
 *  - Upsell: full rate if expert closed it on a visit, half if AI/app suggested.
 *  - Manager-approved discounts do NOT reduce the expert's incentive.
 */
export const PAYOUT = { onConnection: 0.7, retention: 0.3, clawbackMonths: 3, retentionMonths: 6 };

export function payoutFor(monthlyValue: number, opts: { upsell?: boolean; closedOnVisit?: boolean } = {}) {
  const base = opts.upsell ? (opts.closedOnVisit ? 1 : 0.5) * monthlyValue : monthlyValue;
  return {
    base: Math.round(base),
    onConnection: Math.round(base * PAYOUT.onConnection),
    retentionBonus: Math.round(base * PAYOUT.retention),
  };
}
