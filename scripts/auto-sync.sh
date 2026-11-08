#!/usr/bin/env bash
# Keeps this machine in sync with GitHub: every SYNC_INTERVAL seconds, fast-forward to origin/<branch>.
# - Next.js dev server hot-reloads changed files automatically.
# - voice-server runs under `tsx watch`, so it restarts itself when its code changes.
# - If package-lock.json changed, dependencies are installed.
# - Never force-overwrites local work: if the pull is not a clean fast-forward, it logs and waits.
set -u
cd "$(dirname "$0")/.."
BRANCH="${SYNC_BRANCH:-main}"
INTERVAL="${SYNC_INTERVAL:-10}"
log() { echo "[auto-sync $(date +%H:%M:%S)] $*"; }
log "watching origin/$BRANCH every ${INTERVAL}s in $(pwd)"
while true; do
  if git fetch -q origin "$BRANCH" 2>/dev/null; then
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse "origin/$BRANCH")
    if [ "$LOCAL" != "$REMOTE" ]; then
      if git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
        CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
        if git merge --ff-only -q "origin/$BRANCH" 2>/dev/null; then
          log "updated ${LOCAL:0:7} -> ${REMOTE:0:7} ($(echo "$CHANGED" | wc -l) files): $(git log -1 --format='%an: %s')"
          if echo "$CHANGED" | grep -qx "package-lock.json"; then log "dependencies changed -> npm install"; npm install --no-audit --no-fund >/dev/null 2>&1 && log "npm install done"; fi
          if echo "$CHANGED" | grep -qx "gateway.mts"; then log "gateway.mts changed -> restart the gateway manually (npm run gateway)"; fi
        else
          log "cannot fast-forward: local uncommitted changes touch the same files. Commit/stash them, then it will catch up."
        fi
      else
        log "local branch has commits not on GitHub. Push them (git push) so everyone gets them; auto-sync resumes after."
      fi
    fi
  else
    log "fetch failed (offline?) — retrying"
  fi
  sleep "$INTERVAL"
done
