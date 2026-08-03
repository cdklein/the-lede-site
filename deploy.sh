#!/usr/bin/env bash
# deploy.sh — build content, then deploy the-lede-site to Cloudflare Pages.
# Ports the exact commands from DEPLOY.md. Only public assets are staged —
# templates/, content/, and *.md docs never leave the repo (the cp glob
# below only ever matches root *.html, which is what we want).
set -euo pipefail
cd "$(dirname "$0")"

# Always build first so root index.html / thanks.html reflect content/copy.json.
node build.mjs

export CLOUDFLARE_API_TOKEN=$(op read "op://dev-secrets/nepiz423wyfotetlfjffoic4a4/TOKEN")
export CLOUDFLARE_ACCOUNT_ID=$(op read "op://dev-secrets/nepiz423wyfotetlfjffoic4a4/ACCOUNT-ID")
STAGE=$(mktemp -d) && cp *.html styles.css *.png *.webp _redirects robots.txt sitemap.xml llms.txt "$STAGE"/ && cp -R fonts "$STAGE"/fonts
cp -R press-kit "$STAGE"/press-kit   # /press assets + the downloadable zip (site#6)
rm -f "$STAGE"/og-card-source.html   # internal source for og-card.png, never served
pnpm dlx wrangler pages deploy "$STAGE" --project-name the-lede-site --branch main --commit-dirty=true
rm -rf "$STAGE"
