/** Allowed lock periods (days). Longer lock → higher total PT multiplier (basis points / 10_000). */
export const LOCK_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export type LockDays = (typeof LOCK_DAY_OPTIONS)[number];

const PT_MULT_BPS: Record<LockDays, number> = {
  7: 11_000, // 1.10x AC → PT over the period
  14: 12_500,
  30: 15_000,
  60: 20_000,
  90: 27_500,
};

export function isValidLockDays(d: number): d is LockDays {
  return LOCK_DAY_OPTIONS.includes(d as LockDays);
}

/** Total PT entitled at maturity (integer AC, integer PT). */
export function totalPtEntitled(acAmount: number, lockDays: LockDays): number {
  const mult = PT_MULT_BPS[lockDays];
  return Math.floor((acAmount * mult) / 10_000);
}

/** Linear vesting: share of lock period elapsed → share of total PT unlocked. */
export function vestedPt(
  totalPt: number,
  startedAtMs: number,
  maturityAtMs: number,
  nowMs: number
): number {
  if (nowMs <= startedAtMs) return 0;
  if (nowMs >= maturityAtMs) return totalPt;
  const elapsed = nowMs - startedAtMs;
  const span = maturityAtMs - startedAtMs;
  if (span <= 0) return totalPt;
  return Math.floor((totalPt * elapsed) / span);
}

export function claimablePt(
  totalPt: number,
  claimedPt: number,
  startedAtMs: number,
  maturityAtMs: number,
  nowMs: number
): number {
  const v = vestedPt(totalPt, startedAtMs, maturityAtMs, nowMs);
  return Math.max(0, v - claimedPt);
}

export function lockDaysLabel(d: LockDays): string {
  return `${d} days`;
}
