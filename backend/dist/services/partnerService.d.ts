export interface PublicPartner {
    id: string;
    name: string;
    solanaPoolPartnerPubkey: string | null;
    createdAt: string;
}
export declare function createPartner(input: {
    id: string;
    name: string;
    solanaPoolPartnerPubkey?: string | null;
}): PublicPartner;
export declare function getPartner(id: string): PublicPartner | null;
/** Keeps catalog names in sync when seed display labels change. */
export declare function ensurePartnerName(id: string, name: string): PublicPartner | null;
export declare function setPartnerSolanaPubkey(id: string, solanaPoolPartnerPubkey: string | null): PublicPartner | null;
export declare function listPartners(): PublicPartner[];
