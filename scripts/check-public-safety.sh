#!/usr/bin/env bash
# Blocks secrets and personal data from reaching this public repository.
#
# Usage:
#   scripts/check-public-safety.sh --staged   # pre-commit: staged files + author identity
#   scripts/check-public-safety.sh --all      # audit every tracked file
#   scripts/check-public-safety.sh --push     # pre-push: reads git's ref lines on stdin
#
# Personal identifiers (names, real project IDs, etc.) go in a local, never-committed
# denylist, one extended regex per line: .git/info/public-safety-denylist
# Allowed commit email regex (default: GitHub noreply): git config publicsafety.allowedEmail

set -u

ROOT=$(git rev-parse --show-toplevel) || exit 2
cd "$ROOT" || exit 2

DENYLIST="$(git rev-parse --git-path info/public-safety-denylist)"
ALLOWED_EMAIL=$(git config --get publicsafety.allowedEmail || echo '@users\.noreply\.github\.com$')
EXCLUDES=(':(exclude)pnpm-lock.yaml' ':(exclude)scripts/check-public-safety.sh')
ZERO_SHA='0000000000000000000000000000000000000000'
FAIL=0

# label|extended regex
CONTENT_RULES='Google API key|AIza[0-9A-Za-z_-]{35}
Google OAuth client ID|[1-9][0-9]{11}-[a-z0-9]{32}\.apps\.googleusercontent\.com
Telegram bot token|[1-9][0-9]{7,9}:AA[A-Za-z0-9_-]{33}
Private key block|-----BEGIN [A-Z ]*PRIVATE KEY-----
GitHub token|gh[pousr]_[A-Za-z0-9]{36}
GitHub fine-grained token|github_pat_[A-Za-z0-9_]{22,}
LLM API key|(^|[^A-Za-z0-9])sk-(ant-)?[A-Za-z0-9_-]{20,}
AWS access key|AKIA[0-9A-Z]{16}
Meta/WhatsApp access token|EAA[A-Za-z0-9]{40,}
Apple Team ID|DEVELOPMENT_TEAM *= *"?[A-Z0-9]{10}([^A-Z0-9]|$)
Local home path|/(Users|home)/[A-Za-z0-9._-]+/'

# Files that must never be tracked (extended regex on the path).
FILENAME_RULES='Environment file|(^|/)\.env(\.[^/]*)?$
Signing or private key|\.(p8|p12|pem|key|mobileprovision|keystore|jks)$
Service account credentials|(service[-_]?account|serviceAccount)[^/]*\.json$
Finder duplicate|[^/] [0-9]+(\.[A-Za-z0-9]+)?$
macOS metadata|(^|/)\.DS_Store$'

report() {
  local total
  printf '\033[31m✖ %s\033[0m\n' "$1" >&2
  if [ -n "${2:-}" ]; then
    total=$(printf '%s\n' "$2" | wc -l | tr -d ' ')
    printf '%s\n' "$2" | head -20 | sed 's/^/    /' >&2
    [ "$total" -gt 20 ] && printf '    ... and %s more\n' "$((total - 20))" >&2
  fi
  FAIL=1
}

escape_ere() {
  printf '%s' "$1" | sed 's/[][\.*^$()+?{}|/]/\\&/g'
}

# Rules = built-ins + personal denylist + the committer's own non-public email.
all_content_rules() {
  printf '%s\n' "$CONTENT_RULES"
  if [ -f "$DENYLIST" ]; then
    grep -v -E '^[[:space:]]*(#|$)' "$DENYLIST" | sed 's/^/Personal denylist entry|/'
  fi
  local email
  email=$(git config --get user.email || true)
  if [ -n "$email" ] && ! printf '%s' "$email" | grep -q -E "$ALLOWED_EMAIL"; then
    printf 'Your personal email|%s\n' "$(escape_ere "$email")"
  fi
}

# $1 = --cached or a commit; remaining args = pathspecs (empty = whole tree).
scan_content() {
  local target=$1 label re raw rc strip
  shift
  [ "$target" = "--cached" ] && strip='s/^//' || strip="s/^$target://"
  while IFS='|' read -r label re; do
    [ -z "$label" ] && continue
    raw=$(git grep -n -I -E -e "$re" "$target" -- "$@" "${EXCLUDES[@]}" 2>/dev/null)
    rc=$?
    # git grep: 0 = match, 1 = no match, >1 = error (e.g. invalid denylist regex).
    if [ "$rc" -gt 1 ]; then
      report "Invalid regex for rule: $label (check $DENYLIST)"
    elif [ -n "$raw" ]; then
      report "$label" "$(printf '%s\n' "$raw" | sed "$strip" | cut -d: -f1-2)"
    fi
  done < <(all_content_rules)
}

# stdin = NUL-separated paths
scan_filenames() {
  local paths label re hits
  paths=$(tr '\0' '\n' | grep -v -E '(^|/)\.env\.example$')
  [ -z "$paths" ] && return
  while IFS='|' read -r label re; do
    [ -z "$label" ] && continue
    hits=$(printf '%s\n' "$paths" | grep -E "$re")
    [ -n "$hits" ] && report "$label must not be tracked" "$hits"
  done <<<"$FILENAME_RULES"
}

check_email() {
  local who=$1 email=$2
  printf '%s' "$email" | grep -q -E "$ALLOWED_EMAIL" ||
    report "$who email '$email' is personal" "Use your GitHub noreply address: git config user.email '<id>+<user>@users.noreply.github.com'"
}

run_staged() {
  local files=()
  while IFS= read -r -d '' f; do files+=("$f"); done \
    < <(git diff --cached --name-only -z --diff-filter=ACMR)
  [ ${#files[@]} -gt 0 ] && scan_content --cached "${files[@]}"
  # Process substitution keeps scan_filenames in this shell so FAIL is not lost.
  scan_filenames < <(git diff --cached --name-only -z --diff-filter=ACR)
  check_email "Commit author" "$(git var GIT_AUTHOR_IDENT | sed -E 's/.*<(.*)>.*/\1/')"
}

run_all() {
  local email
  scan_content --cached
  scan_filenames < <(git ls-files -z)
  for email in $(git log --format='%ae%n%ce' HEAD | sort -u); do
    check_email "Commit history" "$email"
  done
}

run_push() {
  local local_ref local_sha remote_ref remote_sha range commit ae ce
  while read -r local_ref local_sha remote_ref remote_sha; do
    [ "$local_sha" = "$ZERO_SHA" ] && continue
    # Remote tip unknown locally (new branch, or force push over unfetched work):
    # check everything no remote-tracking ref already holds.
    if [ "$remote_sha" = "$ZERO_SHA" ] || ! git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
      range=$(git rev-list "$local_sha" --not --remotes) || report "Cannot list commits pushed to $remote_ref"
    else
      range=$(git rev-list "$remote_sha..$local_sha") || report "Cannot list commits pushed to $remote_ref"
    fi
    for commit in $range; do
      ae=$(git log -1 --format=%ae "$commit")
      ce=$(git log -1 --format=%ce "$commit")
      check_email "Author of $(git rev-parse --short "$commit")" "$ae"
      check_email "Committer of $(git rev-parse --short "$commit")" "$ce"
    done
    scan_content "$local_sha"
    scan_filenames < <(git ls-tree -r -z --name-only "$local_sha")
  done
}

case "${1:-}" in
  --staged) run_staged ;;
  --all) run_all ;;
  --push) run_push ;;
  *) echo "usage: $0 --staged | --all | --push" >&2; exit 2 ;;
esac

if [ "$FAIL" -ne 0 ]; then
  printf '\n\033[31mBlocked: this repository is public. Remove the items above.\033[0m\n' >&2
  printf 'Audit everything with: scripts/check-public-safety.sh --all\n' >&2
  exit 1
fi
echo "public-safety: OK"
