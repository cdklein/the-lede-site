# The desk-down switch: setup and use

This folder holds a small Cloudflare script (a Worker) that answers
`https://theledeapp.com/status/app.json`. The app checks that address. While it says the desk
is down, the Queue shows one line and the no-brief cards say "The desk was down". You flip it
from your phone with two Shortcuts. Issue: ios#598 (the outage notice).

What the address says:

- Desk down: `{"v":1,"notice":"desk_unavailable","expires":"2026-10-30T00:00:00Z"}`
- Desk up, or anything wrong: `{"v":1,"notice":null}`

The stored value carries a code, never words. The app shows only words built into it. Someone
who stole the phone's token could at most show our own approved line for 48 hours.

Do the steps in order: 1, 2, 3, then the dry run in 4. The app half already shipped, so the
line appears in the app the moment step 4 works.

Nothing here touches the site deploy. `deploy.sh` copies named files only (root `*.html`,
`styles.css`, images, `_redirects`, `robots.txt`, `sitemap.xml`, `llms.txt`, `fonts/`,
`press-kit/`) and never copies `workers/`. The Pages project is direct upload with no build
step, so nothing else picks this folder up either.

## 1. Create the storage and deploy the Worker

You need: the Cloudflare account that holds `theledeapp.com`, and its account id (dashboard,
any zone's Overview page, right column, "Account ID").

### Path A: the dashboard (no laptop tools)

1. dash.cloudflare.com, then Storage & Databases, then Workers KV (older layouts: Workers &
   Pages, then KV). Create a namespace named `lede-desk-status`. Copy its id.
2. Workers & Pages, then Create, then Create Worker. Name it `lede-desk-status`. Deploy the
   starter, then Edit code. Replace everything with the contents of `worker.js` from this
   folder. Deploy.
3. In that Worker: Settings, then Bindings, then Add, then KV namespace. Variable name
   `STATUS` (exactly), namespace `lede-desk-status`. Save and deploy.
4. Settings, then Domains & Routes, then Add, then Route. Zone `theledeapp.com`, route
   `theledeapp.com/status/*`. Save.
5. Settings: turn off the `workers.dev` address and preview addresses. Under Observability,
   leave Workers Logs off and do not add Logpush.
6. If the page offers "Request limit failure mode" (free plan), set it to Fail open. A Worker
   over its limit then falls through to the site's 404, which the app reads as no notice.
7. Paste the namespace id into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID`, so
   the repo matches what is live.

### Path B: the laptop with wrangler

Wrangler is not installed globally; run it through `pnpm dlx`, as `deploy.sh` does.

**Token.** The Pages token in 1Password (the one `deploy.sh` reads) is very likely limited to
Cloudflare Pages and cannot deploy a Worker. Make a separate deploy token: dashboard, My
Profile, API Tokens, Create Token, Custom token, with:

- Account, Workers Scripts, Edit
- Account, Workers KV Storage, Edit
- Zone, Workers Routes, Edit (zone: `theledeapp.com` only)
- Account resources: this one account only
- Set an end date a few days out. It is only for setup.

Then, in a terminal at this folder (`workers/desk-status`), with the token and account id in
the environment (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, read from 1Password the way
`deploy.sh` does):

```
pnpm dlx wrangler kv namespace create lede-desk-status
```

It prints an `id`. Paste it into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID`.

```
node --test
pnpm dlx wrangler deploy
```

The deploy sets the route `theledeapp.com/status/*`, turns off the `workers.dev` address and
keeps logging off, all from `wrangler.toml`. Do step 6 of Path A in the dashboard (fail open).

### Check it

Open `https://theledeapp.com/status/app.json` in any browser. It should show
`{"v":1,"notice":null}`. Before this step it showed the site's 404 page.

## 2. A separate, narrow token for the phone

This token lives inside the two Shortcuts on your phone, so keep it as small as Cloudflare
allows. Dashboard, My Profile, API Tokens, Create Token, Custom token:

- Permission: Account, Workers KV Storage, Edit. Nothing else.
- Account resources: this one account only.
- No end date (the switch has to work during an outage), or a long one you will remember to
  renew.

Name it "Lede desk switch (phone)". Copy it once; Cloudflare will not show it again. Store a
copy in 1Password.

What it can reach: Cloudflare cannot narrow this permission to one namespace. It can edit
every KV namespace in the account. Check the KV list from step 1: if `lede-desk-status` is the
only namespace, the token reaches nothing else. If other namespaces exist, know that this
token can change them too. If the phone is lost, delete the token in the same dashboard page;
the notice it may have left on deletes itself within 12 hours.

## 3. The two Shortcuts

You need three values: the account id, the namespace id from step 1, and the phone token from
step 2. The address both Shortcuts call is:

```
https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/storage/kv/namespaces/NAMESPACE_ID/values/notice
```

Replace `ACCOUNT_ID` and `NAMESPACE_ID` with yours. The last word, `notice`, stays as is.

### "Lede desk down"

In the Shortcuts app, new Shortcut, named `Lede desk down`. Add these actions in order:

1. **Date**: Current Date.
2. **Adjust Date**: Add 12 hours to Date.
3. **Format Date**: the Adjusted Date. Date Format: ISO 8601. Turn on Include ISO 8601 Time.
   (Without the time the app ignores the notice.)
4. **Text**: type exactly this, inserting the Formatted Date variable where shown:
   `{"v":1,"notice":"desk_unavailable","expires":"FORMATTED DATE"}`
   Straight quotes only. If the Text action turns them curly, the notice will not show; the
   dry run catches it.
5. **Get Contents of URL**:
   - URL: the address above, with `?expiration_ttl=43200` added at the end.
   - Method: PUT.
   - Headers: `Authorization` with value `Bearer ` followed by the phone token (one space
     after Bearer), and `Content-Type` with value `application/octet-stream`.
   - Request Body: File, and pick the Text from action 4.
6. **Show Result**: Contents of URL. A good run shows `"success": true`.

Each tap writes a fresh 12 hours (`expiration_ttl=43200` seconds). If you forget to turn it
off, Cloudflare deletes the value by itself, and the app also drops it at the expiry time.

### "Lede desk back"

New Shortcut, named `Lede desk back`:

1. **Get Contents of URL**:
   - URL: the address above, with nothing added.
   - Method: DELETE.
   - Headers: `Authorization` with value `Bearer ` followed by the phone token.
2. **Show Result**: Contents of URL. A good run shows `"success": true`.

Add both to the Home Screen (Shortcut, Share, Add to Home Screen). Siri runs them by name too.

### Fallback without the Shortcuts

Dashboard in Safari, Workers KV, `lede-desk-status`, KV Pairs. Add key `notice` with the JSON
from step 4 (edit the date by hand, at most 48 hours out). Delete the key to turn it off. The
dashboard cannot set the automatic 12 hours, so the date inside the value is what ends it. The
dry run tells you whether this works on your phone.

## 4. The phone dry run

Do this once after setup, and again after any change to the Shortcuts.

1. Tap **Lede desk down**. It shows `"success": true`.
2. Open `https://theledeapp.com/status/app.json` in Safari. It shows `"notice":"desk_unavailable"`
   and an `expires` about 12 hours from now, in UTC. If it shows `"notice":null`, the stored
   value is wrong: check the straight quotes and Include ISO 8601 Time.
   Allow up to a minute; the address can answer from a short cache.
3. Open The Lede, on a device with the desk on. The Queue shows the line "The desk is down."
   If the app was already open, send it to the background and bring it back.
4. Tap **Lede desk back**. It shows `"success": true`.
5. Reload the Safari page after a minute: `"notice":null`.
6. In the app, the line clears within 5 minutes while the app is open, or at once when you
   bring the app back from the background after 5 minutes.

If step 3 fails while step 2 is right, the app half is at fault: report it on ios#598 (the
outage notice).
