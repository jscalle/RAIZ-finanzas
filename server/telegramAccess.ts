// Firestore (Admin SDK) reads and writes behind Telegram chat access: linking a
// chat to a space, owner approval/rejection/revocation, and resolving which
// space an incoming Telegram chat belongs to.
import type { Firestore } from 'firebase-admin/firestore';
import type {
  AccessRequestDoc,
  SpaceDoc,
  TelegramAccessStatus,
  TelegramLinkDoc,
} from './security';

export interface TelegramAccessContext {
  space: (SpaceDoc & Record<string, unknown>) | null;
  request: (AccessRequestDoc & Record<string, unknown>) | null;
  link: (TelegramLinkDoc & Record<string, unknown>) | null;
}

// Loads the documents decideTelegramAccessChange needs.
export async function loadTelegramAccessContext(
  adminDb: Firestore,
  spaceId: string,
  chatId: string
): Promise<TelegramAccessContext> {
  const spaceRef = adminDb.collection('spaces').doc(spaceId);
  const [spaceSnap, requestSnap, linkSnap] = await Promise.all([
    spaceRef.get(),
    spaceRef.collection('access_requests').doc(`req_tg_${chatId}`).get(),
    adminDb.collection('telegram_links').doc(chatId).get(),
  ]);
  return {
    space: spaceSnap.exists ? spaceSnap.data() || {} : null,
    request: requestSnap.exists ? requestSnap.data() || {} : null,
    link: linkSnap.exists ? linkSnap.data() || {} : null,
  };
}

// Persists an owner decision that decideTelegramAccessChange already allowed:
// updates the space members, the `req_tg_<chatId>` request status and the
// chat's `telegram_links` entry.
export async function applyTelegramAccessChange(
  adminDb: Firestore,
  change: {
    spaceId: string;
    chatId: string;
    status: TelegramAccessStatus;
    currentMembers: unknown;
    spaceName?: string;
    spaceCode?: string;
  }
): Promise<void> {
  const { spaceId, chatId, status, spaceName, spaceCode } = change;
  const tgMemberUid = `tg:${chatId}`;
  const approved = status === 'approved';
  const spaceRef = adminDb.collection('spaces').doc(spaceId);

  const currentMembers: string[] = Array.isArray(change.currentMembers)
    ? change.currentMembers
    : [];
  const nextMembers = approved
    ? currentMembers.includes(tgMemberUid)
      ? currentMembers
      : [...currentMembers, tgMemberUid]
    : currentMembers.filter((m) => m !== tgMemberUid);
  await spaceRef.set({ members: nextMembers }, { merge: true });

  await spaceRef
    .collection('access_requests')
    .doc(`req_tg_${chatId}`)
    .set({ status: approved ? 'approved' : 'rejected' }, { merge: true });

  await adminDb
    .collection('telegram_links')
    .doc(chatId)
    .set(
      {
        status: approved ? 'approved' : 'rejected',
        updatedAt: new Date().toISOString(),
        spaceId,
        ...(spaceName ? { spaceName } : {}),
        ...(spaceCode ? { spaceCode } : {}),
      },
      { merge: true }
    );
}

export async function resolveTelegramChatSpace(
  adminDb: Firestore,
  chatId: number | string
): Promise<{
  status: 'approved' | 'pending' | 'rejected' | 'unlinked';
  spaceId?: string;
  spaceName?: string;
  spaceCode?: string;
  ownerEmail?: string;
}> {
  const chatKey = String(chatId);
  const tgMemberUid = `tg:${chatKey}`;

  try {
    const linkSnap = await adminDb
      .collection('telegram_links')
      .doc(chatKey)
      .get();
    if (!linkSnap.exists) {
      return { status: 'unlinked' };
    }

    const linkData: any = linkSnap.data() || {};
    const spaceId: string = linkData.spaceId;
    if (!spaceId) {
      return { status: 'unlinked' };
    }

    const [spaceSnap, reqSnap] = await Promise.all([
      adminDb.collection('spaces').doc(spaceId).get(),
      adminDb
        .collection('spaces')
        .doc(spaceId)
        .collection('access_requests')
        .doc(`req_tg_${chatKey}`)
        .get(),
    ]);

    if (!spaceSnap.exists) {
      return { status: 'unlinked' };
    }

    const spaceData: any = spaceSnap.data() || {};
    const members: string[] = Array.isArray(spaceData.members)
      ? spaceData.members
      : [];
    const reqData: any = reqSnap.exists ? reqSnap.data() : null;

    const isMember = members.includes(tgMemberUid);
    const isReqApproved =
      reqData?.status === 'approved' || (isMember && !reqData);

    if (isReqApproved) {
      const updates: Promise<any>[] = [];
      if (!isMember) {
        updates.push(
          adminDb
            .collection('spaces')
            .doc(spaceId)
            .set({ members: [...members, tgMemberUid] }, { merge: true })
        );
      }
      if (linkData.status !== 'approved') {
        updates.push(
          adminDb
            .collection('telegram_links')
            .doc(chatKey)
            .set({ status: 'approved' }, { merge: true })
        );
      }
      if (updates.length > 0) {
        await Promise.all(updates);
      }
      return {
        status: 'approved',
        spaceId,
        spaceName: spaceData.name || spaceId,
        spaceCode: spaceData.code || linkData.spaceCode || '',
        ownerEmail: spaceData.ownerEmail || '',
      };
    }

    if (reqData?.status === 'pending') {
      return {
        status: 'pending',
        spaceId,
        spaceName: spaceData.name || linkData.spaceName || spaceId,
        spaceCode: spaceData.code || linkData.spaceCode || '',
        ownerEmail: spaceData.ownerEmail || '',
      };
    }

    return {
      status: 'rejected',
      spaceId,
      spaceName: spaceData.name || linkData.spaceName || spaceId,
      spaceCode: spaceData.code || linkData.spaceCode || '',
      ownerEmail: spaceData.ownerEmail || '',
    };
  } catch (e) {
    console.error('[telegram] Error resolving Telegram chat space:', e);
    return { status: 'unlinked' };
  }
}
