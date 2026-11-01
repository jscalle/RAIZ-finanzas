import React, { useEffect, useState } from 'react';
import { fetchSpaceMemberProfiles } from '../lib/firebase';

interface SpaceMembersListProps {
  spaceId: string;
  ownerId: string;
  members: string[];
  currentUserId: string;
  onRevokeMember: (memberUid: string, emailOrName: string) => Promise<void>;
}

export const SpaceMembersList: React.FC<SpaceMembersListProps> = ({
  spaceId,
  ownerId,
  members,
  currentUserId,
  onRevokeMember,
}) => {
  const [profiles, setProfiles] = useState<
    Record<string, { email: string; displayName: string; photoURL?: string }>
  >({});
  const [loading, setLoading] = useState(false);
  const [revokingUid, setRevokingUid] = useState<string | null>(null);
  const [confirmMember, setConfirmMember] = useState<{
    uid: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProfiles = async () => {
      if (!members || members.length === 0) return;
      setLoading(true);
      try {
        const fetched = await fetchSpaceMemberProfiles(spaceId, members);
        if (isMounted) {
          setProfiles(fetched);
        }
      } catch (err) {
        console.error('Error fetching member profiles', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProfiles();

    return () => {
      isMounted = false;
    };
  }, [spaceId, members]);

  const handleRevokeConfirm = async () => {
    if (!confirmMember) return;
    setRevokingUid(confirmMember.uid);
    try {
      await onRevokeMember(confirmMember.uid, confirmMember.name);
    } catch (e) {
      console.error('Failed to revoke member:', e);
    } finally {
      setRevokingUid(null);
      setConfirmMember(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 mt-6">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <span>👥</span> Integrantes del Espacio Compartido
        </h3>
      </div>

      <div className="p-2 sm:p-4">
        {loading && Object.keys(profiles).length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm p-2">
            Cargando integrantes...
          </p>
        ) : !members || members.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm p-2">
            No hay integrantes en este espacio.
          </p>
        ) : (
          <div className="space-y-3">
            {members.map((uid) => {
              const profile = profiles[uid] || {
                displayName: 'Usuario Desconocido',
                email: '...',
              };
              const isOwner = uid === ownerId;
              const canRevoke = currentUserId === ownerId && !isOwner;
              const isRevoking = revokingUid === uid;
              const initial = profile.displayName
                ? profile.displayName.charAt(0).toUpperCase()
                : '?';

              return (
                <div
                  key={uid}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-3.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600/50 shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {profile.photoURL ? (
                      <img
                        src={profile.photoURL}
                        alt={profile.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-lg shrink-0">
                        {initial}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="font-bold text-sm text-gray-900 dark:text-white capitalize truncate"
                          title={profile.displayName}
                        >
                          {profile.displayName}
                        </p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${isOwner ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50' : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'}`}
                        >
                          {isOwner ? 'Anfitrión 👑' : 'Miembro 👤'}
                        </span>
                      </div>
                      <p
                        className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 flex items-center gap-1 truncate"
                        title={profile.email}
                      >
                        ✉️ {profile.email}
                      </p>
                    </div>
                  </div>

                  {canRevoke && (
                    <div className="flex justify-end pt-2 sm:pt-0 border-t border-gray-200/60 dark:border-gray-600/30 sm:border-0">
                      <button
                        onClick={() =>
                          setConfirmMember({
                            uid,
                            name: profile.displayName || profile.email,
                          })
                        }
                        disabled={isRevoking}
                        className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-950/40 rounded-lg transition-colors border border-red-200/60 dark:border-red-800/40 flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        {isRevoking ? (
                          <>
                            <span className="w-3 h-3 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin"></span>
                            Revocando...
                          </>
                        ) : (
                          <>🗑️ Revocar Acceso</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5">
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-3">
                <span className="text-2xl">⚠️</span>
                <h3 className="text-lg font-bold">Confirmar Revocación</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                ¿Estás seguro de revocar el acceso a{' '}
                <strong className="font-semibold">{confirmMember.name}</strong>?
                Esta persona perderá acceso al espacio en tiempo real y será
                devuelta a su espacio personal.
              </p>
            </div>
            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-600/50">
              <button
                onClick={() => setConfirmMember(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRevokeConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 shadow-sm transition-colors"
              >
                Confirmar Revocación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
