import { Router } from "express";
import { z } from "zod";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { requireAuth } from "../middleware/requireAuth.js";
import * as userService from "../services/userService.js";
export const walletRouter = Router();
walletRouter.post("/challenge", requireAuth, (req, res) => {
    const { nonce, message } = userService.issueWalletLinkChallenge(req.authUser.id);
    res.json({ nonce, message });
});
const linkBody = z.object({
    publicKey: z.string().min(32).max(64),
    signatureB58: z.string().min(40).max(2000),
    nonce: z.string().uuid(),
});
walletRouter.post("/link", requireAuth, (req, res, next) => {
    const parsed = linkBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    try {
        const msg = `Deskyrin wallet link\nUser: ${req.authUser.id}\nNonce: ${parsed.data.nonce}\n\nOnly sign if you trust this app.`;
        const sig = bs58.decode(parsed.data.signatureB58);
        const pk = new PublicKey(parsed.data.publicKey).toBytes();
        const ok = nacl.sign.detached.verify(new TextEncoder().encode(msg), sig, pk);
        if (!ok) {
            res.status(401).json({ error: "INVALID_SIGNATURE" });
            return;
        }
        const user = userService.linkExternalWallet(req.authUser.id, parsed.data.publicKey, parsed.data.nonce);
        res.json({ user });
    }
    catch (e) {
        const code = e.code;
        if (code === "INVALID_WALLET_LINK_NONCE" ||
            code === "CUSTODIAL_WALLET_ALREADY_EXISTS") {
            res.status(409).json({ error: code });
            return;
        }
        if (code === "USER_NOT_FOUND") {
            res.status(404).json({ error: code });
            return;
        }
        next(e);
    }
});
walletRouter.post("/create-custodial", requireAuth, (req, res, next) => {
    try {
        const { user } = userService.ensureCustodialWallet(req.authUser.id);
        res.status(201).json({ user });
    }
    catch (e) {
        const code = e.code;
        if (code === "EXTERNAL_WALLET_ALREADY_LINKED") {
            res.status(409).json({ error: code });
            return;
        }
        if (code === "USER_NOT_FOUND") {
            res.status(404).json({ error: code });
            return;
        }
        next(e);
    }
});
