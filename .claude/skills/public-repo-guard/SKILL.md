---
name: public-repo-guard
description: "Trigger: commit, push, publish, make repo public, add config/seed/fixtures/docs. Block secrets and personal data from this public repo."
license: Apache-2.0
metadata:
  author: "jscalle"
  version: "1.0"
---

## Activation Contract

Load before any commit or push, before changing repo visibility, and when adding or editing config files, seed/demo data, test fixtures, images, or docs.

## Hard Rules

- Run `scripts/check-public-safety.sh` (mode per gate below); never commit or push while it fails.
- Never use `--no-verify` unless the user explicitly approves that exact commit or push.
- Tracked config (`firebase-applet-config.json`, `.firebaserc`, `ios/App/App/GoogleService-Info.plist`, `.env.example`) keeps placeholders only; real values live in ignored files.
- Never write personal identifiers into tracked files, including into the guard script; add them to `.git/info/public-safety-denylist` (local, never committed).
- Commit author and committer must use the GitHub noreply email.
- Seed data, fixtures, and examples use fictitious names, emails, amounts, and categories; never mirror the owner's real budget, limits, or transactions.
- Never restore or push history from before the public orphan commit; it held real keys and the personal email and lives only in an off-repo bundle.
- Keep `AUDIT.md`, `workspace_audit_report.md`, `auditorias/`, and `openspec/` untracked; they are internal docs and stay gitignored.
- Keep `DEVELOPMENT_TEAM` out of `project.pbxproj`; it belongs in the ignored `ios/signing.local.xcconfig`.

## Decision Gates

| Situation | Command |
|---|---|
| Before commit | `scripts/check-public-safety.sh --staged` (pre-commit hook runs it) |
| Before push | pre-push hook runs `--push` automatically |
| Before going public or periodic audit | `scripts/check-public-safety.sh --all` |
| Hooks not active (`git config core.hooksPath` empty) | `git config core.hooksPath .githooks` |

## Execution Steps

1. Confirm hooks are active; enable them if not.
2. Run the script in the mode the gate requires.
3. Fix every reported `file:line`; for false positives, change the pattern only with user approval.
4. Review judgment items regex cannot catch: real financial profile in seed data, real names or faces in images, screenshots, internal notes or agent logs in docs, real SMS/email samples.
5. Re-run until `public-safety: OK`.

## Output Contract

Return a table: `file:line | finding | severity (block/warn) | fix`, then the final script result. Never echo a secret value; cite location only.

## References

- `scripts/check-public-safety.sh` — rules, modes, and denylist location.
