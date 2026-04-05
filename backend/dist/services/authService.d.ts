import type { PublicUser } from "./userService.js";
export interface AuthTokens {
    accessToken: string;
    expiresIn: string;
    tokenType: "Bearer";
}
export declare function issueAccessToken(user: PublicUser): AuthTokens;
export declare function register(email: string, password: string): {
    accessToken: string;
    expiresIn: string;
    tokenType: "Bearer";
    user: PublicUser;
};
export declare function login(email: string, password: string): {
    accessToken: string;
    expiresIn: string;
    tokenType: "Bearer";
    user: PublicUser;
};
export declare function verifyAccessToken(token: string): {
    id: string;
    email: string;
};
