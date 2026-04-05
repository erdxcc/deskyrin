/** Сохраняем в БД: base64(iv + authTag + ciphertext) */
export declare function encryptSecret(plainUtf8: string, secret: string): string;
export declare function decryptSecret(payloadB64: string, secret: string): string;
