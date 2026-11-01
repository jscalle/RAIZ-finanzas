// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  decideSpaceAccessRequest,
  findSpaceByCodeOrId,
  requestSpaceAccess,
} from './spaceAccess';

type Data = Record<string, unknown>;

// In-memory stand-in for the Admin Firestore surface used here:
// collection().doc().get()/set(), nested collections and
// collection().where(field, '==', value).limit(n).get().
function createFakeDb(initial: Record<string, Data>) {
  const store = new Map<string, Data>(Object.entries(initial));
  const writes: string[] = [];
  const docRef = (path: string): unknown => ({
    get: async () => ({
      id: path.split('/').pop(),
      exists: store.has(path),
      data: () => (store.has(path) ? { ...store.get(path) } : undefined),
    }),
    set: async (data: Data, options?: { merge?: boolean }) => {
      writes.push(path);
      store.set(
        path,
        options?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data }
      );
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
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
  });
  return {
    db: { collection: collectionRef } as unknown as Firestore,
    store,
    writes,
  };
}

const OWNER = 'owner-uid';
const REQUESTER = 'requester-uid';
const SPACE_ID = 'espacio_familia';
const SPACE_CODE = 'ESP-ABC234';
const REQUEST_PATH = `spaces/${SPACE_ID}/access_requests/req_${REQUESTER}`;
const NOW = new Date('2026-11-01T12:00:00.000Z');

const requesterToken = {
  uid: REQUESTER,
  email: 'requester@example.com',
  name: 'Requester Name',
};

function spaceState(): Record<string, Data> {
  return {
    [`spaces/${SPACE_ID}`]: {
      name: 'Familia',
      code: SPACE_CODE,
      ownerUid: OWNER,
      ownerEmail: 'owner@example.com',
      members: [OWNER, 'member-uid'],
    },
  };
}

describe('POST /api/spaces/request-access (S7 / contract C1)', () => {
  it('answers 404 not_found when no space has that code or id', async () => {
    const { db, writes } = createFakeDb(spaceState());
    await expect(
      requestSpaceAccess(db, {
        caller: requesterToken,
        body: { code: 'ESP-NOPE99' },
        now: NOW,
      })
    ).resolves.toEqual({ httpStatus: 404, body: { error: 'not_found' } });
    expect(writes).toEqual([]);
  });

  it('answers 400 when the code is missing or not a string', async () => {
    const { db } = createFakeDb(spaceState());
    for (const body of [{}, { code: '' }, { code: 42 }, null]) {
      await expect(
        requestSpaceAccess(db, { caller: requesterToken, body, now: NOW })
      ).resolves.toMatchObject({ httpStatus: 400 });
    }
  });

  it('tells an existing member or the owner they are a member without writing a request', async () => {
    const { db, writes } = createFakeDb(spaceState());
    for (const uid of ['member-uid', OWNER]) {
      await expect(
        requestSpaceAccess(db, {
          caller: { uid, email: `${uid}@example.com` },
          body: { code: SPACE_CODE },
          now: NOW,
        })
      ).resolves.toEqual({
        httpStatus: 200,
        body: { status: 'member', spaceId: SPACE_ID, spaceName: 'Familia' },
      });
    }
    expect(writes).toEqual([]);
  });

  it('creates a pending web request from the verified token, never from the body', async () => {
    const { db, store } = createFakeDb(spaceState());

    const result = await requestSpaceAccess(db, {
      caller: requesterToken,
      body: {
        code: SPACE_CODE.toLowerCase(),
        email: 'spoofed@example.com',
        displayName: 'Spoofed',
        userId: 'spoofed-uid',
        status: 'approved',
      },
      now: NOW,
    });

    expect(result).toEqual({
      httpStatus: 200,
      body: { status: 'pending', spaceId: SPACE_ID, spaceName: 'Familia' },
    });
    expect(JSON.stringify(result.body)).not.toContain('owner@example.com');
    expect(result.body).not.toHaveProperty('members');
    expect(store.get(REQUEST_PATH)).toMatchObject({
      userId: REQUESTER,
      email: 'requester@example.com',
      displayName: 'Requester Name',
      status: 'pending',
      type: 'web',
      createdAt: NOW.toISOString(),
    });
    expect(JSON.stringify(store.get(REQUEST_PATH))).not.toContain('spoofed');
  });

  it('is idempotent: a second call keeps the same pending request', async () => {
    const { db, store } = createFakeDb(spaceState());
    await requestSpaceAccess(db, {
      caller: requesterToken,
      body: { code: SPACE_CODE },
      now: NOW,
    });
    const first = store.get(REQUEST_PATH);

    await expect(
      requestSpaceAccess(db, {
        caller: requesterToken,
        body: { code: SPACE_CODE },
        now: new Date('2026-11-02T12:00:00.000Z'),
      })
    ).resolves.toMatchObject({ httpStatus: 200, body: { status: 'pending' } });
    expect(store.get(REQUEST_PATH)).toEqual(first);
  });

  it('re-opens a rejected request as pending and drops the previous decision', async () => {
    const state = spaceState();
    state[REQUEST_PATH] = {
      userId: REQUESTER,
      status: 'rejected',
      decidedBy: OWNER,
      decidedAt: '2026-10-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const { db, store } = createFakeDb(state);

    await expect(
      requestSpaceAccess(db, {
        caller: requesterToken,
        body: { code: SPACE_ID },
        now: NOW,
      })
    ).resolves.toEqual({
      httpStatus: 200,
      body: { status: 'pending', spaceId: SPACE_ID, spaceName: 'Familia' },
    });
    const reopened = store.get(REQUEST_PATH);
    expect(reopened).toMatchObject({
      status: 'pending',
      createdAt: NOW.toISOString(),
    });
    expect(reopened).not.toHaveProperty('decidedBy');
    expect(reopened).not.toHaveProperty('decidedAt');
  });

  it('returns approved for an already approved request without rewriting it', async () => {
    const state = spaceState();
    state[REQUEST_PATH] = {
      userId: REQUESTER,
      status: 'approved',
      decidedBy: OWNER,
    };
    const { db, writes } = createFakeDb(state);

    await expect(
      requestSpaceAccess(db, {
        caller: requesterToken,
        body: { code: SPACE_CODE },
        now: NOW,
      })
    ).resolves.toEqual({
      httpStatus: 200,
      body: { status: 'approved', spaceId: SPACE_ID, spaceName: 'Familia' },
    });
    expect(writes).toEqual([]);
  });
});

describe('decideSpaceAccessRequest', () => {
  const space = { ownerUid: OWNER, members: [OWNER] };

  it('maps membership and the existing request status to the C1 outcome', () => {
    expect(
      decideSpaceAccessRequest({ uid: OWNER, space, existingRequest: null })
    ).toEqual({ status: 'member' });
    expect(
      decideSpaceAccessRequest({
        uid: REQUESTER,
        space,
        existingRequest: { status: 'approved' },
      })
    ).toEqual({ status: 'approved' });
    expect(
      decideSpaceAccessRequest({
        uid: REQUESTER,
        space,
        existingRequest: { status: 'pending' },
      })
    ).toEqual({ status: 'pending', writeRequest: false });
    for (const existingRequest of [
      null,
      { status: 'rejected' },
      { status: 'revoked' },
    ]) {
      expect(
        decideSpaceAccessRequest({ uid: REQUESTER, space, existingRequest })
      ).toEqual({ status: 'pending', writeRequest: true });
    }
  });
});

describe('findSpaceByCodeOrId (shared with Telegram /conectar)', () => {
  it('finds a space by its code in any case, or by its espacio_ id', async () => {
    const { db } = createFakeDb(spaceState());
    await expect(findSpaceByCodeOrId(db, 'esp-abc234')).resolves.toMatchObject({
      id: SPACE_ID,
      code: SPACE_CODE,
    });
    await expect(findSpaceByCodeOrId(db, 'familia')).resolves.toMatchObject({
      id: SPACE_ID,
    });
    await expect(
      findSpaceByCodeOrId(db, ' espacio_familia ')
    ).resolves.toMatchObject({ id: SPACE_ID });
    await expect(findSpaceByCodeOrId(db, 'ESP-NOPE99')).resolves.toBeNull();
    await expect(findSpaceByCodeOrId(db, '')).resolves.toBeNull();
  });
});
