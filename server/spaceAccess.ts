// Joining a space by its code (contract C1, POST /api/spaces/request-access)
// and the space lookup it shares with the Telegram `/conectar` command.
// Firestore is injected (Admin SDK) so the rules are unit-testable.
import type { Firestore } from 'firebase-admin/firestore';
import { isSpaceMember } from './security';
import type { AccessRequestDoc, SpaceDoc } from './security';

export type SpaceRecord = SpaceDoc & Record<string, unknown> & { id: string };

// Finds a space by its `code` field (case-insensitive, e.g. `ESP-9K2F7M`) or,
// failing that, by its `espacio_<...>` document id. Lookup errors are logged
// and treated as "not found".
export async function findSpaceByCodeOrId(
  adminDb: Firestore,
  rawCodeOrId: string
): Promise<SpaceRecord | null> {
  if (!rawCodeOrId) return null;
  const cleaned = rawCodeOrId.trim();

  try {
    const byCode = await adminDb
      .collection('spaces')
      .where('code', '==', cleaned.toUpperCase())
      .limit(1)
      .get();
    if (!byCode.empty) {
      const docSnap = byCode.docs[0];
      return { id: docSnap.id, ...docSnap.data() };
    }
  } catch (e) {
    console.warn('[spaces] Error querying space by code:', e);
  }

  const normalized = cleaned.toLowerCase().startsWith('espacio_')
    ? cleaned.toLowerCase().replace(/[^a-z0-9_]/g, '')
    : `espacio_${cleaned.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;

  try {
    const docSnap = await adminDb.collection('spaces').doc(normalized).get();
    if (docSnap.exists) {
      return { id: docSnap.id, ...docSnap.data() };
    }
  } catch (e) {
    console.warn('[spaces] Error getting space by ID:', e);
  }

  return null;
}

export type SpaceAccessRequestDecision =
  | { status: 'member' }
  | { status: 'approved' }
  | { status: 'pending'; writeRequest: boolean };

// Contract C1 outcome for a caller asking to join `space`:
// - owner or member: `member` (nothing to request);
// - a pending one: `pending`, left as is (idempotent);
// - none, rejected, revoked, or an `approved` one whose caller is no longer a
//   member (a stale approval after revocation): a (re-)opened `pending` request.
// An approved request only means access while the uid is in `members`, so it
// never short-circuits here (members already returned `member` above).
export function decideSpaceAccessRequest(input: {
  uid: string;
  space: SpaceDoc;
  existingRequest: AccessRequestDoc | null;
}): SpaceAccessRequestDecision {
  const { uid, space, existingRequest } = input;
  if (isSpaceMember(space, uid)) return { status: 'member' };
  if (existingRequest?.status === 'pending') {
    return { status: 'pending', writeRequest: false };
  }
  return { status: 'pending', writeRequest: true };
}

// The caller as identified by the verified Firebase ID token
// (Admin `verifyIdToken` result). Request bodies never supply these fields.
export interface VerifiedCaller {
  uid: string;
  email?: unknown;
  name?: unknown;
}

// The `spaces/{spaceId}/access_requests/req_<uid>` document for a web
// request. It carries the contract C1 fields plus the fields the existing
// owner approval UI reads (`requesterUid`, `requesterEmail`, ...).
export function buildWebAccessRequest(input: {
  caller: VerifiedCaller;
  spaceId: string;
  spaceName: string;
  now: Date;
}): Record<string, unknown> {
  const { caller, spaceId, spaceName, now } = input;
  const email = typeof caller.email === 'string' ? caller.email : '';
  const displayName =
    typeof caller.name === 'string' && caller.name.trim()
      ? caller.name.trim()
      : undefined;
  return {
    userId: caller.uid,
    email,
    ...(displayName ? { displayName } : {}),
    status: 'pending',
    type: 'web',
    createdAt: now.toISOString(),
    id: `req_${caller.uid}`,
    spaceId,
    spaceName,
    requesterUid: caller.uid,
    requesterEmail: email,
    requesterName: displayName || email.split('@')[0] || caller.uid,
  };
}

export type RequestSpaceAccessResult =
  | {
      httpStatus: 200;
      body: {
        status: 'member' | 'approved' | 'pending';
        spaceId: string;
        spaceName: string;
      };
    }
  | { httpStatus: 400 | 404; body: { error: string } };

const MAX_CODE_LENGTH = 200;

// POST /api/spaces/request-access (contract C1) for an authenticated caller.
// Only `code` is read from the body. The response never includes the space
// members or the owner's email.
export async function requestSpaceAccess(
  adminDb: Firestore,
  input: { caller: VerifiedCaller; body: unknown; now?: Date }
): Promise<RequestSpaceAccessResult> {
  const { caller, body, now = new Date() } = input;
  const code =
    body && typeof body === 'object'
      ? (body as { code?: unknown }).code
      : undefined;
  if (
    typeof code !== 'string' ||
    !code.trim() ||
    code.length > MAX_CODE_LENGTH
  ) {
    return { httpStatus: 400, body: { error: 'invalid_code' } };
  }

  const space = await findSpaceByCodeOrId(adminDb, code);
  if (!space) return { httpStatus: 404, body: { error: 'not_found' } };

  const spaceId = space.id;
  const spaceName =
    typeof space.name === 'string' && space.name ? space.name : spaceId;
  const requestRef = adminDb
    .collection('spaces')
    .doc(spaceId)
    .collection('access_requests')
    .doc(`req_${caller.uid}`);
  const requestSnap = await requestRef.get();
  const existingRequest = requestSnap.exists
    ? (requestSnap.data() as AccessRequestDoc)
    : null;

  const decision = decideSpaceAccessRequest({
    uid: caller.uid,
    space,
    existingRequest,
  });
  if (decision.status === 'pending' && decision.writeRequest) {
    // Full overwrite: a re-opened request drops the previous decision
    // (`decidedBy` / `decidedAt`).
    await requestRef.set(
      buildWebAccessRequest({ caller, spaceId, spaceName, now })
    );
  }

  return {
    httpStatus: 200,
    body: { status: decision.status, spaceId, spaceName },
  };
}
