import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('browser bundle security', () => {
  test('does not bundle server-only credentials', async () => {
    const kicksKey = 'security-canary-private-kicksdb-value';
    const serviceKey = 'security-canary-private-service-role-value';
    const publicKey = 'security-canary-public-anon-value';
    vi.stubEnv('KICKSDB_API_KEY', kicksKey);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', serviceKey);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://security-test.invalid');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', publicKey);

    const result = await build({
      configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
      mode: 'test',
      logLevel: 'silent',
      build: { write: false, minify: false },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const browserCode = outputs.flatMap((output) => {
      if (!('output' in output)) throw new Error('Expected a one-shot browser build.');
      return output.output.map((asset) => asset.type === 'chunk'
        ? asset.code
        : typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8'));
    }).join('\n');

    expect(browserCode.length).toBeGreaterThan(0);
    expect(browserCode.includes(publicKey)).toBe(true);
    expect(browserCode.includes(kicksKey)).toBe(false);
    expect(browserCode.includes(serviceKey)).toBe(false);
  }, 30000);
});