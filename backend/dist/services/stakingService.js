import { v4 as uuidv4 } from "uuid";
import { sqlRow, sqlRows } from "../db/cast.js";
import { getDb } from "../db/connection.js";
import * as userService from "./userService.js";
import { claimablePt, isValidLockDays, totalPtEntitled, } from "./stakingCurve.js";
function rowToPublic(r) {
    const lockDays = r.lock_days;
    const started = Date.parse(r.started_at);
    const maturity = Date.parse(r.maturity_at);
    const now = Date.now();
    const total = r.total_pt_entitled;
    const claimNow = claimablePt(total, r.claimed_pt, started, maturity, now);
    return {
        id: r.id,
        stakeIdx: r.stake_idx,
        acAmount: r.ac_amount,
        lockDays,
        startedAt: r.started_at,
        maturityAt: r.maturity_at,
        totalPtEntitled: total,
        claimedPt: r.claimed_pt,
        claimablePtNow: claimNow,
        fullyVested: now >= maturity,
    };
}
export function listStakes(userId) {
    const rows = sqlRows(getDb()
        .prepare(`SELECT * FROM stake_positions WHERE user_id = ? ORDER BY started_at DESC`)
        .all(userId));
    return rows.map(rowToPublic);
}
function nextStakeIdx(userId) {
    const row = sqlRow(getDb()
        .prepare(`SELECT MAX(stake_idx) AS m FROM stake_positions WHERE user_id = ?`)
        .get(userId));
    return (row?.m ?? 0) + 1;
}
export function createStake(userId, amountAc, lockDays) {
    if (!isValidLockDays(lockDays)) {
        const err = new Error("INVALID_LOCK_DAYS");
        err.code = "INVALID_LOCK_DAYS";
        throw err;
    }
    const database = getDb();
    const row = userService.getUserByIdInternal(userId);
    if (!row) {
        const err = new Error("USER_NOT_FOUND");
        err.code = "USER_NOT_FOUND";
        throw err;
    }
    const ac = row.ac_balance ?? row.token_balance ?? 0;
    if (ac < amountAc) {
        const err = new Error("INSUFFICIENT_BALANCE");
        err.code = "INSUFFICIENT_BALANCE";
        throw err;
    }
    const totalPt = totalPtEntitled(amountAc, lockDays);
    const id = uuidv4();
    const stakeIdx = nextStakeIdx(userId);
    const started = new Date();
    const maturity = new Date(started.getTime() + lockDays * 24 * 60 * 60 * 1000);
    database.exec("BEGIN IMMEDIATE");
    try {
        database
            .prepare(`UPDATE users SET
          ac_balance = ?,
          token_balance = ?,
          updated_at = datetime('now')
         WHERE id = ?`)
            .run(ac - amountAc, ac - amountAc, userId);
        database
            .prepare(`INSERT INTO stake_positions (
          id, user_id, stake_idx, ac_amount, lock_days,
          started_at, maturity_at, total_pt_entitled, claimed_pt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`)
            .run(id, userId, stakeIdx, amountAc, lockDays, started.toISOString(), maturity.toISOString(), totalPt);
        database.exec("COMMIT");
    }
    catch (e) {
        try {
            database.exec("ROLLBACK");
        }
        catch {
            /* ignore */
        }
        throw e;
    }
    const stakeRow = sqlRow(database.prepare(`SELECT * FROM stake_positions WHERE id = ?`).get(id));
    const user = userService.getUserById(userId);
    if (!user) {
        const err = new Error("USER_NOT_FOUND");
        err.code = "USER_NOT_FOUND";
        throw err;
    }
    return { stake: rowToPublic(stakeRow), user };
}
export function claimStake(userId, stakeId) {
    const database = getDb();
    const r = sqlRow(database.prepare(`SELECT * FROM stake_positions WHERE id = ?`).get(stakeId));
    if (!r || r.user_id !== userId) {
        const err = new Error("STAKE_NOT_FOUND");
        err.code = "STAKE_NOT_FOUND";
        throw err;
    }
    const started = Date.parse(r.started_at);
    const maturity = Date.parse(r.maturity_at);
    const now = Date.now();
    const claimNow = claimablePt(r.total_pt_entitled, r.claimed_pt, started, maturity, now);
    if (claimNow <= 0) {
        const err = new Error("NOTHING_TO_CLAIM");
        err.code = "NOTHING_TO_CLAIM";
        throw err;
    }
    const newClaimed = r.claimed_pt + claimNow;
    database.exec("BEGIN IMMEDIATE");
    try {
        database
            .prepare(`UPDATE stake_positions SET claimed_pt = ? WHERE id = ? AND user_id = ?`)
            .run(newClaimed, stakeId, userId);
        userService.addPtBalance(userId, claimNow);
        database.exec("COMMIT");
    }
    catch (e) {
        try {
            database.exec("ROLLBACK");
        }
        catch {
            /* ignore */
        }
        throw e;
    }
    const user = userService.getUserById(userId);
    if (!user) {
        const err = new Error("USER_NOT_FOUND");
        err.code = "USER_NOT_FOUND";
        throw err;
    }
    const updatedStake = sqlRow(database.prepare(`SELECT * FROM stake_positions WHERE id = ?`).get(stakeId));
    return {
        user,
        claimedPt: claimNow,
        stake: rowToPublic(updatedStake),
    };
}
