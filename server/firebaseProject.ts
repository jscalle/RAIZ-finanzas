// Resolves the Firebase/GCP project id the backend talks to and refuses to
// run Admin-backed endpoints against a missing or placeholder project.
import type { RequestHandler } from 'express';

// Highest precedence first. GOOGLE_CLOUD_PROJECT is the variable to set on
// Cloud Run; the other two are fallbacks for local setups.
export const PROJECT_ID_ENV_VARS = [
  'GOOGLE_CLOUD_PROJECT',
  'FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_PROJECT_ID',
] as const;

export type ProjectIdEnvVar = (typeof PROJECT_ID_ENV_VARS)[number];

export type FirebaseProjectResolution =
  | { ok: true; projectId: string; source: ProjectIdEnvVar }
  | { ok: false; error: string };

// Template values such as `your-firebase-project-id` (or any `your-...`).
export function isPlaceholderProjectId(value: string): boolean {
  return value.trim().toLowerCase().startsWith('your-');
}

const CONSEQUENCE =
  'Firebase Admin is disabled and Admin-backed endpoints answer 503 until it is fixed.';

// The first non-empty variable in PROJECT_ID_ENV_VARS wins. There is no
// built-in fallback: a missing or placeholder id is reported, never guessed.
export function resolveFirebaseProjectId(
  env: Partial<Record<string, string | undefined>>
): FirebaseProjectResolution {
  for (const name of PROJECT_ID_ENV_VARS) {
    const value = env[name]?.trim();
    if (!value) continue;
    if (isPlaceholderProjectId(value)) {
      return {
        ok: false,
        error: `[config] The Firebase project id in ${name} is a placeholder. Set GOOGLE_CLOUD_PROJECT to the real Firebase/GCP project id. ${CONSEQUENCE}`,
      };
    }
    return { ok: true, projectId: value, source: name };
  }
  return {
    ok: false,
    error: `[config] The Firebase project id is missing. Set GOOGLE_CLOUD_PROJECT to the real Firebase/GCP project id (FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID are read as fallbacks). ${CONSEQUENCE}`,
  };
}

// Express middleware for endpoints backed by Firebase Admin: without a valid
// project id they answer 503 instead of reaching a wrong (or no) project.
export function createFirebaseProjectGuard(options: {
  isConfigured: () => boolean;
}): RequestHandler {
  return (_req, res, next) => {
    if (!options.isConfigured()) {
      res
        .status(503)
        .json({ error: 'Firebase project is not configured on this server.' });
      return;
    }
    next();
  };
}
