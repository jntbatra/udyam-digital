# Deploy (AWS ap-south-1, t3a.small spot, Cloudflare Tunnel on accel.jayantb.dev)

- EC2 has **no inbound ports**: traffic arrives via Cloudflare Tunnel (`cloudflared-udyam`), admin via AWS SSM Session Manager.
- Instance role `udyam-ec2-role`: Bedrock/Mantle inference, Textract DetectDocumentText, read `/udyam/*` SSM parameters, SSM core.
- Secrets in SSM Parameter Store (SecureString): `/udyam/sarvam_api_key`, `/udyam/cf_tunnel_creds`, `/udyam/access_code`, `/udyam/deploy_key`.
- Services: `udyam-web` (:3100), `udyam-voice` (:3001), `udyam-gateway` (:8080), `cloudflared-udyam`, `udyam-sync.timer` (every minute: pull, rebuild, restart).
- `bootstrap.sh` sets everything up on a fresh Amazon Linux 2023 arm64 instance (run by EC2 user-data).
- Logs: `journalctl -u udyam-web -u udyam-voice -u udyam-gateway -u cloudflared-udyam -f`
