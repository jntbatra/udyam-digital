# Team workflow

The app is hosted on Jayant's PC and shared through a Cloudflare tunnel (link + access code shared privately).
That PC **auto-pulls from GitHub every ~10 seconds**, so whatever you push to `main` is live on the shared link almost immediately.

## One-time setup (each teammate)

```bash
gh repo clone jntbatra/udyam-digital      # private repo — ask Jayant to add you as a collaborator
cd udyam-digital
npm install
cp .env.example .env.local                # defaults are fine
```

AWS: only needed if you run the app locally with the real AI/OCR/voice. Use your own credentials in `~/.aws/credentials`. Never commit keys. Set `ADVISOR_MODE=guided` in `.env.local` to run the advisor with no AWS cost.

## Daily loop

```bash
git pull                         # start from the latest
npm run dev                      # http://localhost:3100  (optional: npm run voice in a 2nd terminal)
# ...make changes...
npm run typecheck                # must pass
npm run check:engine             # rule engine replay + scenarios (no AWS)
npm run check:kyc                # KYC self-check on 12 specimen applicants (no AWS)
git add -A && git commit -m "what you changed"
git pull --rebase && git push    # live on the shared link within ~10 s
```

Rules:
- Push small, working commits to `main`. If you push something broken, the shared link breaks for everyone — run `npm run typecheck` first.
- Pull before you start and before you push (`git pull --rebase`) to avoid conflicts.
- Don't commit `.env.local`, AWS keys, or `data/store.json` (runtime data; already git-ignored).
- Changes to `package.json` dependencies are installed automatically on the host.
- Changes to `gateway.mts` need a manual gateway restart on the host — tell Jayant.

## Host machine (Jayant's PC)

```bash
npm run host        # auto-sync + voice server (auto-restarts on change) + gateway + Next dev
# then, in another terminal, the public link:
cloudflared tunnel --config /dev/null --no-autoupdate --url http://localhost:8080
```

Or run the pieces separately: `npm run sync`, `npm run voice`, `npm run gateway`, `npm run dev`.
The gateway prints the ACCESS CODE (set your own with `ACCESS_CODE=xxxx npm run gateway`).
Auto-sync never force-overwrites local edits: if the host has uncommitted changes in the same files, it logs a warning and waits — commit and push them.
