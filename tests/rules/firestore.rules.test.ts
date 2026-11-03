// @vitest-environment node
//
// Firestore security rules (S6) against the local emulator (S11). Run with
// `pnpm test:rules`, which starts the emulator through
// `firebase emulators:exec` and sets FIRESTORE_EMULATOR_HOST.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

const OWNER = 'ownerUid1';
const MEMBER = 'memberUid2';
const STRANGER = 'strangerUid3';
const SPACE = 'espacio_familia';
const OTHER_SPACE = 'espacio_ajeno';

let env: RulesTestEnvironment;

const asUser = (uid: string): Firestore =>
  env
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore() as unknown as Firestore;
const anonymous = (): Firestore =>
  env.unauthenticatedContext().firestore() as unknown as Firestore;

const spaceDoc = (ownerUid: string, members: string[]) => ({
  id: SPACE,
  code: 'ESP-ABCDEFGH',
  name: 'Familia',
  ownerUid,
  ownerEmail: `${ownerUid}@example.com`,
  members,
  startingSavings: 1000,
  createdAt: '2026-11-01T00:00:00.000Z',
});

const pendingRequest = (uid: string) => ({
  userId: uid,
  email: `${uid}@example.com`,
  status: 'pending',
  type: 'web',
  createdAt: '2026-11-01T00:00:00.000Z',
  // Legacy fields the owner UI reads (written by the backend).
  id: `req_${uid}`,
  spaceId: SPACE,
  spaceName: 'Familia',
  requesterUid: uid,
  requesterEmail: `${uid}@example.com`,
  requesterName: uid,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-raiz',
    firestore: {
      rules: readFileSync(
        path.resolve(__dirname, '../../firestore.rules'),
        'utf8'
      ),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'spaces', SPACE), spaceDoc(OWNER, [OWNER, MEMBER]));
    await setDoc(doc(db, 'spaces', SPACE, 'expenses', 'exp_1'), {
      id: 'exp_1',
      amount: 100,
    });
    await setDoc(
      doc(db, 'spaces', SPACE, 'access_requests', `req_${STRANGER}`),
      pendingRequest(STRANGER)
    );
    await setDoc(doc(db, 'spaces', SPACE, 'pending_transactions', 'tg_1'), {
      id: 'tg_1',
      amount: 50,
    });
    for (const uid of [OWNER, MEMBER]) {
      await setDoc(doc(db, 'spaces', SPACE, 'assistant_threads', uid, 'messages', 'm1'), {
        id: 'm1',
        role: 'user',
        kind: 'text',
        text: `hola de ${uid}`,
        createdAt: '2026-11-01T00:00:00.000Z',
      });
    }
    await setDoc(doc(db, 'spaces', OTHER_SPACE), {
      ...spaceDoc(STRANGER, [STRANGER]),
      id: OTHER_SPACE,
    });
    await setDoc(doc(db, 'users', OWNER), { defaultSpaceId: SPACE });
  });
});

describe('spaces/{spaceId}', () => {
  it('lets a member read its own space', async () => {
    await assertSucceeds(getDoc(doc(asUser(MEMBER), 'spaces', SPACE)));
    await assertSucceeds(getDoc(doc(asUser(OWNER), 'spaces', SPACE)));
  });

  it('denies a non-member get and unconstrained list of another space', async () => {
    const db = asUser(STRANGER);
    await assertFails(getDoc(doc(db, 'spaces', SPACE)));
    await assertFails(getDocs(collection(db, 'spaces')));
    // The old client-side code lookup must no longer find other spaces.
    await assertFails(
      getDocs(
        query(collection(db, 'spaces'), where('code', '==', 'ESP-ABCDEFGH'))
      )
    );
  });

  it('lets a user list only its own spaces (by membership or ownership)', async () => {
    const db = asUser(MEMBER);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'spaces'),
          where('members', 'array-contains', MEMBER)
        )
      )
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(asUser(OWNER), 'spaces'),
          where('ownerUid', '==', OWNER)
        )
      )
    );
  });

  it('allows reading a missing space so the caller can create its own', async () => {
    await assertSucceeds(
      getDoc(doc(asUser(STRANGER), 'spaces', 'espacio_inexistente'))
    );
    await assertFails(
      getDoc(doc(anonymous(), 'spaces', 'espacio_inexistente'))
    );
  });

  it('only creates a space owned by the caller as its only member', async () => {
    const db = asUser(STRANGER);
    await assertSucceeds(
      setDoc(doc(db, 'spaces', 'espacio_nuevo'), {
        ...spaceDoc(STRANGER, [STRANGER]),
        id: 'espacio_nuevo',
      })
    );
    await assertFails(
      setDoc(doc(db, 'spaces', 'espacio_robado'), {
        ...spaceDoc(OWNER, [OWNER]),
        id: 'espacio_robado',
      })
    );
    await assertFails(
      setDoc(doc(db, 'spaces', 'espacio_con_otros'), {
        ...spaceDoc(STRANGER, [STRANGER, OWNER]),
        id: 'espacio_con_otros',
      })
    );
  });

  it('reserves a uid-derived space id for that uid', async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser(STRANGER), 'spaces', `espacio_u_${STRANGER.toLowerCase()}`),
        {
          ...spaceDoc(STRANGER, [STRANGER]),
        }
      )
    );
    await assertFails(
      setDoc(
        doc(asUser(STRANGER), 'spaces', `espacio_u_${OWNER.toLowerCase()}`),
        {
          ...spaceDoc(STRANGER, [STRANGER]),
        }
      )
    );
  });

  it('lets the owner update any field but the ownership, and delete', async () => {
    const db = asUser(OWNER);
    await assertSucceeds(
      updateDoc(doc(db, 'spaces', SPACE), {
        name: 'Familia 2',
        code: 'ESP-ZZZZZZZZ',
        members: arrayUnion(STRANGER),
      })
    );
    await assertFails(
      updateDoc(doc(db, 'spaces', SPACE), { ownerUid: MEMBER })
    );
    await assertSucceeds(deleteDoc(doc(db, 'spaces', SPACE)));
  });

  it('lets a non-owner member update only the savings fields', async () => {
    const db = asUser(MEMBER);
    await assertSucceeds(
      updateDoc(doc(db, 'spaces', SPACE), {
        startingSavings: 2000,
        savingsPool: 5,
      })
    );
    await assertFails(
      updateDoc(doc(db, 'spaces', SPACE), { members: arrayUnion(STRANGER) })
    );
    await assertFails(updateDoc(doc(db, 'spaces', SPACE), { name: 'Hack' }));
    await assertFails(deleteDoc(doc(db, 'spaces', SPACE)));
  });

  it('denies a non-member any update, including joining itself', async () => {
    await assertFails(
      updateDoc(doc(asUser(STRANGER), 'spaces', SPACE), {
        members: arrayUnion(STRANGER),
      })
    );
    await assertFails(
      updateDoc(doc(asUser(STRANGER), 'spaces', SPACE), { startingSavings: 1 })
    );
  });
});

describe('spaces/{spaceId} data subcollections', () => {
  it('keeps member CRUD and denies non-members', async () => {
    const member = asUser(MEMBER);
    await assertSucceeds(
      getDoc(doc(member, 'spaces', SPACE, 'expenses', 'exp_1'))
    );
    await assertSucceeds(
      setDoc(doc(member, 'spaces', SPACE, 'incomes', 'inc_1'), { id: 'inc_1' })
    );
    await assertSucceeds(
      deleteDoc(doc(member, 'spaces', SPACE, 'expenses', 'exp_1'))
    );
    await assertFails(
      getDoc(doc(asUser(STRANGER), 'spaces', SPACE, 'expenses', 'exp_1'))
    );
    await assertFails(
      setDoc(doc(asUser(STRANGER), 'spaces', SPACE, 'incomes', 'inc_2'), {
        id: 'inc_2',
      })
    );
  });
});

describe('spaces/{spaceId}/access_requests', () => {
  const reqPath = (uid: string) =>
    ['spaces', SPACE, 'access_requests', `req_${uid}`] as const;

  it('lets the requester create and get its own pending request, not others', async () => {
    const newcomer = 'newcomerUid4';
    const db = asUser(newcomer);
    await assertSucceeds(
      setDoc(doc(db, ...reqPath(newcomer)), {
        userId: newcomer,
        email: `${newcomer}@example.com`,
        status: 'pending',
        type: 'web',
        createdAt: '2026-11-01T00:00:00.000Z',
      })
    );
    await assertSucceeds(getDoc(doc(db, ...reqPath(newcomer))));
    // Another user's request, a forged userId, or a pre-approved status fail.
    await assertFails(getDoc(doc(db, ...reqPath(STRANGER))));
    await assertFails(
      setDoc(doc(db, ...reqPath(STRANGER)), {
        userId: STRANGER,
        status: 'pending',
      })
    );
    await assertFails(
      setDoc(doc(asUser('otherUid5'), ...reqPath('otherUid5')), {
        userId: 'otherUid5',
        status: 'approved',
      })
    );
    await assertFails(
      setDoc(doc(asUser('otherUid5'), ...reqPath('otherUid5')), {
        userId: 'otherUid5',
        status: 'pending',
        requesterUid: OWNER,
      })
    );
    await assertFails(
      getDocs(collection(db, 'spaces', SPACE, 'access_requests'))
    );
  });

  it('lets owner and members list requests', async () => {
    await assertSucceeds(
      getDocs(collection(asUser(OWNER), 'spaces', SPACE, 'access_requests'))
    );
    await assertSucceeds(
      getDocs(collection(asUser(MEMBER), 'spaces', SPACE, 'access_requests'))
    );
  });

  it('denies a non-owner member approving a request', async () => {
    await assertFails(
      updateDoc(doc(asUser(MEMBER), ...reqPath(STRANGER)), {
        status: 'approved',
        decidedBy: MEMBER,
        decidedAt: '2026-11-01T00:00:00.000Z',
      })
    );
  });

  it('requires the owner approval to carry decidedBy == the owner', async () => {
    const db = asUser(OWNER);
    await assertFails(
      updateDoc(doc(db, ...reqPath(STRANGER)), { status: 'approved' })
    );
    await assertFails(
      updateDoc(doc(db, ...reqPath(STRANGER)), {
        status: 'approved',
        decidedBy: MEMBER,
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, ...reqPath(STRANGER)), {
        status: 'approved',
        decidedBy: OWNER,
        decidedAt: '2026-11-01T00:00:00.000Z',
      })
    );
  });

  it('lets the requester cancel its own pending request, nothing else', async () => {
    const db = asUser(STRANGER);
    await assertFails(
      updateDoc(doc(db, ...reqPath(STRANGER)), {
        status: 'approved',
        decidedBy: STRANGER,
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, ...reqPath(STRANGER)), {
        status: 'cancelled',
        cancelledAt: '2026-11-01T00:00:00.000Z',
      })
    );
  });
});

describe('spaces/{spaceId}/pending_transactions', () => {
  it('allows members and denies non-members and anonymous callers', async () => {
    const path = ['spaces', SPACE, 'pending_transactions'] as const;
    await assertSucceeds(getDoc(doc(asUser(MEMBER), ...path, 'tg_1')));
    await assertSucceeds(
      setDoc(doc(asUser(MEMBER), ...path, 'tg_2'), { id: 'tg_2' })
    );
    await assertFails(getDoc(doc(asUser(STRANGER), ...path, 'tg_1')));
    await assertFails(
      setDoc(doc(asUser(STRANGER), ...path, 'tg_3'), { id: 'tg_3' })
    );
    await assertFails(
      setDoc(doc(anonymous(), ...path, 'tg_4'), { id: 'tg_4' })
    );
    await assertFails(getDoc(doc(anonymous(), ...path, 'tg_1')));
  });
});

describe('spaces/{spaceId}/assistant_threads/{uid}/messages', () => {
  const thread = (uid: string) => ['spaces', SPACE, 'assistant_threads', uid, 'messages'] as const;

  it('lets a member read and list only its own thread', async () => {
    await assertSucceeds(getDoc(doc(asUser(MEMBER), ...thread(MEMBER), 'm1')));
    await assertSucceeds(getDocs(collection(asUser(MEMBER), ...thread(MEMBER))));
    await assertSucceeds(getDoc(doc(asUser(OWNER), ...thread(OWNER), 'm1')));
  });

  it('keeps other users out of a thread, even the space owner', async () => {
    await assertFails(getDoc(doc(asUser(OWNER), ...thread(MEMBER), 'm1')));
    await assertFails(getDocs(collection(asUser(OWNER), ...thread(MEMBER))));
    await assertFails(getDoc(doc(asUser(MEMBER), ...thread(OWNER), 'm1')));
    await assertFails(getDoc(doc(asUser(STRANGER), ...thread(MEMBER), 'm1')));
    await assertFails(getDoc(doc(anonymous(), ...thread(MEMBER), 'm1')));
  });

  it('denies every client write: only the server writes threads', async () => {
    const msg = { id: 'm2', role: 'user', kind: 'text', text: 'x', createdAt: '2026-11-01T00:00:01.000Z' };
    await assertFails(setDoc(doc(asUser(MEMBER), ...thread(MEMBER), 'm2'), msg));
    await assertFails(updateDoc(doc(asUser(MEMBER), ...thread(MEMBER), 'm1'), { text: 'changed' }));
    await assertFails(deleteDoc(doc(asUser(MEMBER), ...thread(MEMBER), 'm1')));
    await assertFails(setDoc(doc(asUser(OWNER), ...thread(MEMBER), 'm2'), msg));
    await assertFails(setDoc(doc(anonymous(), ...thread(MEMBER), 'm2'), msg));
  });

  it('does not let members create or read the thread parent documents', async () => {
    const parent = ['spaces', SPACE, 'assistant_threads', MEMBER] as const;
    await assertFails(setDoc(doc(asUser(MEMBER), ...parent), { x: 1 }));
    await assertFails(getDoc(doc(asUser(MEMBER), ...parent)));
  });
});

describe('users/{uid}', () => {
  it('is readable and writable only by that user', async () => {
    await assertSucceeds(getDoc(doc(asUser(OWNER), 'users', OWNER)));
    await assertSucceeds(
      setDoc(doc(asUser(MEMBER), 'users', MEMBER), { defaultSpaceId: SPACE })
    );
    await assertFails(getDoc(doc(asUser(MEMBER), 'users', OWNER)));
    await assertFails(
      setDoc(doc(asUser(MEMBER), 'users', OWNER), { defaultSpaceId: 'x' })
    );
    await assertFails(getDoc(doc(anonymous(), 'users', OWNER)));
  });
});
