import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey } from '../../db/index.js';
import { mintDashboardToken, isGatedApiPath } from '../helpers/auth.js';
import { resetUnifiedKeyPrefixCacheForTests } from '../../lib/unified-key-prefix.js';

let dashToken = '';

async function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const server = app.listen(0);
  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(isGatedApiPath(path) ? { Authorization: `Bearer ${dashToken}` } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  server.close();
  return { status: res.status, body: data };
}

describe('Unified API keys', () => {
  let app: Express;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dashToken = mintDashboardToken();
  });

  afterEach(() => {
    resetUnifiedKeyPrefixCacheForTests();
  });

  it('GET /api/settings/api-keys lists seeded legacy key', async () => {
    const legacy = getUnifiedApiKey();
    const { status, body } = await request(app, 'GET', '/api/settings/api-keys');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect((body as any[]).length).toBeGreaterThanOrEqual(1);
    expect((body as any[])[0].maskedKey).toMatch(/freellmapi|free\.\.\./);
    expect((body as any[])[0].enabled).toBe(true);

    const reveal = await request(app, 'GET', `/api/settings/api-keys/${(body as any[])[0].id}`);
    expect(reveal.status).toBe(200);
    expect((reveal.body as any).apiKey).toBe(legacy);
  });

  it('POST /api/settings/api-keys creates a second key that authenticates proxy', async () => {
    const created = await request(app, 'POST', '/api/settings/api-keys', { label: 'CI client' });
    expect(created.status).toBe(201);
    const apiKey = (created.body as any).apiKey as string;
    expect(apiKey).toMatch(/^freellmapi-/);

    const proxy = await request(
      app,
      'POST',
      '/v1/chat/completions',
      { model: 'auto', messages: [{ role: 'user', content: 'hi' }] },
      { Authorization: `Bearer ${apiKey}` },
    );
    expect(proxy.status).not.toBe(401);

    const list = await request(app, 'GET', '/api/settings/api-keys');
    expect((list.body as any[]).length).toBeGreaterThanOrEqual(2);
  });

  it('PATCH can disable a key and reject it on /v1', async () => {
    const created = await request(app, 'POST', '/api/settings/api-keys', { label: 'temp' });
    const id = (created.body as any).id as number;
    const apiKey = (created.body as any).apiKey as string;

    const disabled = await request(app, 'PATCH', `/api/settings/api-keys/${id}`, { enabled: false });
    expect(disabled.status).toBe(200);
    expect((disabled.body as any).enabled).toBe(false);

    const proxy = await request(
      app,
      'POST',
      '/v1/chat/completions',
      { model: 'auto', messages: [{ role: 'user', content: 'hi' }] },
      { Authorization: `Bearer ${apiKey}` },
    );
    expect(proxy.status).toBe(401);
  });

  it('PATCH label updates metadata', async () => {
    const created = await request(app, 'POST', '/api/settings/api-keys', { label: 'before' });
    const id = (created.body as any).id as number;
    const updated = await request(app, 'PATCH', `/api/settings/api-keys/${id}`, { label: 'after' });
    expect(updated.status).toBe(200);
    expect((updated.body as any).label).toBe('after');
  });

  it('cannot disable the last enabled unified key', async () => {
    const list = await request(app, 'GET', '/api/settings/api-keys');
    const enabled = (list.body as any[]).filter((k: any) => k.enabled);
    if (enabled.length !== 1) return;
    const only = enabled[0];
    const res = await request(app, 'PATCH', `/api/settings/api-keys/${only.id}`, { enabled: false });
    expect(res.status).toBe(400);
  });

  it('DELETE removes a key when more than one exists', async () => {
    const second = await request(app, 'POST', '/api/settings/api-keys', { label: 'deletable' });
    const id = (second.body as any).id as number;
    const del = await request(app, 'DELETE', `/api/settings/api-keys/${id}`);
    expect(del.status).toBe(204);
    const reveal = await request(app, 'GET', `/api/settings/api-keys/${id}`);
    expect(reveal.status).toBe(404);
  });

  it('POST /api/settings/api-keys uses FREEAPI_UNIFIED_KEY_PREFIX for new keys', async () => {
    process.env.FREEAPI_UNIFIED_KEY_PREFIX = 'ntk';
    const created = await request(app, 'POST', '/api/settings/api-keys', { label: 'custom-prefix' });
    expect(created.status).toBe(201);
    expect((created.body as any).apiKey).toMatch(/^ntk-[a-f0-9]{48}$/);
  });

  it('legacy GET /api/settings/api-key returns first enabled key', async () => {
    const { status, body } = await request(app, 'GET', '/api/settings/api-key');
    expect(status).toBe(200);
    expect((body as any).apiKey).toMatch(/^freellmapi-/);
  });
});
