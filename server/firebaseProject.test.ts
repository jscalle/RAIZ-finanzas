// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  createFirebaseProjectGuard,
  isPlaceholderProjectId,
  resolveFirebaseProjectId,
} from './firebaseProject';

describe('resolveFirebaseProjectId (S10 startup project id)', () => {
  it('prefers GOOGLE_CLOUD_PROJECT, then FIREBASE_PROJECT_ID, then VITE_FIREBASE_PROJECT_ID', () => {
    expect(
      resolveFirebaseProjectId({
        GOOGLE_CLOUD_PROJECT: 'gcp-project',
        FIREBASE_PROJECT_ID: 'firebase-project',
        VITE_FIREBASE_PROJECT_ID: 'vite-project',
      })
    ).toEqual({
      ok: true,
      projectId: 'gcp-project',
      source: 'GOOGLE_CLOUD_PROJECT',
    });
    expect(
      resolveFirebaseProjectId({
        FIREBASE_PROJECT_ID: 'firebase-project',
        VITE_FIREBASE_PROJECT_ID: 'vite-project',
      })
    ).toEqual({
      ok: true,
      projectId: 'firebase-project',
      source: 'FIREBASE_PROJECT_ID',
    });
    expect(
      resolveFirebaseProjectId({ VITE_FIREBASE_PROJECT_ID: 'vite-project' })
    ).toEqual({
      ok: true,
      projectId: 'vite-project',
      source: 'VITE_FIREBASE_PROJECT_ID',
    });
  });

  it('reports a missing project id naming GOOGLE_CLOUD_PROJECT, with no placeholder fallback', () => {
    const result = resolveFirebaseProjectId({ GOOGLE_CLOUD_PROJECT: '  ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('GOOGLE_CLOUD_PROJECT');
    expect(result.error).toContain('503');
    expect(result).not.toHaveProperty('projectId');
  });

  it('rejects the placeholder project id and any value starting with "your-"', () => {
    for (const placeholder of [
      'your-firebase-project-id',
      'your-project',
      'YOUR-GCP-PROJECT',
    ]) {
      expect(isPlaceholderProjectId(placeholder)).toBe(true);
      const result = resolveFirebaseProjectId({
        GOOGLE_CLOUD_PROJECT: placeholder,
        VITE_FIREBASE_PROJECT_ID: 'real-project',
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toContain('GOOGLE_CLOUD_PROJECT');
      expect(result.error).toContain('placeholder');
    }
    expect(isPlaceholderProjectId('raiz-finanzas-prod')).toBe(false);
  });
});

describe('createFirebaseProjectGuard (S10 Admin-backed endpoints)', () => {
  function run(isConfigured: boolean) {
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    createFirebaseProjectGuard({ isConfigured: () => isConfigured })(
      {} as Request,
      res,
      next
    );
    return { res, json, next };
  }

  it('answers 503 instead of reaching Firestore when the project id is not configured', () => {
    const { res, json, next } = run(false);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: 'Firebase project is not configured on this server.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('lets the request through when the project id is configured', () => {
    const { res, next } = run(true);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
