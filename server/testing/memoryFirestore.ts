// Minimal in-memory stand-in for the Admin Firestore API, for server unit tests only.
// Supports nested collections, get/set/update, collection listing and atomic batches.
import type { Firestore } from 'firebase-admin/firestore';

type Data = Record<string, any>;

export interface MemoryFirestore {
  db: Firestore;
  /** path -> document data */
  store: Map<string, Data>;
  /** Make the next batch commit throw (nothing is applied) when the predicate matches its paths. */
  failBatchWhen(predicate: (paths: string[]) => boolean): void;
  /** Make set()/update() on matching paths throw. */
  failWritesWhen(predicate: (path: string) => boolean): void;
  /** Documents directly under a collection path, sorted by id. */
  list(collectionPath: string): Array<Data & { __id: string }>;
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export function createMemoryFirestore(seed: Record<string, Data> = {}): MemoryFirestore {
  const store = new Map<string, Data>(Object.entries(seed));
  let batchFailure: ((paths: string[]) => boolean) | null = null;
  let writeFailure: ((path: string) => boolean) | null = null;

  const checkWrite = (path: string) => {
    if (writeFailure?.(path)) throw new Error(`simulated write failure at ${path}`);
  };

  const docRef = (path: string): any => ({
    path,
    id: lastSegment(path),
    async get() {
      const data = store.get(path);
      return { exists: data !== undefined, id: lastSegment(path), data: () => data };
    },
    async set(data: Data) {
      checkWrite(path);
      store.set(path, structuredClone(data));
    },
    async update(patch: Data) {
      checkWrite(path);
      const current = store.get(path);
      if (!current) throw new Error(`NOT_FOUND: ${path}`);
      store.set(path, { ...current, ...structuredClone(patch) });
    },
    collection: (name: string) => colRef(`${path}/${name}`),
  });

  const children = (path: string) =>
    [...store.keys()].filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')).sort();

  const colRef = (path: string): any => ({
    path,
    doc: (id: string) => docRef(`${path}/${id}`),
    async get() {
      const docs = children(path).map((k) => ({ id: lastSegment(k), data: () => store.get(k) }));
      return { empty: docs.length === 0, docs };
    },
  });

  const db = {
    collection: (name: string) => colRef(name),
    batch() {
      const ops: Array<{ path: string; apply: () => void }> = [];
      return {
        set(ref: { path: string }, data: Data) {
          ops.push({ path: ref.path, apply: () => store.set(ref.path, structuredClone(data)) });
        },
        update(ref: { path: string }, patch: Data) {
          ops.push({
            path: ref.path,
            apply: () => {
              const current = store.get(ref.path);
              if (!current) throw new Error(`NOT_FOUND: ${ref.path}`);
              store.set(ref.path, { ...current, ...structuredClone(patch) });
            },
          });
        },
        async commit() {
          const paths = ops.map((o) => o.path);
          if (batchFailure?.(paths)) {
            batchFailure = null;
            throw new Error('simulated batch failure');
          }
          // Atomic: validate first, then apply all.
          for (const o of ops) if (writeFailure?.(o.path)) throw new Error(`simulated write failure at ${o.path}`);
          for (const o of ops) o.apply();
        },
      };
    },
  } as unknown as Firestore;

  return {
    db,
    store,
    failBatchWhen: (p) => {
      batchFailure = p;
    },
    failWritesWhen: (p) => {
      writeFailure = p;
    },
    list: (collectionPath) => children(collectionPath).map((k) => ({ __id: lastSegment(k), ...(store.get(k) as Data) })),
  };
}
