#!/usr/bin/env bash
# One-time server setup for the Udyam demo on Amazon Linux 2023 (arm64 t4g or x86_64 t3a).
# Run as root from /opt/udyam after the repo is cloned. Secrets come from SSM Parameter Store (/udyam/*).
set -euxo pipefail
REGION=ap-south-1
APP=/opt/udyam
TUNNEL_ID=0b8808b5-9240-438c-a438-e6e9532795cd
HOSTNAME_PUBLIC=accel.jayantb.dev
param() { aws ssm get-parameter --region "$REGION" --name "$1" --with-decryption --query Parameter.Value --output text; }

# swap (2 GB RAM is tight for `next build`)
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ARCH=$(uname -m)                       # aarch64 (t4g) or x86_64 (t3a)
NODE_ARCH=$([ "$ARCH" = aarch64 ] && echo arm64 || echo x64)
# Node.js 22 (official build)
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  TARBALL=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/ | grep -o "node-v22[0-9.]*-linux-$NODE_ARCH.tar.xz" | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$TARBALL" | tar -xJ -C /usr/local --strip-components=1
fi

# cloudflared
if ! command -v cloudflared >/dev/null; then
  dnf install -y "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH.rpm"
fi

# app env (no AWS keys: the instance role provides credentials)
cat > "$APP/.env.local" <<ENV
MANTLE_REGION=ap-south-1
MANTLE_MODEL=moonshotai.kimi-k2.5
TEXTRACT_REGION=ap-south-1
OCR_CACHE=on
VOICE_PORT=3001
VOICE_PROVIDER=sarvam
SARVAM_API_KEY=$(param /udyam/sarvam_api_key)
SARVAM_STT_MODEL=saaras:v3-realtime
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_SPEAKER=shubh
SARVAM_PACE=1.2
SONIC_MAX_SECONDS=600
ENV
chmod 600 "$APP/.env.local"
echo "ACCESS_CODE=$(param /udyam/access_code)" > /etc/udyam-gateway.env; chmod 600 /etc/udyam-gateway.env

# build
chown -R app:app "$APP"
sudo -u app bash -c "cd $APP && npm ci --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=1536 npx next build"

# Cloudflare named tunnel -> gateway :8080 (no inbound ports needed)
mkdir -p /etc/cloudflared
param /udyam/cf_tunnel_creds > /etc/cloudflared/$TUNNEL_ID.json; chmod 600 /etc/cloudflared/$TUNNEL_ID.json
cat > /etc/cloudflared/config.yml <<CF
tunnel: $TUNNEL_ID
credentials-file: /etc/cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: $HOSTNAME_PUBLIC
    service: http://localhost:8080
  - service: http_status:404
CF

# systemd services
install -m 644 "$APP/deploy/systemd/"*.service /etc/systemd/system/
install -m 644 "$APP/deploy/systemd/"*.timer /etc/systemd/system/ 2>/dev/null || true
systemctl daemon-reload
systemctl enable --now udyam-web udyam-voice udyam-gateway cloudflared-udyam udyam-sync.timer
