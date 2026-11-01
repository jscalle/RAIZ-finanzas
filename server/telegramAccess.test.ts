// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  applyTelegramAccessChange,
  loadTelegramAccessContext,
  resolveTelegramChatSpace,
} from './telegramAccess';

type Data = Record<string, unknown>;

// Minimal in-memory stand-in for the Admin Firestore API surface these
// helpers use: collection().doc().get()/set() and nested collections.
function createFakeDb(initial: Record<string, Data>) {
  const store = new Map<string, Data>(Object.entries(initial));
  const docRef = (path: string): unknown => ({
    get: async () => ({
      exists: store.has(path),
      data: () => (store.has(path) ? { ...store.get(path) } : undefined),
    }),
    set: async (data: Data, options?: { merge?: boolean }) => {
      store.set(
        path,
        options?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data }
      );
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  return {
    db: { collection: collectionRef } as unknown as Firestore,
    store,
  };
}

const OWNER = 'owner-uid';
const SPACE_ID = 'espacio_familia';
const CHAT_ID = '123456789';

function pendingTelegramRequestState(): Record<string, Data> {
  return {
    [`spaces/${SPACE_ID}`]: {
      name: 'Familia',
      code: 'ESP-ABC234',
      ownerUid: OWNER,
      members: [OWNER],
    },
    [`spaces/${SPACE_ID}/access_requests/req_tg_${CHAT_ID}`]: {
      id: `req_tg_${CHAT_ID}`,
      requesterUid: `tg:${CHAT_ID}`,
      status: 'pending',
    },
    [`telegram_links/${CHAT_ID}`]: {
      chatId: CHAT_ID,
      spaceId: SPACE_ID,
      status: 'pending',
    },
  };
}

describe('Telegram access flow (S1 server side)', () => {
  it('loads the space, the access request and the chat link for a decision', async () => {
    const { db } = createFakeDb(pendingTelegramRequestState());
    const context = await loadTelegramAccessContext(db, SPACE_ID, CHAT_ID);
    expect(context.space).toMatchObject({ ownerUid: OWNER });
    expect(context.request).toMatchObject({ status: 'pending' });
    expect(context.link).toMatchObject({ spaceId: SPACE_ID });
  });

  it('after an owner approval the chat resolves to the approved space', async () => {
    const { db, store } = createFakeDb(pendingTelegramRequestState());

    await applyTelegramAccessChange(db, {
      spaceId: SPACE_ID,
      chatId: CHAT_ID,
      status: 'approved',
      currentMembers: [OWNER],
      spaceName: 'Familia',
    });

    expect(store.get(`spaces/${SPACE_ID}`)?.members).toEqual([
      OWNER,
      `tg:${CHAT_ID}`,
    ]);
    expect(
      store.get(`spaces/${SPACE_ID}/access_requests/req_tg_${CHAT_ID}`)?.status
    ).toBe('approved');
    expect(store.get(`telegram_links/${CHAT_ID}`)).toMatchObject({
      spaceId: SPACE_ID,
      status: 'approved',
      spaceName: 'Familia',
    });
    await expect(resolveTelegramChatSpace(db, CHAT_ID)).resolves.toMatchObject({
      status: 'approved',
      spaceId: SPACE_ID,
      spaceName: 'Familia',
    });
  });

  it('after a revocation the chat no longer resolves to the space', async () => {
    const state = pendingTelegramRequestState();
    state[`spaces/${SPACE_ID}`].members = [OWNER, `tg:${CHAT_ID}`];
    const { db, store } = createFakeDb(state);

    await applyTelegramAccessChange(db, {
      spaceId: SPACE_ID,
      chatId: CHAT_ID,
      status: 'revoked',
      currentMembers: [OWNER, `tg:${CHAT_ID}`],
    });

    expect(store.get(`spaces/${SPACE_ID}`)?.members).toEqual([OWNER]);
    await expect(resolveTelegramChatSpace(db, CHAT_ID)).resolves.toMatchObject({
      status: 'rejected',
    });
  });
});

describe('resolveTelegramChatSpace (existing Telegram behavior)', () => {
  it('resolves a linked chat with an approved request to its space', async () => {
    const state = pendingTelegramRequestState();
    state[`spaces/${SPACE_ID}/access_requests/req_tg_${CHAT_ID}`].status =
      'approved';
    const { db, store } = createFakeDb(state);

    await expect(resolveTelegramChatSpace(db, CHAT_ID)).resolves.toEqual({
      status: 'approved',
      spaceId: SPACE_ID,
      spaceName: 'Familia',
      spaceCode: 'ESP-ABC234',
      ownerEmail: '',
    });
    // The lazy path still adds the Telegram member and approves the link.
    expect(store.get(`spaces/${SPACE_ID}`)?.members).toEqual([
      OWNER,
      `tg:${CHAT_ID}`,
    ]);
    expect(store.get(`telegram_links/${CHAT_ID}`)?.status).toBe('approved');
  });

  it('keeps a pending request pending and an unknown chat unlinked', async () => {
    const { db } = createFakeDb(pendingTelegramRequestState());
    await expect(resolveTelegramChatSpace(db, CHAT_ID)).resolves.toMatchObject({
      status: 'pending',
      spaceId: SPACE_ID,
    });
    await expect(resolveTelegramChatSpace(db, '999')).resolves.toEqual({
      status: 'unlinked',
    });
  });
});
