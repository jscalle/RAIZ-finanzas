// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, 'deploy-qa.sh');
let dir: string;
let binDir: string;
let log: string;

/** Fake gcloud/firebase/pnpm that record their arguments, so nothing real can run.
 *  QA_STUB_DESCRIBE picks what `gcloud run services describe` does: ok | fail | telegram | big. */
function writeStubs() {
  for (const name of ['gcloud', 'firebase', 'pnpm']) {
    const file = join(binDir, name);
    writeFileSync(
      file,
      `#!/usr/bin/env bash
echo "${name} $*" >> "${log}"
if [[ "$*" == *"services describe"* ]]; then
  case "\${QA_STUB_DESCRIBE:-ok}" in
    ok) echo '{"spec":{}}' ;;
    fail) echo "permission denied" >&2; exit 1 ;;
    telegram) echo '{"env":[{"name":"TELEGRAM_BOT_TOKEN"}]}' ;;
    big) echo '{"TELEGRAM_BOT_TOKEN":1}'; head -c 300000 /dev/zero | tr '\\0' 'x' ;;
  esac
fi
`
    );
    chmodSync(file, 0o755);
  }
}

function run(args: string[], env: Record<string, string> = {}) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: '',
    env: { PATH: `${binDir}:/usr/bin:/bin`, HOME: dir, ...env },
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

const FULL_ENV = [
  'VITE_FIREBASE_PROJECT_ID="raiz-qa-test"',
  'VITE_FIREBASE_API_KEY="placeholder"',
  'VITE_FIREBASE_AUTH_DOMAIN="raiz-qa-test.firebaseapp.com"',
  'VITE_FIREBASE_STORAGE_BUCKET="raiz-qa-test.appspot.com"',
  'VITE_FIREBASE_MESSAGING_SENDER_ID="000000000000"',
  'VITE_FIREBASE_APP_ID="1:000000000000:web:placeholder"',
  'VITE_API_BASE_URL="https://example-qa.run.app"',
  'VITE_FIREBASE_MEASUREMENT_ID=""',
  'VITE_GOOGLE_OAUTH_CLIENT_ID=""',
].join('\n');

/** Every VITE_* variable the app source reads (same rule the script uses). */
function viteVarsReadByApp(): string[] {
  const root = resolve(__dirname, '../..');
  const found = new Set<string>();
  for (const rel of readdirSync(join(root, 'src'), { recursive: true }) as string[]) {
    if (!/\.(ts|tsx)$/.test(rel) || /\.test\./.test(rel)) continue;
    for (const m of readFileSync(join(root, 'src', rel), 'utf8').matchAll(/VITE_[A-Z0-9_]+/g)) found.add(m[0]);
  }
  return [...found].sort();
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-qa-'));
  binDir = join(dir, 'bin');
  log = join(dir, 'calls.log');
  mkdirSync(binDir);
  writeStubs();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => rmSync(log, { force: true }));

const QA = { QA_PROJECT_ID: 'raiz-qa-test' };
const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');

describe('deploy-qa.sh guards', () => {
  it('prints usage and exits 2 without a command', () => {
    const r = run([], QA);
    expect(r.code).toBe(2);
    expect(r.out).toContain('Usage:');
  });

  it('refuses to run without QA_PROJECT_ID', () => {
    const r = run(['check']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('QA_PROJECT_ID is not set');
  });

  it('refuses a project that does not look like QA', () => {
    for (const id of ['my-app-prod', 'my-app', 'aqa-prod', 'quality']) {
      const r = run(['api', '--dry-run'], { QA_PROJECT_ID: id });
      expect(r.code).toBe(1);
      expect(r.out).toContain('does not look like a QA project');
    }
    expect(calls()).toBe('');
  });

  it('refuses a service that does not look like QA', () => {
    const r = run(['api', '--dry-run'], { ...QA, QA_SERVICE: 'my-api' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('does not look like a QA service');
  });

  it('refuses to deploy without a terminal unless --yes is given, and runs nothing', () => {
    const r = run(['api'], QA);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Re-run with --yes');
    expect(calls()).toBe('');
  });
});

describe('deploy-qa.sh commands', () => {
  it('dry-run api prints the deploy with capped instances, a secret key and no Telegram', () => {
    const r = run(['api', '--dry-run'], QA);
    expect(r.code).toBe(0);
    expect(r.out).toContain('gcloud run deploy finpersonal-api-qa');
    expect(r.out).toContain('--project raiz-qa-test');
    expect(r.out).toContain('--max-instances 2');
    expect(r.out).toContain('GOOGLE_CLOUD_PROJECT=raiz-qa-test');
    expect(r.out).toContain('CORS_ALLOWED_ORIGINS=https://raiz-qa-test.web.app,https://raiz-qa-test.firebaseapp.com');
    expect(r.out).toContain('--set-secrets GEMINI_API_KEY=gemini-api-key:latest');
    expect(r.out).not.toContain('TELEGRAM');
    expect(calls()).toBe('');
  });

  it('adds extra CORS origins when asked', () => {
    const r = run(['api', '--dry-run'], { ...QA, QA_EXTRA_ORIGINS: 'https://qa.example.com' });
    expect(r.out).toContain('https://raiz-qa-test.firebaseapp.com,https://qa.example.com');
  });

  it('runs the real commands with --yes and checks the service has no Telegram variables', () => {
    const r = run(['api', '--yes'], QA);
    expect(r.code).toBe(0);
    expect(r.out).toContain('no Telegram variables');
    const recorded = calls();
    expect(recorded).toContain('gcloud run deploy finpersonal-api-qa --project raiz-qa-test');
    expect(recorded).toContain('gcloud run services describe finpersonal-api-qa --project raiz-qa-test');
  });

  it('dry-run rules targets only the QA project', () => {
    const r = run(['rules', '--dry-run'], QA);
    expect(r.code).toBe(0);
    expect(r.out).toContain('firebase deploy --only firestore:rules --project raiz-qa-test');
  });
});

describe('deploy-qa.sh web build config', () => {
  it('fails when the env file is missing', () => {
    const r = run(['web', '--dry-run'], { ...QA, QA_ENV_FILE: join(dir, 'nope.env') });
    expect(r.code).toBe(1);
    expect(r.out).toContain('not found');
  });

  it('fails naming a variable that is missing, so production values cannot leak in', () => {
    const file = join(dir, 'partial.env');
    writeFileSync(file, FULL_ENV.split('\n').filter((l) => !l.startsWith('VITE_FIREBASE_APP_ID')).join('\n'));
    const r = run(['web', '--dry-run'], { ...QA, QA_ENV_FILE: file });
    expect(r.code).toBe(1);
    expect(r.out).toContain('VITE_FIREBASE_APP_ID is missing or empty');
  });

  it('fails when the env file points at a different project', () => {
    const file = join(dir, 'other.env');
    writeFileSync(file, FULL_ENV.replace('"raiz-qa-test"', '"another-project"'));
    const r = run(['web', '--dry-run'], { ...QA, QA_ENV_FILE: file });
    expect(r.code).toBe(1);
    expect(r.out).toContain('does not match QA_PROJECT_ID');
  });

  it('dry-run web builds in qa mode and deploys hosting to the QA project', () => {
    const file = join(dir, 'good.env');
    writeFileSync(file, FULL_ENV);
    const r = run(['web', '--dry-run'], { ...QA, QA_ENV_FILE: file });
    expect(r.code).toBe(0);
    expect(r.out).toContain('pnpm exec vite build --mode qa');
    expect(r.out).toContain('firebase deploy --only hosting --project raiz-qa-test');
  });
});

describe('deploy-qa.sh Telegram check (api)', () => {
  it.each(['fail', 'telegram', 'big'])('fails when describe is %s instead of reporting ok', (mode) => {
    const r = run(['api', '--yes'], { ...QA, QA_STUB_DESCRIBE: mode });
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('ok: no Telegram variables');
  });

  it('explains that it could not read the service when describe fails', () => {
    const r = run(['api', '--yes'], { ...QA, QA_STUB_DESCRIBE: 'fail' });
    expect(r.out).toContain('could not read the deployed service');
  });
});

describe('deploy-qa.sh env file covers every variable the app reads', () => {
  it('has a test fixture that covers all of them, so a new variable fails here first', () => {
    const covered = FULL_ENV.split('\n').map((l) => l.split('=')[0]);
    expect(viteVarsReadByApp().filter((k) => !covered.includes(k))).toEqual([]);
  });

  it.each(['VITE_FIREBASE_MEASUREMENT_ID', 'VITE_GOOGLE_OAUTH_CLIENT_ID'])('fails when %s is not defined, so a production .env value cannot leak', (key) => {
    const file = join(dir, `no-${key}.env`);
    writeFileSync(file, FULL_ENV.split('\n').filter((l) => !l.startsWith(`${key}=`)).join('\n'));
    const r = run(['web', '--dry-run'], { ...QA, QA_ENV_FILE: file });
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${key} is read by the app`);
  });

  it('accepts those variables defined as empty', () => {
    const file = join(dir, 'empty-optional.env');
    writeFileSync(file, FULL_ENV);
    expect(run(['web', '--dry-run'], { ...QA, QA_ENV_FILE: file }).code).toBe(0);
  });
});

describe('deploy-qa.sh input validation', () => {
  it.each([
    ['QA_PROJECT_ID', 'my app-qa'],
    ['QA_PROJECT_ID', 'qa'],
    ['QA_REGION', 'us-central1;touch /tmp/x'],
    ['QA_REGION', 'Central'],
    ['QA_SERVICE', 'My-API-qa'],
    ['QA_GEMINI_SECRET', 'a,TELEGRAM_BOT_TOKEN=tg'],
    ['QA_EXTRA_ORIGINS', 'https://a.com@TELEGRAM_BOT_TOKEN=evil'],
    ['QA_EXTRA_ORIGINS', '*'],
    ['QA_EXTRA_ORIGINS', 'https://a.com/path'],
    ['QA_EXTRA_ORIGINS', 'https://ok.example.com,'],
  ])('rejects %s=%j and runs nothing', (name, value) => {
    const r = run(['api', '--yes'], { ...QA, [name]: value });
    expect(r.code).toBe(1);
    expect(r.out).toContain('error:');
    expect(calls()).not.toContain('gcloud run deploy');
  });

  it('accepts a normal extra origin list', () => {
    const r = run(['api', '--dry-run'], { ...QA, QA_EXTRA_ORIGINS: 'https://qa.example.com,http://localhost:5173' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('https://qa.example.com,http://localhost:5173');
  });
});
