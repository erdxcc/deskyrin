import jwt from "jsonwebtoken";
import { config } from "../config.js";
import * as userService from "./userService.js";
export function issueAccessToken(user) {
    const payload = { sub: user.id, email: user.email };
    const secret = config.jwtSecret;
    const signOpts = { expiresIn: config.jwtExpiresIn };
    const accessToken = jwt.sign(payload, secret, signOpts);
    return {
        accessToken,
        expiresIn: config.jwtExpiresIn,
        tokenType: "Bearer",
    };
}
export function register(email, password) {
    const user = userService.registerWithEmailPassword(email, password);
    const tokens = issueAccessToken(user);
    return { user, ...tokens };
}
export function login(email, password) {
    const user = userService.verifyCredentials(email, password);
    if (!user) {
        const err = new Error("INVALID_CREDENTIALS");
        err.code = "INVALID_CREDENTIALS";
        throw err;
    }
    const tokens = issueAccessToken(user);
    return { user, ...tokens };
}
export function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        const id = decoded.sub;
        const email = decoded.email;
        if (typeof id !== "string" || typeof email !== "string") {
            throw new Error("INVALID_TOKEN");
        }
        return { id, email };
    }
    catch {
        const err = new Error("INVALID_TOKEN");
        err.code = "INVALID_TOKEN";
        throw err;
    }
}
