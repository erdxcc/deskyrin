import type {
  AuthResponse,
  FirstScanResponse,
  PublicPartner,
  QrPublic,
  User,
} from "./types";

const base =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

function authHeader(token: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const raw = (data as { error?: unknown; message?: string }).error;
    const detail = (data as { message?: string }).message;
    let msg =
      typeof raw === "string"
        ? raw
        : raw != null
          ? JSON.stringify(raw)
          : detail ?? res.statusText;
    if (typeof raw === "string" && detail?.trim()) {
      msg = `${raw}: ${detail}`;
    }
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  async register(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${base}/api/v1/auth/register`, {
      method: "POST",
      headers: authHeader(null),
      body: JSON.stringify({ email, password }),
    });
    return parse<AuthResponse>(res);
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: authHeader(null),
      body: JSON.stringify({ email, password }),
    });
    return parse<AuthResponse>(res);
  },

  async me(token: string): Promise<User> {
    const res = await fetch(`${base}/api/v1/auth/me`, {
      headers: authHeader(token),
    });
    return parse<User>(res);
  },

  async firstScan(token: string, bottleId: string): Promise<FirstScanResponse> {
    const res = await fetch(`${base}/api/v1/events/first-scan`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify({ bottleId }),
    });
    return parse<FirstScanResponse>(res);
  },

  async demoRecycle(bottleId: string): Promise<{ qr: QrPublic }> {
    const res = await fetch(`${base}/api/v1/demo/recycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bottleId }),
    });
    return parse<{ qr: QrPublic }>(res);
  },

  async getQr(bottleId: string): Promise<QrPublic> {
    const res = await fetch(
      `${base}/api/v1/qr/${encodeURIComponent(bottleId)}`
    );
    return parse<QrPublic>(res);
  },

  async listPartners(): Promise<{ partners: PublicPartner[] }> {
    const res = await fetch(`${base}/api/v1/partners`);
    return parse<{ partners: PublicPartner[] }>(res);
  },

  async getPartner(partnerId: string): Promise<PublicPartner> {
    const res = await fetch(
      `${base}/api/v1/partners/${encodeURIComponent(partnerId)}`
    );
    return parse<PublicPartner>(res);
  },

  async redeemRewards(
    token: string,
    input: { partnerId: string; amountUsdcMicro: number }
  ): Promise<{ user: User }> {
    const res = await fetch(`${base}/api/v1/rewards/redeem`, {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify(input),
    });
    return parse<{ user: User }>(res);
  },
};
