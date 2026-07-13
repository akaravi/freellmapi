import type { Db } from '../types.js';

/**
 * Multiple unified API keys (dashboard auth tokens for /v1, /v1/messages, MCP).
 * Legacy single key in settings.unified_api_key is migrated at runtime after
 * encryption init (see services/unified-keys.ts seedUnifiedKeysFromLegacy).
 */
export function up(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS unified_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL DEFAULT '',
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_unified_api_keys_enabled ON unified_api_keys(enabled);
  `);
}

export function down(db: Db): void {
  db.exec('DROP TABLE IF EXISTS unified_api_keys');
}
