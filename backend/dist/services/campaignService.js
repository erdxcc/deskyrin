import { sqlRow, sqlRows } from "../db/cast.js";
import { getDb } from "../db/connection.js";
import * as partnerService from "./partnerService.js";
import * as userService from "./userService.js";
function taskRowToPublic(row, progress) {
    const pc = progress?.progress_count ?? 0;
    const done = progress ? progress.completed === 1 : false;
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        targetCount: row.target_count,
        acReward: row.token_reward,
        progressCount: pc,
        completed: done,
    };
}
export function listCampaigns() {
    const database = getDb();
    const rows = sqlRows(database
        .prepare(`SELECT c.*, p.name AS partner_name,
          (SELECT COUNT(*) FROM campaign_tasks t WHERE t.campaign_id = c.id) AS task_count
         FROM campaigns c
         JOIN partners p ON p.id = c.partner_id
         ORDER BY c.created_at DESC`)
        .all());
    return rows.map((r) => ({
        id: r.id,
        partnerId: r.partner_id,
        partnerName: r.partner_name,
        title: r.title,
        description: r.description,
        influencerName: r.influencer_name,
        partnerAdNote: r.partner_ad_note,
        createdAt: r.created_at,
        taskCount: r.task_count,
    }));
}
export function getCampaignDetail(campaignId, userId) {
    const database = getDb();
    const c = sqlRow(database.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(campaignId));
    if (!c)
        return null;
    const partner = partnerService.getPartner(c.partner_id);
    if (!partner)
        return null;
    const tasks = sqlRows(database
        .prepare(`SELECT * FROM campaign_tasks WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC`)
        .all(campaignId));
    let progressMap = new Map();
    if (userId) {
        const prog = sqlRows(database
            .prepare(`SELECT task_id, progress_count, completed FROM user_task_progress
           WHERE user_id = ? AND task_id IN (SELECT id FROM campaign_tasks WHERE campaign_id = ?)`)
            .all(userId, campaignId));
        progressMap = new Map(prog.map((p) => [p.task_id, p]));
    }
    return {
        id: c.id,
        partnerId: c.partner_id,
        partnerName: partner.name,
        title: c.title,
        description: c.description,
        influencerName: c.influencer_name,
        partnerAdNote: c.partner_ad_note,
        createdAt: c.created_at,
        taskCount: tasks.length,
        tasks: tasks.map((t) => taskRowToPublic(t, progressMap.get(t.id) ?? null)),
    };
}
export function seedCampaignIfMissing(input) {
    const database = getDb();
    const exists = sqlRow(database.prepare(`SELECT 1 AS n FROM campaigns WHERE id = ?`).get(input.id));
    if (exists)
        return;
    database
        .prepare(`INSERT INTO campaigns (id, partner_id, title, description, influencer_name, partner_ad_note)
       VALUES (?, ?, ?, ?, ?, ?)`)
        .run(input.id, input.partnerId, input.title, input.description, input.influencerName, input.partnerAdNote);
    const insTask = database.prepare(`INSERT INTO campaign_tasks (id, campaign_id, title, description, target_count, token_reward, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const t of input.tasks) {
        insTask.run(t.id, input.id, t.title, t.description, t.targetCount, t.tokenReward, t.sortOrder);
    }
}
export function recordTaskStep(userId, taskId) {
    const database = getDb();
    const task = sqlRow(database.prepare(`SELECT * FROM campaign_tasks WHERE id = ?`).get(taskId));
    if (!task) {
        const err = new Error("TASK_NOT_FOUND");
        err.code = "TASK_NOT_FOUND";
        throw err;
    }
    let awarded = 0;
    database.exec("BEGIN IMMEDIATE");
    try {
        const cur = sqlRow(database
            .prepare(`SELECT progress_count, completed FROM user_task_progress WHERE user_id = ? AND task_id = ?`)
            .get(userId, taskId));
        if (cur && cur.completed === 1) {
            database.exec("ROLLBACK");
            const err = new Error("TASK_ALREADY_COMPLETED");
            err.code = "TASK_ALREADY_COMPLETED";
            throw err;
        }
        const prev = cur?.progress_count ?? 0;
        const next = prev + 1;
        if (next >= task.target_count) {
            awarded = task.token_reward;
            database
                .prepare(`INSERT INTO user_task_progress (user_id, task_id, progress_count, completed, updated_at)
           VALUES (?, ?, ?, 1, datetime('now'))
           ON CONFLICT(user_id, task_id) DO UPDATE SET
             progress_count = excluded.progress_count,
             completed = 1,
             updated_at = datetime('now')`)
                .run(userId, taskId, task.target_count);
            if (awarded > 0) {
                userService.addAcBalance(userId, awarded);
            }
        }
        else {
            database
                .prepare(`INSERT INTO user_task_progress (user_id, task_id, progress_count, completed, updated_at)
           VALUES (?, ?, ?, 0, datetime('now'))
           ON CONFLICT(user_id, task_id) DO UPDATE SET
             progress_count = excluded.progress_count,
             completed = 0,
             updated_at = datetime('now')`)
                .run(userId, taskId, next);
        }
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
    const campaign = getCampaignDetail(task.campaign_id, userId);
    if (!campaign) {
        const err = new Error("CAMPAIGN_NOT_FOUND");
        err.code = "CAMPAIGN_NOT_FOUND";
        throw err;
    }
    return { user, campaign, awardedAc: awarded };
}
