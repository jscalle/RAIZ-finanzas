import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Firestore security rules tests (S11). They need the Firestore emulator, so
// they run only through `pnpm test:rules` (firebase emulators:exec), never in
// the default `pnpm test:run` suite.
export default defineConfig({
  root: path.resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // One emulator instance: keep files sequential so clearFirestore() in one
    // file never races another.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
