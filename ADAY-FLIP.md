# A-day flip — turning theledeapp.com from "coming soon" to "out now"

The launch-day site is already written, styled, and built. Flipping it is a
promote-and-deploy, not a writing session. That was the whole point of
the-lede-site#2, and of holding this in the repo since 2026-08-01.

**Do not run any of this before the app is actually live on the App Store.** The
badge, the Smart App Banner, the `downloadUrl`, and the words "Out now" all
assert a public listing. Asserting one early is a broken promise on the one page
whose job is to be trusted.

---

## ⚠️ Two things must be filled in first

**1. The provider token in the two store URLs.**
Both App Store links carry `pt=PROVIDER_ID_TODO`. That placeholder ships in the
held templates on purpose, so it cannot be forgotten quietly. Get the real value
from **App Store Connect → Analytics → Campaigns** (it is the "Provider ID" in
any generated campaign link; same value for every campaign on the account), then:

```bash
cd the-lede-site
grep -rn PROVIDER_ID_TODO templates/          # 2 hits, both in index.aday.template.html
perl -i -pe 's/PROVIDER_ID_TODO/<the real provider id>/g' templates/index.aday.template.html
grep -rn PROVIDER_ID_TODO templates/          # must be 0 hits
```

The `ct=` values are already set and are ours to keep: `site_hero` on the badge,
`site_footer` on the closing link. That is how Campaign analytics tells the two
apart.

**If the provider id is not available in time, delete the whole `?pt=...&ct=...`
query string from both links rather than shipping the placeholder.** A bare
`https://apps.apple.com/app/id6772315315` works perfectly; it just cannot be
attributed. A link with `pt=PROVIDER_ID_TODO` in it is a live broken link.

**2. Nothing else.** The badge asset is committed and correct (see below).

---

## What is held, and where

| Held file | Replaces on flip |
|---|---|
| `content/copy.aday.json` | `content/copy.json` |
| `templates/index.aday.template.html` | `templates/index.template.html` |
| `templates/thanks.aday.template.html` | `templates/thanks.template.html` |
| `llms.aday.txt` | `llms.txt` |
| `app-store-badge.png` | *(new asset, already committed and already staged by `deploy.sh`'s `*.png` glob)* |

`node build.mjs aday` renders the held variant into `aday-preview/` so it can be
looked at any time without touching a single file the deploy uploads.
`aday-preview/` is gitignored and `deploy.sh` stages root `*.html` only, so the
variant physically cannot reach the live site until it is promoted.

**The four hand-authored pages** (`privacy.html`, `support.html`,
`sourcing.html`, `404.html`) are not built from templates, so their footer credit
is a scripted step below rather than a held file.

**The press page** (`press.html` + `press-kit/`, site#6) is NOT held — it deploys
before the flip, because the pitch window opens while the app is still in Pending
Developer Release. It already carries the Apple credit line (do not perl it in
step 3), and it carries two visible release-day placeholders that are filled in
step 4 below. The quota-floor FAQ entry in `support.html` (site#7,
`#allowance-floor`) also rides whatever deploy comes first; it is a
buyer-protective promise and is safe live early.

---

## The flip, in order

Run from the repo root, on `main`, with a clean working tree.

```bash
cd the-lede-site
git pull
```

**1. Look at it one more time.**

```bash
node build.mjs aday
open aday-preview/index.html aday-preview/thanks.html
```

**2. Promote the held copy, templates, and llms.txt.**

```bash
cp content/copy.aday.json          content/copy.json
cp templates/index.aday.template.html  templates/index.template.html
cp templates/thanks.aday.template.html templates/thanks.template.html
cp llms.aday.txt                   llms.txt
```

**3. Add Apple's trademark credit to the four hand-authored pages.** The two
built pages get it from `footer.appleCredit` automatically; these four do not.
The anchor line is byte-identical in all four, verified 2026-08-01.

```bash
perl -i -pe 's{(<p class="disclaimer">Not affiliated with The Lede Company.*?</p>\n)}{$1        <p class="disclaimer">Apple, the Apple logo, iPhone, and App Store are trademarks of Apple Inc., registered in the U.S. and other countries.</p>\n}' \
  privacy.html support.html sourcing.html 404.html

grep -c "trademarks of Apple Inc" privacy.html support.html sourcing.html 404.html   # each must be 1
```

**4. Fill the press page's release-day facts.** `/press` has been live through
the pitch window saying the date and store link arrive on release day. Today is
that day.

```bash
perl -i -pe 's{<span class="press-tocome" data-fill="release-date">To be announced</span> · this page carries the date and the store link on release day\.}{<the release date, e.g. August 21, 2026>}' press.html
perl -i -pe 's{<span class="press-tocome" data-fill="store-link">Live on release day</span>}{<a href="https://apps.apple.com/app/id6772315315">apps.apple.com/app/id6772315315</a>}' press.html
grep -c 'press-tocome' press.html    # must be 0
```

(No `pt=` campaign token on the press page's store link: press coverage is
attributed by its own referrers, and a bare link is what reviewers paste.)

**5. Build the real pages.**

```bash
node build.mjs
```

**6. Verify before deploying.** Every one of these must pass.

```bash
grep -c 'alt="Download on the App Store"' index.html      # 1
grep -c 'app-store-badge.png' index.html                  # 1  (one badge, never two)
grep -rn 'PROVIDER_ID_TODO' index.html                    # 0 hits
grep -rni 'wave\|invite\|waitlist' index.html thanks.html # 0 hits
grep -c 'signup__alert\|id="notify"' index.html           # 0
grep -c 'apple-itunes-app' index.html                     # 1
grep -c 'downloadUrl' index.html                          # 1
grep -c 'trademarks of Apple Inc' index.html thanks.html  # 1 each
grep -c 'brand-case' index.html                           # 1  (keeps App Store's casing)
grep -c 'below what was advertised' support.html          # 1  (the quota-floor sentence, site#7)
grep -c 'press-tocome' press.html                         # 0  (release-day facts filled, step 4)
curl -sI https://apps.apple.com/app/id6772315315 | head -1  # the listing is really live
```

Then open `index.html` and `thanks.html` locally, in both light and dark, and
confirm the badge reads on both. It does today; this is the regression check.

**7. Commit.**

```bash
git add -A
git commit -m "site: A-day — the App Store replaces the launch list"
git push
```

**8. Deploy.** A `git push` is NOT a deploy. This project is Cloudflare Pages
**direct-upload**, so the site changes only when this runs:

```bash
./deploy.sh
```

(It needs 1Password: `op read` pulls the Cloudflare token. Run it from a shell
where `op` is signed in.)

**9. Verify live.**

```bash
for p in / /thanks.html /privacy /support /sourcing /press /press-kit/the-lede-press-kit.zip; do
  curl -sL -o /dev/null -w "$p %{http_code}\n" "https://theledeapp.com$p"
done
curl -s https://theledeapp.com/ | grep -o 'apps.apple.com/app/id[^"]*'
curl -s https://theledeapp.com/llms.txt | grep -i "where to get it"
```

Then load `https://theledeapp.com` on an actual iPhone in Safari and confirm the
Smart App Banner appears at the top. That banner is the one thing that cannot be
verified from a desktop.

**10. Tidy.** Once the flip has shipped and soaked, delete the held files
(`content/copy.aday.json`, `templates/*.aday.template.html`, `llms.aday.txt`),
drop the `aday` branch from `build.mjs`, remove `aday-preview/` from
`.gitignore`, and close the-lede-site#2.

---

## Rolling back

The flip is entirely in git. `git revert <the A-day commit>` then `./deploy.sh`
puts the pre-launch site back. Nothing is destroyed by the promote step, because
the pre-flip content is the previous commit.

---

## What changed, and why, for whoever reviews this

Copy ratified by Charles 2026-08-01.

- **The badge replaces the email form** in the post-hero band. It is an `<img>`,
  never inline SVG: Apple's official SVG carries an internal `<title>` reading
  `Download_on_the_App_Store_Badge_US-UK_RGB_blk_4SVG_092917`, which a screen
  reader announces verbatim as a filename. As an `<img>` the alt text is ours and
  says exactly what Apple requires: **Download on the App Store**.
- **The asset** is `app-store-badge.png`, 359x120 with alpha, exported at 2x from
  Apple's own black US-English badge fetched from
  `https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us`
  on 2026-08-01. It is not re-drawn or re-coloured. The black badge carries its
  own light outline, which is why one file serves both the paper and the dark
  theme. Displayed at 60px tall via `height` + `width: auto`, so the ratio is
  never rounded. PNG, not SVG or AVIF, because `deploy.sh` stages `*.png *.webp`
  and a format outside that glob would silently not ship.
- **The badge never animates.** No `rise` class, no transition. Apple's rules,
  and it would cheapen the one thing on the page that has to look official.
- **The closing band gets a plain text link, not a second badge.** One badge per
  page keeps it a signpost rather than wallpaper.
- **The notes list** sits below the closing band with no panel, no wash, and no
  border: the three things that make the signup band read as "act here". It is
  framed as product notes because the launch is over and scarcity language would
  now be a lie. Same `POST /subscribe` endpoint as before.
- **The thanks page changes job.** It was a waitlist confirmation; now it tells
  someone who was waiting that the wait is over and that the list is closed. Its
  `<title>` became a template slot in the same change, so it no longer has to be
  edited in two places.

## Two things the CTO should decide before flip day

1. **The notes form has no failure feedback.** The four `.signup__alert`
   paragraphs and the foot-of-page script were retired with the signup bands, as
   ratified. But the server still answers a failed `POST /subscribe` with a 303
   to `/?subscribe=invalid#notify` or `/?subscribe=error#notify`, and on the
   A-day page there is no `#notify` anchor and nothing that reads the parameter.
   A failed signup will land silently on the homepage. That is exactly the bug
   the-lede-site#3 fixed in July, reopening on a smaller surface. Either restore
   the alert pair + script scoped to the notes block, or change the server's
   redirect. **Not fixed here, because the fix needs copy nobody has ratified.**
2. **`notes.button` is the one improvised string** in this set: it reads
   `Subscribe`. Everything else on this page is ratified copy. If Charles wants
   another word, it lives in `content/copy.aday.json` under `notes.button`.
