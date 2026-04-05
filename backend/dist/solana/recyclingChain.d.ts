import { Connection, Keypair, PublicKey } from "@solana/web3.js";
export declare function isSolanaConfigured(): boolean;
export declare function getPartnerKeypair(): Keypair;
export declare function programIdPk(): PublicKey;
export declare function getConnection(): Connection;
export declare function mintBottleOnChain(input: {
    bottleId: string;
    rewardUsdcMicro: bigint;
    name: string;
    uri: string;
    custodialUserPubkey: PublicKey;
}): Promise<{
    bottleMint: Keypair;
    signature: string;
}>;
export declare function recycleBottleOnChain(input: {
    bottleId: string;
    bottleMintPubkey: PublicKey;
    custodialUserPubkey: PublicKey;
}): Promise<{
    signature: string;
}>;
