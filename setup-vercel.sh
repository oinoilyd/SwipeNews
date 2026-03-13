#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# setup-vercel.sh  —  Run ONCE to link this project to your Vercel account.
# After this, use:  npm run deploy   (to ship to production)
# ──────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "=== SwipeNews — Vercel Setup ==="
echo ""

# 1. Install deps
echo "→ Installing dependencies..."
npm install

# 2. Log in to Vercel (opens browser the first time; skips if already logged in)
echo ""
echo "→ Logging in to Vercel (browser will open if not already authenticated)..."
npx vercel@latest login

# 3. Link this directory to the Vercel project
#    --yes skips prompts (re-run without --yes if you need to choose a different project)
echo ""
echo "→ Linking project to Vercel..."
npx vercel@latest link

echo ""
echo "════════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Deploy to production any time with:"
echo "    npm run deploy"
echo ""
echo "  Deploy a preview (no traffic) with:"
echo "    npm run deploy:preview"
echo "════════════════════════════════════════════════════"
echo ""
