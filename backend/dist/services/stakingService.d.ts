import * as userService from "./userService.js";
import { type LockDays } from "./stakingCurve.js";
export interface PublicStakePosition {
    id: string;
    stakeIdx: number;
    acAmount: number;
    lockDays: LockDays;
    startedAt: string;
    maturityAt: string;
    totalPtEntitled: number;
    claimedPt: number;
    claimablePtNow: number;
    fullyVested: boolean;
}
export declare function listStakes(userId: string): PublicStakePosition[];
export declare function createStake(userId: string, amountAc: number, lockDays: number): {
    stake: PublicStakePosition;
    user: userService.PublicUser;
};
export declare function claimStake(userId: string, stakeId: string): {
    user: userService.PublicUser;
    claimedPt: number;
    stake: PublicStakePosition;
};
