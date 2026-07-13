import crypto from 'crypto';
import type { Db } from '../db/types.js';
import { getDb } from '../db/index.js';
import { decrypt, encrypt, maskKey } from '../lib/crypto.js';
import { timingSafeStringEqual } from '../lib/timing-safe.js';

export interface UnifiedApiKeyRow {
  id: number;
  label: string;
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  enabled: number;
  created_at: string;
}

export interface UnifiedApiKeyListItem {
  id: number;
  label: string;
  maskedKey: string;
  enabled: boolean;
  createdAt: string;
}

export interface UnifiedApiKeyDetail extends UnifiedApiKeyListItem {
  apiKey: string;
}

function generateKeyValue(): string {
  return `freellmapi-${crypto.randomBytes(24).toString('hex')}`;
}

function rowToListItem(row: UnifiedApiKeyRow): UnifiedApiKeyListItem {
  let maskedKey = '****';
  try {
    maskedKey = maskKey(decrypt(row.encrypted_key, row.iv, row.auth_tag));
  } catch {
    maskedKey = '[decrypt failed]';
  }
  return {
    id: row.id,
    label: row.label,
    maskedKey,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

function decryptRow(row: UnifiedApiKeyRow): string {
  return decrypt(row.encrypted_key, row.iv, row.auth_tag);
}

function insertEncryptedKey(db: Db, label: string, rawKey: string, enabled = true): number {
  const { encrypted, iv, authTag } = encrypt(rawKey);
  const result = db.prepare(`
    INSERT INTO unified_api_keys (label, encrypted_key, iv, auth_tag, enabled)
    VALUES (?, ?, ?, ?, ?)
  `).run(label, encrypted, iv, authTag, enabled ? 1 : 0);
  return Number(result.lastInsertRowid);
}

/** Migrate settings.unified_api_key into unified_api_keys when the table is empty. */
export function seedUnifiedKeysFromLegacy(db = getDb()): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM unified_api_keys').get() as { c: number }).c;
  if (count > 0) return;

  const legacy = db.prepare("SELECT value FROM settings WHERE key = 'unified_api_key'").get() as
    | { value: string }
    | undefined;

  const rawKey = legacy?.value?.trim() || generateKeyValue();
  insertEncryptedKey(db, '', rawKey, true);
}

export function listUnifiedApiKeys(): UnifiedApiKeyListItem[] {
  seedUnifiedKeysFromLegacy();
  const db = getDb();
  const rows = db.prepare('SELECT * FROM unified_api_keys ORDER BY created_at ASC, id ASC').all() as UnifiedApiKeyRow[];
  return rows.map(rowToListItem);
}

export function getUnifiedApiKeyById(id: number): UnifiedApiKeyDetail | null {
  seedUnifiedKeysFromLegacy();
  const db = getDb();
  const row = db.prepare('SELECT * FROM unified_api_keys WHERE id = ?').get(id) as UnifiedApiKeyRow | undefined;
  if (!row) return null;
  try {
    return { ...rowToListItem(row), apiKey: decryptRow(row) };
  } catch {
    return null;
  }
}

export function createUnifiedApiKey(label = ''): UnifiedApiKeyDetail {
  seedUnifiedKeysFromLegacy();
  const rawKey = generateKeyValue();
  const id = insertEncryptedKey(getDb(), label.trim(), rawKey, true);
  const created = getUnifiedApiKeyById(id);
  if (!created) throw new Error('Failed to create unified API key');
  return created;
}

export function updateUnifiedApiKey(
  id: number,
  patch: { label?: string; enabled?: boolean; regenerate?: boolean },
): UnifiedApiKeyListItem | null {
  seedUnifiedKeysFromLegacy();
  const db = getDb();
  const row = db.prepare('SELECT * FROM unified_api_keys WHERE id = ?').get(id) as UnifiedApiKeyRow | undefined;
  if (!row) return null;

  if (patch.regenerate) {
    const rawKey = generateKeyValue();
    const { encrypted, iv, authTag } = encrypt(rawKey);
    db.prepare(`
      UPDATE unified_api_keys SET encrypted_key = ?, iv = ?, auth_tag = ? WHERE id = ?
    `).run(encrypted, iv, authTag, id);
  }

  if (patch.label !== undefined) {
    db.prepare('UPDATE unified_api_keys SET label = ? WHERE id = ?').run(patch.label.trim(), id);
  }

  if (patch.enabled !== undefined) {
    if (!patch.enabled) {
      const enabledCount = (db.prepare(
        'SELECT COUNT(*) AS c FROM unified_api_keys WHERE enabled = 1 AND id != ?',
      ).get(id) as { c: number }).c;
      if (enabledCount === 0) {
        throw new Error('At least one unified API key must stay enabled');
      }
    }
    db.prepare('UPDATE unified_api_keys SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, id);
  }

  const updated = db.prepare('SELECT * FROM unified_api_keys WHERE id = ?').get(id) as UnifiedApiKeyRow;
  return rowToListItem(updated);
}

export function regenerateUnifiedApiKeyDetail(id: number): UnifiedApiKeyDetail | null {
  const list = updateUnifiedApiKey(id, { regenerate: true });
  if (!list) return null;
  return getUnifiedApiKeyById(id);
}

export function deleteUnifiedApiKey(id: number): boolean {
  seedUnifiedKeysFromLegacy();
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) AS c FROM unified_api_keys').get() as { c: number }).c;
  if (total <= 1) {
    throw new Error('Cannot delete the last unified API key');
  }
  const result = db.prepare('DELETE FROM unified_api_keys WHERE id = ?').run(id);
  return result.changes > 0;
}

/** First enabled key (oldest). Used by legacy endpoints and desktop copy. */
export function getUnifiedApiKey(): string {
  seedUnifiedKeysFromLegacy();
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM unified_api_keys WHERE enabled = 1 ORDER BY created_at ASC, id ASC LIMIT 1
  `).get() as UnifiedApiKeyRow | undefined;
  if (!row) {
    const created = createUnifiedApiKey('');
    return created.apiKey;
  }
  return decryptRow(row);
}

export function regenerateUnifiedKey(): string {
  seedUnifiedKeysFromLegacy();
  const db = getDb();
  const row = db.prepare(`
    SELECT id FROM unified_api_keys ORDER BY created_at ASC, id ASC LIMIT 1
  `).get() as { id: number } | undefined;
  if (!row) {
    return createUnifiedApiKey('').apiKey;
  }
  const detail = regenerateUnifiedApiKeyDetail(row.id);
  return detail?.apiKey ?? generateKeyValue();
}

export function isValidUnifiedApiKey(token: string): boolean {
  if (!token) return false;
  seedUnifiedKeysFromLegacy();
  const db = getDb();
  const rows = db.prepare('SELECT * FROM unified_api_keys WHERE enabled = 1').all() as UnifiedApiKeyRow[];
  for (const row of rows) {
    try {
      const expected = decryptRow(row);
      if (timingSafeStringEqual(token, expected)) return true;
    } catch {
      // skip undecryptable rows
    }
  }
  return false;
}
