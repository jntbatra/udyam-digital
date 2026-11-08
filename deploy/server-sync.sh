#!/usr/bin/env bash
# Pull new commits from GitHub, rebuild, restart. Run every minute by udyam-sync.timer.
set -uo pipefail
cd /opt/udyam
git fetch -q origin main || exit 0
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
CHANGED=$(git diff --name-only HEAD origin/main)
git merge --ff-only -q origin/main || { echo "cannot fast-forward"; exit 1; }
echo "updating to $(git log -1 --format='%h %an: %s')"
if echo "$CHANGED" | grep -qx package-lock.json; then npm ci --no-audit --no-fund; fi
NODE_OPTIONS=--max-old-space-size=1536 npx next build && sudo /usr/bin/systemctl restart udyam-web udyam-voice udyam-gateway
