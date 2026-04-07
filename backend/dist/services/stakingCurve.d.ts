/** Allowed lock periods (days). Longer lock → higher total PT multiplier (basis points / 10_000). */
export declare const LOCK_DAY_OPTIONS: readonly [7, 14, 30, 60, 90];
export type LockDays = (typeof LOCK_DAY_OPTIONS)[number];
export declare function isValidLockDays(d: number): d is LockDays;
/** Total PT entitled at maturity (integer AC, integer PT). */
export declare function totalPtEntitled(acAmount: number, lockDays: LockDays): number;
/** Linear vesting: share of lock period elapsed → share of total PT unlocked. */
export declare function vestedPt(totalPt: number, startedAtMs: number, maturityAtMs: number, nowMs: number): number;
export declare function claimablePt(totalPt: number, claimedPt: number, startedAtMs: number, maturityAtMs: number, nowMs: number): number;
export declare function lockDaysLabel(d: LockDays): string;
