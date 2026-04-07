import * as userService from "./userService.js";
export interface PublicCampaignSummary {
    id: string;
    partnerId: string;
    partnerName: string;
    title: string;
    description: string | null;
    influencerName: string;
    partnerAdNote: string | null;
    createdAt: string;
    taskCount: number;
}
export interface PublicCampaignTask {
    id: string;
    title: string;
    description: string | null;
    targetCount: number;
    /** AC credited when the task is fully completed. */
    acReward: number;
    progressCount: number;
    completed: boolean;
}
export interface PublicCampaignDetail extends PublicCampaignSummary {
    tasks: PublicCampaignTask[];
}
export declare function listCampaigns(): PublicCampaignSummary[];
export declare function getCampaignDetail(campaignId: string, userId: string | null): PublicCampaignDetail | null;
export declare function seedCampaignIfMissing(input: {
    id: string;
    partnerId: string;
    title: string;
    description: string | null;
    influencerName: string;
    partnerAdNote: string | null;
    tasks: Array<{
        id: string;
        title: string;
        description: string | null;
        targetCount: number;
        tokenReward: number;
        sortOrder: number;
    }>;
}): void;
export declare function recordTaskStep(userId: string, taskId: string): {
    user: userService.PublicUser;
    campaign: PublicCampaignDetail;
    awardedAc: number;
};
