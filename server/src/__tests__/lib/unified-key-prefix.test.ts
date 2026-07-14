import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_UNIFIED_KEY_PREFIX,
  getUnifiedKeyPrefix,
  resetUnifiedKeyPrefixCacheForTests,
} from '../../lib/unified-key-prefix.js';

describe('unified key prefix', () => {
  afterEach(() => {
    resetUnifiedKeyPrefixCacheForTests();
  });

  it('defaults to freellmapi when env is unset', () => {
    expect(getUnifiedKeyPrefix()).toBe(DEFAULT_UNIFIED_KEY_PREFIX);
  });

  it('uses FREEAPI_UNIFIED_KEY_PREFIX when set', () => {
    process.env.FREEAPI_UNIFIED_KEY_PREFIX = 'ntk';
    expect(getUnifiedKeyPrefix()).toBe('ntk');
  });

  it('strips trailing hyphens from configured prefix', () => {
    process.env.FREEAPI_UNIFIED_KEY_PREFIX = 'llmplugin-';
    expect(getUnifiedKeyPrefix()).toBe('llmplugin');
  });

  it('rejects empty configured prefix', () => {
    process.env.FREEAPI_UNIFIED_KEY_PREFIX = '   ';
    expect(() => getUnifiedKeyPrefix()).toThrow(/must not be empty/);
  });

  it('rejects invalid characters', () => {
    process.env.FREEAPI_UNIFIED_KEY_PREFIX = 'bad prefix';
    expect(() => getUnifiedKeyPrefix()).toThrow(/letters, digits/);
  });
});
