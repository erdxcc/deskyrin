import { sqlRow, sqlRows } from "../db/cast.js";
import { getDb } from "../db/connection.js";
import type { PartnerRow } from "../types.js";

export interface PublicPartner {
  id: string;
  name: string;
  solanaPoolPartnerPubkey: string | null;
  createdAt: string;
}

function toPublic(row: PartnerRow): PublicPartner {
  return {
    id: row.id,
    name: row.name,
    solanaPoolPartnerPubkey: row.solana_pool_partner_pubkey,
    createdAt: row.created_at,
  };
}

export function createPartner(input: {
  id: string;
  name: string;
  solanaPoolPartnerPubkey?: string | null;
}): PublicPartner {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO partners (id, name, solana_pool_partner_pubkey) VALUES (?, ?, ?)`
    )
    .run(
      input.id,
      input.name,
      input.solanaPoolPartnerPubkey ?? null
    );
  const row = sqlRow<PartnerRow>(
    database.prepare(`SELECT * FROM partners WHERE id = ?`).get(input.id)
  )!;
  return toPublic(row);
}

export function getPartner(id: string): PublicPartner | null {
  const row = sqlRow<PartnerRow>(
    getDb().prepare(`SELECT * FROM partners WHERE id = ?`).get(id)
  );
  return row ? toPublic(row) : null;
}

/** Keeps catalog names in sync when seed display labels change. */
export function ensurePartnerName(id: string, name: string): PublicPartner | null {
  const database = getDb();
  const cur = getPartner(id);
  if (!cur) return null;
  if (cur.name === name) return cur;
  database.prepare(`UPDATE partners SET name = ? WHERE id = ?`).run(name, id);
  return getPartner(id);
}

export function setPartnerSolanaPubkey(
  id: string,
  solanaPoolPartnerPubkey: string | null
): PublicPartner | null {
  const database = getDb();
  const r = database
    .prepare(
      `UPDATE partners SET solana_pool_partner_pubkey = ? WHERE id = ?`
    )
    .run(solanaPoolPartnerPubkey, id);
  if (Number(r.changes) === 0) return null;
  return getPartner(id);
}

export function listPartners(): PublicPartner[] {
  const rows = sqlRows<PartnerRow>(
    getDb().prepare(`SELECT * FROM partners ORDER BY created_at ASC`).all()
  );
  return rows.map(toPublic);
}
