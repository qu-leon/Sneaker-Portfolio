import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const enabled = process.env.RUN_SUPABASE_SECURITY_TESTS === '1';
const tables = ['entries', 'deleted_entries'] as const;
const rowIds = new Set<string>();
const users: { client: SupabaseClient; id: string }[] = [];
let anonymous: SupabaseClient;
let baseUrl: string;
let anonKey: string;
let firstRowId: string;
let secondRowId: string;

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} to run local Supabase security tests.`);
  return value;
};

const validateConnection = (rawUrl: string, key: string) => {
  const url = new URL(rawUrl);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/'
  ) {
    throw new Error('Security tests only run against a loopback Supabase URL, never a hosted project.');
  }
  if (!key.startsWith('sb_publishable_')) {
    let role: unknown;
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role;
    } catch {
      throw new Error('Use a local anon JWT or publishable key, not a secret/service-role key.');
    }
    if (role !== 'anon') throw new Error('RLS tests must not use a secret/service-role key.');
  }
  return { baseUrl: url.origin, anonKey: key };
};

const newRowId = () => {
  const id = `security-test-${randomUUID()}`;
  rowIds.add(id);
  return id;
};

const entry = (userId: string, id: string) => ({
  user_id: userId,
  id,
  shoe_name: 'Security test sneaker',
  size: '10',
  purchase_date: '2026-10-15',
  purchase_price: 150,
  image_url: 'https://example.com/security-test.jpg',
});

describe('Supabase security test configuration', () => {
  test.each([
    'https://project.supabase.co',
    'https://127.0.0.1.example.com',
    'file:///local-database',
    'http://localhost:54321/unexpected-path',
    'http://user:password@localhost:54321',
  ])('refuses the non-local or ambiguous target %s', (url) => {
    expect(() => validateConnection(url, 'sb_publishable_test')).toThrow('loopback');
  });

  test.each(['sb_secret_test', 'not-an-anon-key'])(
    'refuses a secret or invalid key',
    (key) => expect(() => validateConnection('http://127.0.0.1:54321', key)).toThrow('service-role'),
  );

  test('refuses a legacy service-role JWT', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    expect(() => validateConnection('http://localhost:54321', `header.${payload}.signature`)).toThrow('service-role');
  });

  test.each(['localhost', '127.0.0.1', '[::1]'])('accepts the loopback host %s', (host) => {
    const url = `http://${host}:54321`;
    expect(validateConnection(url, 'sb_publishable_test').baseUrl).toBe(url);
  });

  test('accepts a legacy anon JWT', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
    const key = `header.${payload}.signature`;
    expect(validateConnection('http://localhost:54321', key).anonKey).toBe(key);
  });
});

describe.skipIf(!enabled)('local Supabase RLS security', () => {
  beforeAll(async () => {
    const connection = validateConnection(required('SECURITY_SUPABASE_URL'), required('SECURITY_SUPABASE_ANON_KEY'));
    baseUrl = connection.baseUrl;
    anonKey = connection.anonKey;

    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    anonymous = createClient(baseUrl, anonKey, options);
    for (const label of ['A', 'B']) {
      const client = createClient(baseUrl, anonKey, options);
      const { data, error } = await client.auth.signInWithPassword({
        email: required(`SECURITY_SUPABASE_USER_${label}_EMAIL`),
        password: required(`SECURITY_SUPABASE_USER_${label}_PASSWORD`),
      });
      if (error || !data.user || !data.session) {
        throw new Error(`Could not sign in local test user ${label}. Check the local test-account configuration.`);
      }
      users.push({ client, id: data.user.id });
      expect(data.user.role).toBe('authenticated');
    }
    expect(users[0].id).not.toBe(users[1].id);
    firstRowId = newRowId();
    secondRowId = newRowId();
    for (const table of tables) {
      for (const [index, user] of users.entries()) {
        const { error } = await user.client.from(table).insert(entry(user.id, index === 0 ? firstRowId : secondRowId));
        expect(error).toBeNull();
      }
    }
  }, 30000);

  afterAll(async () => {
    const errors: string[] = [];
    for (const user of users) {
      if (rowIds.size > 0) {
        for (const table of tables) {
          const { error } = await user.client.from(table).delete().eq('user_id', user.id).in('id', [...rowIds]);
          if (error) errors.push(`Failed to clean up test rows in ${table}.`);
        }
      }
      const { error } = await user.client.auth.signOut({ scope: 'local' });
      if (error) errors.push('Failed to sign out a local test session.');
    }
    expect(errors).toEqual([]);
  }, 30000);

  describe.each(tables)('%s', (table) => {
    test('lets each authenticated user manage their own rows', async () => {
      for (const user of users) {
        const id = newRowId();
        const inserted = await user.client.from(table).insert(entry(user.id, id)).select('id,user_id').single();
        expect(inserted.error).toBeNull();
        expect(inserted.data).toEqual({ id, user_id: user.id });
        const updated = await user.client.from(table).update({ shoe_name: 'Updated security sneaker' }).eq('id', id).select('shoe_name').single();
        expect(updated.error).toBeNull();
        expect(updated.data?.shoe_name).toBe('Updated security sneaker');
        const deleted = await user.client.from(table).delete().eq('id', id).select('id');
        expect(deleted.error).toBeNull();
        expect(deleted.data).toEqual([{ id }]);
        const readBack = await user.client.from(table).select('id').eq('id', id);
        expect(readBack.error).toBeNull();
        expect(readBack.data).toEqual([]);
      }
    });

    test('does not expose another user\'s rows even without a user_id filter', async () => {
      for (const [index, user] of users.entries()) {
        const result = await user.client.from(table).select('id,user_id').in('id', [firstRowId, secondRowId]);
        expect(result.error).toBeNull();
        expect(result.data).toEqual([{ id: index === 0 ? firstRowId : secondRowId, user_id: user.id }]);
      }
    });

    test('blocks forged ownership on insert and upsert', async () => {
      for (const operation of ['insert', 'upsert'] as const) {
        const id = newRowId();
        const result = await users[0].client.from(table)[operation](entry(users[1].id, id));
        expect(result.error?.code).toBe('42501');
        const readBack = await users[1].client.from(table).select('id').eq('id', id);
        expect(readBack.error).toBeNull();
        expect(readBack.data).toEqual([]);
      }
    });

    test('blocks changing the owner of an existing row', async () => {
      const result = await users[0].client.from(table).update({ user_id: users[1].id }).eq('id', firstRowId);
      expect(result.error?.code).toBe('42501');
    });

    test.each(['update', 'delete'] as const)('does not allow cross-user %s', async (operation) => {
      const query = operation === 'update'
        ? users[0].client.from(table).update({ shoe_name: 'Unauthorized change' })
        : users[0].client.from(table).delete();
      const result = await query.eq('id', secondRowId).select('id');
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
      const readBack = await users[1].client.from(table).select('shoe_name').eq('id', secondRowId).single();
      expect(readBack.error).toBeNull();
      expect(readBack.data?.shoe_name).toBe('Security test sneaker');
    });

    test('does not expose rows to anonymous requests', async () => {
      const result = await anonymous.from(table).select('id').in('id', [firstRowId, secondRowId]);
      if (result.error) expect([401, 403]).toContain(result.status);
      else expect(result.data).toEqual([]);
    });

    test('blocks anonymous inserts', async () => {
      const id = newRowId();
      const result = await anonymous.from(table).insert(entry(users[0].id, id));
      expect(result.error).not.toBeNull();
      const readBack = await users[0].client.from(table).select('id').eq('id', id);
      expect(readBack.error).toBeNull();
      expect(readBack.data).toEqual([]);
    });

    test.each(['update', 'delete'] as const)('blocks anonymous %s', async (operation) => {
      const query = operation === 'update'
        ? anonymous.from(table).update({ shoe_name: 'Anonymous change' })
        : anonymous.from(table).delete();
      const result = await query.eq('id', firstRowId).select('id');
      if (result.error) expect([401, 403]).toContain(result.status);
      else expect(result.data).toEqual([]);
      const readBack = await users[0].client.from(table).select('shoe_name').eq('id', firstRowId).single();
      expect(readBack.error).toBeNull();
      expect(readBack.data?.shoe_name).toBe('Security test sneaker');
    });

    test.each([0, -1])('rejects purchase price %s even when bypassing the UI', async (price) => {
      const result = await users[0].client.from(table).insert({
        ...entry(users[0].id, newRowId()), purchase_price: price,
      });
      expect(result.error?.code).toBe('23514');
    });

    test('rejects invalid dates even when bypassing the UI', async () => {
      const result = await users[0].client.from(table).insert({
        ...entry(users[0].id, newRowId()), purchase_date: '2026-02-30',
      });
      expect(result.error).not.toBeNull();
    });
  });

  test('rejects an invalid bearer token at the REST boundary', async () => {
    const response = await fetch(`${baseUrl}/rest/v1/entries?select=id`, {
      headers: { apikey: anonKey, Authorization: 'Bearer invalid-security-test-token' },
      signal: AbortSignal.timeout(10000),
    });
    expect([401, 403]).toContain(response.status);
  });

  test('rejects incorrect credentials through real Supabase Auth', async () => {
    const client = createClient(baseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: required('SECURITY_SUPABASE_USER_A_EMAIL'),
      password: `incorrect-${randomUUID()}`,
    });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  test.todo('verifies expired access tokens and expired/reused recovery links through real Auth');
});