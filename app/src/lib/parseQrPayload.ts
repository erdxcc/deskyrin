/**
 * Turn QR raw text into a bottle / product id.
 * Supports plain ids (e.g. BOTTLE_001) and URLs with path or query (?id= & bottle= & code=).
 */
export function parseQrPayload(raw: string): string {
  const t = raw.trim();
  if (!t) return "";

  try {
    const u = new URL(t);
    const fromQuery =
      u.searchParams.get("id") ??
      u.searchParams.get("bottle") ??
      u.searchParams.get("code");
    if (fromQuery?.trim()) return fromQuery.trim();

    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      const decoded = decodeURIComponent(last);
      if (decoded && !/\.[a-z0-9]{2,4}$/i.test(decoded)) return decoded;
    }
  } catch {
    /* not a URL */
  }

  return t;
}
