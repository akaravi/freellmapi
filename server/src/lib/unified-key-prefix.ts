/** Default bearer-token prefix for newly generated unified API keys. */
export const DEFAULT_UNIFIED_KEY_PREFIX = 'freellmapi';

const PREFIX_ENV = 'FREEAPI_UNIFIED_KEY_PREFIX';
const MAX_PREFIX_LEN = 32;
const PREFIX_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

let cachedPrefix: string | undefined;

function normalizePrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${PREFIX_ENV} must not be empty when set`);
  }
  const withoutTrailingHyphen = trimmed.replace(/-+$/g, '');
  if (!withoutTrailingHyphen) {
    throw new Error(`${PREFIX_ENV} must contain at least one alphanumeric character`);
  }
  if (withoutTrailingHyphen.length > MAX_PREFIX_LEN) {
    throw new Error(`${PREFIX_ENV} must be at most ${MAX_PREFIX_LEN} characters`);
  }
  if (!PREFIX_PATTERN.test(withoutTrailingHyphen)) {
    throw new Error(
      `${PREFIX_ENV} may only contain letters, digits, underscore, and hyphen (must start with a letter or digit)`,
    );
  }
  return withoutTrailingHyphen;
}

/** Resolved prefix for new unified keys (env override or default `freellmapi`). */
export function getUnifiedKeyPrefix(): string {
  if (cachedPrefix !== undefined) return cachedPrefix;

  const envRaw = process.env[PREFIX_ENV];
  if (envRaw == null || envRaw === '') {
    cachedPrefix = DEFAULT_UNIFIED_KEY_PREFIX;
    return cachedPrefix;
  }

  cachedPrefix = normalizePrefix(envRaw);
  return cachedPrefix;
}

/** Test helper — reset memoized prefix between cases. */
export function resetUnifiedKeyPrefixCacheForTests(): void {
  cachedPrefix = undefined;
  delete process.env[PREFIX_ENV];
}
