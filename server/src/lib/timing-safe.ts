import crypto from 'crypto';

/** Constant-time string comparison for API keys. */
export function timingSafeStringEqual(provided: string, expected: string): boolean {
  const key = Buffer.alloc(32);
  const a = crypto.createHmac('sha256', key).update(provided).digest();
  const b = crypto.createHmac('sha256', key).update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
