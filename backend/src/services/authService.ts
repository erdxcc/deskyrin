import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { config } from "../config.js";
import type { PublicUser } from "./userService.js";
import * as userService from "./userService.js";

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
  tokenType: "Bearer";
}

export function issueAccessToken(user: PublicUser): AuthTokens {
  const payload = { sub: user.id, email: user.email };
  const secret: Secret = config.jwtSecret;
  const signOpts = { expiresIn: config.jwtExpiresIn } as SignOptions;
  const accessToken = jwt.sign(payload, secret, signOpts);
  return {
    accessToken,
    expiresIn: config.jwtExpiresIn,
    tokenType: "Bearer",
  };
}

export function register(email: string, password: string) {
  const user = userService.registerWithEmailPassword(email, password);
  const tokens = issueAccessToken(user);
  return { user, ...tokens };
}

export function login(email: string, password: string) {
  const user = userService.verifyCredentials(email, password);
  if (!user) {
    const err = new Error("INVALID_CREDENTIALS");
    (err as Error & { code: string }).code = "INVALID_CREDENTIALS";
    throw err;
  }
  const tokens = issueAccessToken(user);
  return { user, ...tokens };
}

export function verifyAccessToken(token: string): { id: string; email: string } {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    const id = decoded.sub;
    const email = decoded.email;
    if (typeof id !== "string" || typeof email !== "string") {
      throw new Error("INVALID_TOKEN");
    }
    return { id, email };
  } catch {
    const err = new Error("INVALID_TOKEN");
    (err as Error & { code: string }).code = "INVALID_TOKEN";
    throw err;
  }
}
