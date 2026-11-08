// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  extractIosShortcutInput,
  handleIosShortcutNotification,
} from './iosShortcutRoute';

type Data = Record<string, unknown>;

function createFakeDb(initial: Record<string, Data>) {
  const store = new Map<string, Data>(Object.entries(initial));
  const writes: Array<{ path: string; data: Data }> = [];
  const docRef = (path: string): unknown => ({
    get: async () => ({
      id: path.split('/').pop(),
      exists: store.has(path),
      data: () => (store.has(path) ? { ...store.get(path) } : undefined),
    }),
    set: async (data: Data) => {
      writes.push({ path, data });
      store.set(path, { ...data });
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    get: async () => {
      const docs = [...store.entries()]
        .filter(([key]) => {
          const rest = key.slice(path.length + 1);
          return key.startsWith(`${path}/`) && !rest.includes('/');
        })
        .map(([key, data]) => ({
          id: key.slice(path.length + 1),
          data: () => ({ ...data }),
        }));
      return {
        empty: docs.length === 0,
        docs,
        forEach: (cb: (d: { id: string; data: () => Data }) => void) =>
          docs.forEach(cb),
      };
    },
    where: (field: string, _op: '==', value: unknown) => ({
      limit: (n: number) => ({
        get: async () => {
          const docs = [...store.entries()]
            .filter(([key, data]) => {
              const rest = key.slice(path.length + 1);
              return (
                key.startsWith(`${path}/`) &&
                !rest.includes('/') &&
                data[field] === value
              );
            })
            .slice(0, n)
            .map(([key, data]) => ({
              id: key.slice(path.length + 1),
              data: () => ({ ...data }),
            }));
          return { empty: docs.length === 0, docs };
        },
      }),
    }),
    limit: (n: number) => ({
      get: async () => {
        const docs = [...store.entries()]
          .filter(([key]) => {
            const rest = key.slice(path.length + 1);
            return key.startsWith(`${path}/`) && !rest.includes('/');
          })
          .slice(0, n)
          .map(([key, data]) => ({
            id: key.slice(path.length + 1),
            data: () => ({ ...data }),
          }));
        return { empty: docs.length === 0, docs };
      },
    }),
  });
  return {
    db: { collection: collectionRef } as unknown as Firestore,
    store,
    writes,
  };
}

describe('iOS Shortcut background webhook (/api/automation/ios-shortcut)', () => {
  it('extracts code and text from POST JSON body regardless of key name', () => {
    const out = extractIosShortcutInput({
      query: { code: 'ESP-ABC123' },
      body: {
        mensaje:
          'Bancolombia le informa Compra por $48.500 en CREPES Y WAFFLES con T.Debito *4321',
      },
    });
    expect(out.code).toBe('ESP-ABC123');
    expect(out.text).toContain('$48.500');
  });

  it('extracts unencoded spaces from raw originalUrl when sent via GET', () => {
    const out = extractIosShortcutInput({
      query: { code: 'ESP-ABC123', text: 'Bancolombia' },
      originalUrl:
        '/api/automation/ios-shortcut?code=ESP-ABC123&text=Bancolombia le informa Compra por $48.500 en CREPES Y WAFFLES',
    });
    expect(out.code).toBe('ESP-ABC123');
    expect(out.text).toBe(
      'Bancolombia le informa Compra por $48.500 en CREPES Y WAFFLES'
    );
  });

  it('saves a PENDING transaction in Firestore without opening the app', async () => {
    const { db, writes } = createFakeDb({
      'spaces/espacio_u_1': {
        name: 'Personal',
        code: 'ESP-ABC123',
        ownerUid: 'u_1',
        members: ['u_1'],
      },
      'spaces/espacio_u_1/topics/t_comida': {
        id: 't_comida',
        name: 'Comida',
        type: 'EXPENSE',
      },
    });

    const res = await handleIosShortcutNotification(
      {
        getDb: () => db,
        now: () => new Date('2026-11-08T20:00:00.000Z'),
        newId: () => 'test99',
      },
      {
        code: 'ESP-ABC123',
        text: 'Bancolombia le informa Compra por $48.500 en CREPES Y WAFFLES con T.Debito *4321',
      }
    );

    expect(res.httpStatus).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('PENDING');
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(
      'spaces/espacio_u_1/pending_transactions/ios_1794168000000_test99'
    );
    expect(writes[0].data).toMatchObject({
      type: 'EXPENSE',
      amount: 48500,
      description: 'Bancolombia: CREPES Y WAFFLES',
      category: 'Comida',
      topicId: 't_comida',
      paymentMethod: 'DEBITO',
      status: 'PENDING',
      source: 'SMS_WEBHOOK',
    });
  });

  it('returns 422 when notification text contains no valid amount', async () => {
    const { db, writes } = createFakeDb({
      'spaces/espacio_u_1': {
        name: 'Personal',
        code: 'ESP-ABC123',
        ownerUid: 'u_1',
        members: ['u_1'],
      },
    });

    const res = await handleIosShortcutNotification(
      { getDb: () => db },
      { code: 'ESP-ABC123', text: 'Bancolombia alerta de seguridad' }
    );

    expect(res.httpStatus).toBe(422);
    expect(res.body.error).toBe('no_valid_amount');
    expect(writes).toHaveLength(0);
  });

  it('resolves placeholder code ESP-SECURE to the primary space and parses multipart form bodies', async () => {
    const { db, writes } = createFakeDb({
      'spaces/espacio_principal': {
        name: 'Personal',
        code: 'ESP-3GF5A9',
        ownerUid: 'u_1',
        members: ['u_1'],
      },
    });

    const extracted = extractIosShortcutInput({
      query: { code: 'ESP-SECURE' },
      body: '--Boundary-123\r\nContent-Disposition: form-data; name="text"\r\n\r\nBancolombia le informa Compra por $48.500 en CREPES Y WAFFLES con T.Debito *4321\r\n--Boundary-123--',
    });

    const res = await handleIosShortcutNotification(
      { getDb: () => db, now: () => new Date('2026-11-08T20:00:00.000Z'), newId: () => 'sec1' },
      extracted
    );

    expect(res.httpStatus).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(
      'spaces/espacio_principal/pending_transactions/ios_1794168000000_sec1'
    );
  });
});
