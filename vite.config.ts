/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Split heavy third-party libs into their own long-lived vendor
          // chunks so browsers cache them across app-code deploys. Order
          // matters: match lucide-react before the generic react rule.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@firebase/firestore') || id.includes('firebase/firestore'))
              return 'vendor-firebase-firestore';
            if (id.includes('@firebase/auth') || id.includes('firebase/auth'))
              return 'vendor-firebase-auth';
            if (id.includes('firebase') || id.includes('@firebase'))
              return 'vendor-firebase-core';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('motion') || id.includes('framer'))
              return 'vendor-motion';
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('scheduler')
            )
              return 'vendor-react';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' 
        ? null 
        : {
            ignored: [
              '**/temp-finance-manager/**',
              '**/openspec/**',
              '**/dist/**',
              '**/ios/**',
              '**/.atl/**',
            ],
          },
    },
    test: {
      environment: 'jsdom',
      // Node >= 25 exposes a built-in Web Storage `localStorage` global. It
      // shadows jsdom's implementation (vitest does not override globals that
      // already exist) and is `undefined` without --localstorage-file, which
      // breaks every test touching storage. Disable it in the test workers so
      // jsdom's Storage is used. Guarded so older Node versions without the
      // flag still start.
      execArgv: process.allowedNodeEnvironmentFlags.has(
        '--no-experimental-webstorage',
      )
        ? ['--no-experimental-webstorage']
        : [],
      // Vitest resolves dependencies with the `node` export condition, even in
      // jsdom. For `@firebase/auth` that selects its Node build, where
      // `browserPopupRedirectResolver` is an Error placeholder, so the
      // `initializeAuth(...)` call in src/lib/firebase.ts throws "INTERNAL
      // ASSERTION FAILED: Expected a class definition" at import time. Point
      // `@firebase/auth` at the browser build the app actually ships, and
      // inline every Firebase package so Vite applies this alias and all of
      // them share one @firebase/app component registry.
      alias: [
        {
          find: /^@firebase\/auth$/,
          replacement: (() => {
            const { createRequire } = process.getBuiltinModule('node:module');
            const requireFromFirebase = createRequire(
              createRequire(import.meta.url).resolve('firebase/package.json'),
            );
            const authPkgPath = requireFromFirebase.resolve(
              '@firebase/auth/package.json',
            );
            const authPkg = requireFromFirebase(authPkgPath) as {
              exports: { '.': { browser: { import: string } } };
            };
            return path.join(
              path.dirname(authPkgPath),
              authPkg.exports['.'].browser.import,
            );
          })(),
        },
      ],
      server: {
        deps: {
          inline: [/[\\/]@?firebase[\\/]/],
        },
      },
      setupFiles: ['./src/setupTests.ts'],
      globals: true,
      css: false,
      clearMocks: true,
      restoreMocks: true,
      mockReset: true,
      reporters: ['default'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/main.tsx',
          'src/types.ts',
          'src/initialData.ts',
          'src/setupTests.ts',
          'src/**/*.test.{ts,tsx}',
          '**/*.d.ts',
          '*.config.{ts,js}',
        ],
        // Thresholds are the currently achieved floor so the suite stays green
        // and ratchets upward as coverage grows. The global numbers are low
        // because large, still-untested modules (App.tsx and several *Section
        // components) are intentionally in scope. Per-file thresholds lock the
        // modules that already have a meaningful behavior-first suite so future
        // refactors cannot silently erode their coverage.
        thresholds: {
          statements: 44,
          branches: 38,
          functions: 39,
          lines: 45,
          'src/App.tsx': {
            statements: 46,
            branches: 33,
            functions: 46,
            lines: 48,
          },
          'src/lib/mathEngine.ts': {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100,
          },
          'src/lib/gmail.ts': {
            statements: 95,
            branches: 88,
            functions: 88,
            lines: 97,
          },
          'src/lib/firebase.ts': {
            statements: 23,
            branches: 19,
            functions: 20,
            lines: 23,
          },
          'src/components/DashboardSection.tsx': {
            statements: 95,
            branches: 81,
            functions: 100,
            lines: 94,
          },
          'src/components/ErrorBoundary.tsx': {
            statements: 81,
            branches: 75,
            functions: 80,
            lines: 81,
          },
        },
      },
    },
  };
});
