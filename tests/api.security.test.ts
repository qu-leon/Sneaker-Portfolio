import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const serverSource = readFileSync(new URL('../kicksdb-api-server.cjs', import.meta.url), 'utf8');
const apiKey = 'security-test-kicksdb-key';
const upstreamRequest = vi.fn();
const serverConsole = { log: vi.fn(), error: vi.fn() };
let server: Server | undefined;
let origin: string;

beforeEach(async () => {
  vi.resetAllMocks();
  upstreamRequest.mockResolvedValue({
    statusCode: 200,
    body: { json: async () => ({ data: [] }) },
  });
  const app = require('express')();
  app.listen = vi.fn();

  runInNewContext(serverSource, {
    require: (name: string) => {
      if (name === 'express') return () => app;
      if (name === 'undici') return { request: upstreamRequest };
      return require(name);
    },
    process: { env: { KICKSDB_API_KEY: apiKey }, on: vi.fn() },
    console: serverConsole,
    URL,
  }, { filename: 'kicksdb-api-server.cjs' });

  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  if (!server?.listening) return;
  const activeServer = server;
  activeServer.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    activeServer.close((error) => error ? reject(error) : resolve());
  });
  server = undefined;
});

describe('API security', () => {
  test.each(['/search-products', '/search-image'])(
    '%s rejects missing and blank queries without calling KicksDB',
    async (path) => {
      for (const suffix of ['', '?q=%20%20']) {
        const response = await fetch(`${origin}${path}${suffix}`);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Query parameter q is required.' });
      }
      expect(upstreamRequest).not.toHaveBeenCalled();
    },
  );

  test.each([
    ['100000', 20],
    ['-100', 1],
    ['not-a-number', 8],
    ['1.5', 8],
  ])('bounds the requested result limit %s to %s', async (input, expected) => {
    const response = await fetch(`${origin}/search-products?q=Jordan&limit=${input}`);
    expect(response.status).toBe(200);
    const [url] = upstreamRequest.mock.calls[0];
    expect(url.searchParams.get('limit')).toBe(String(expected));
  });

  test('keeps URL-like search input on the configured upstream host', async () => {
    const query = 'http://127.0.0.1/private?limit=999&filters=other';
    const response = await fetch(`${origin}/search-products?${new URLSearchParams({ q: query })}`);
    expect(response.status).toBe(200);
    const [url, options] = upstreamRequest.mock.calls[0];
    expect(url.origin).toBe('https://api.kicks.dev');
    expect(url.pathname).toBe('/v3/stockx/products');
    expect(url.searchParams.get('query')).toBe(query);
    expect(url.searchParams.get('filters')).toBe('product_type = "sneakers"');
    expect(url.searchParams.get('limit')).toBe('8');
    expect(options.headers.Authorization).toBe(apiKey);
    expect(options.bodyTimeout).toBe(8000);
    expect(options.headersTimeout).toBe(8000);
  });

  test.each(['/search-products', '/search-image'])(
    '%s does not expose credentials or upstream exception details',
    async (path) => {
      upstreamRequest.mockRejectedValueOnce(new Error(`Upstream rejected ${apiKey}`));
      const response = await fetch(`${origin}${path}?q=Jordan`);
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).not.toContain(apiKey);
      expect(body).not.toContain('Upstream rejected');
      expect(JSON.stringify(serverConsole.error.mock.calls)).not.toContain(apiKey);
    },
  );

  test('does not pass browser-supplied Authorization headers upstream', async () => {
    const response = await fetch(`${origin}/search-products?q=Jordan`, {
      headers: { Authorization: 'Bearer untrusted-browser-token' },
    });
    expect(response.status).toBe(200);
    expect(upstreamRequest.mock.calls[0][1].headers).toEqual({ Authorization: apiKey });
    expect(await response.text()).not.toContain(apiKey);
  });

  test.each(['javascript:alert(1)', 'data:text/html,test'])(
    'does not return the unsafe product image URL %s as an image source',
    async (unsafeUrl) => {
      upstreamRequest.mockResolvedValue({
        statusCode: 200,
        body: {
          json: async () => ({
            data: [{ id: 'test-product', title: 'Jordan', product_type: 'sneakers', image: unsafeUrl }],
          }),
        },
      });
      const products = await fetch(`${origin}/search-products?q=Jordan`);
      expect((await products.json()).results[0].imageUrl).toBeNull();
      const image = await fetch(`${origin}/search-image?q=Jordan`);
      const payload = await image.json();
      expect(payload.imageUrl).toMatch(/^https:\/\//);
      expect(payload.source).toBe('query-fallback');
    },
  );

  test('does not let fallback search text introduce separate URL parameters', async () => {
    const query = 'Jordan?token=private&redirect=https://example.com';
    const response = await fetch(`${origin}/search-image?${new URLSearchParams({ q: query })}`);
    const payload = await response.json();
    const image = new URL(payload.imageUrl);
    expect(image.origin).toBe('https://source.unsplash.com');
    expect(image.pathname).toBe('/600x600/');
    expect(image.search).toBe(`?${encodeURIComponent(query)},sneaker`);
    expect(image.searchParams.has('redirect')).toBe(false);
    expect(image.searchParams.has('token')).toBe(false);
  });

  test.todo('enforces an explicit access policy before using paid KicksDB quota');
  test.todo('rate-limits repeated searches before calling KicksDB');
  test.todo('rejects oversized and non-string query parameters');
  test.todo('applies the intended browser-origin allowlist, without treating CORS as authentication');
});