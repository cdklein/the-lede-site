# Deploying theledeapp.com

Static marketing + legal site for The Lede. Plain HTML/CSS, no build step, no JS.
Hosted on **DigitalOcean App Platform** (static site). The API stays on Railway —
this is a completely separate host. The retired DO droplet is not involved.

URLs Apple needs for the App Store listing:
- Marketing: `https://theledeapp.com`
- Privacy:   `https://theledeapp.com/privacy.html`
- Support:   `https://theledeapp.com/support.html`

---

## Why App Platform (not a droplet)
Static site = $0–small, automatic TLS (Let's Encrypt), global CDN, deploy-on-push,
zero servers to patch. A droplet would reintroduce the ops burden we retired.

## ⚠️ Read first: the DNS / email interaction
DNS for `theledeapp.com` is currently at **DreamHost** (ns1–3.dreamhost.com).
The recommended path below **moves nameservers to DigitalOcean** so DO can manage
the apex domain + TLS automatically (DreamHost DNS can't point an apex at App
Platform's hostname cleanly).

If you want **`support@theledeapp.com` email**, decide the host *before* moving
nameservers:
- **Email at DreamHost / elsewhere:** after moving NS to DO, re-create the **MX
  records** (and any SPF/DKIM TXT) in DO → Networking → Domains, or you'll lose mail.
- **Simple forwarding only:** an email forwarder (e.g. DreamHost forward-only, or
  iCloud Custom Domain) also needs its MX/TXT records recreated in DO DNS.
- Quickest interim: use a forwarder so `support@` lands in an inbox you already read.

---

## Step 1 — Put this folder in a GitHub repo
```bash
cd the-lede-site
git init && git add -A && git commit -m "Initial site"
gh repo create the-lede-site --private --source=. --remote=origin --push
```
Then set the real `github.repo` (`OWNER/the-lede-site`) in `.do/app.yaml`.

## Step 2 — Create the App Platform static site
**Console:** DigitalOcean → Apps → Create App → GitHub → pick `the-lede-site`,
branch `main` → it auto-detects a Static Site → set index `index.html`,
error/catchall `404.html` → Create. First deploy takes ~1 min.

**Or CLI** (if you give me a DO API token, I can run these):
```bash
brew install doctl
doctl auth init                       # paste DO API token
doctl apps create --spec .do/app.yaml
doctl apps list                       # grab the APP_ID + the *.ondigitalocean.app URL
```
Verify the temporary `*.ondigitalocean.app` URL renders before touching DNS.

## Step 3 — Add the custom domain
In the app: **Settings → Domains → Add Domain → `theledeapp.com`** and choose
**"We manage your domain"** (DigitalOcean DNS). Add `www.theledeapp.com` too.
DO will tell you the nameservers to use (ns1/ns2/ns3.digitalocean.com).

## Step 4 — Point DreamHost at DigitalOcean
DreamHost panel → **Domains → Registrations → `theledeapp.com` → DNS / Nameservers**
→ set custom nameservers:
```
ns1.digitalocean.com
ns2.digitalocean.com
ns3.digitalocean.com
```
Then in DO → **Networking → Domains → Add Domain `theledeapp.com`** (if not already
created by the app). Re-create MX/TXT here if you set up email (see warning above).

Propagation is usually minutes to a few hours. DO provisions TLS automatically once
DNS resolves to it.

## Step 5 — Verify
```bash
dig +short NS theledeapp.com           # should show *.digitalocean.com
curl -sI https://theledeapp.com | head -1            # 200, valid TLS
curl -sI https://theledeapp.com/privacy.html | head -1
```
Confirm the App Store listing URLs load over HTTPS.

## Updating the site later
Push to `main` → App Platform redeploys automatically (`deploy_on_push: true`).
