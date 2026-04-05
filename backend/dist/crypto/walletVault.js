import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const SALT = "recycling-wallet-v1";
function keyFromSecret(secret) {
    return scryptSync(secret, SALT, 32);
}
/** Сохраняем в БД: base64(iv + authTag + ciphertext) */
export function encryptSecret(plainUtf8, secret) {
    const key = keyFromSecret(secret);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(plainUtf8, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
}
export function decryptSecret(payloadB64, secret) {
    const key = keyFromSecret(secret);
    const buf = Buffer.from(payloadB64, "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + 16);
    const data = buf.subarray(IV_LEN + 16);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
