// build.mjs — the-lede-site's tiny zero-dependency content build.
//
// Reads templates/*.template.html + content/copy.json, replaces {{dot.path}}
// placeholders with the verbatim strings from copy.json, and writes the
// rendered HTML to the repo root. Root index.html / thanks.html stay
// committed so the site remains servable with no build step at all — this
// script only needs to run when copy actually changes.
// (The launch-day "aday" variant this build once carried was promoted on
// 2026-09-14 and its branch removed — see ADAY-FLIP.md's tidy step.)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT_DIR = __dirname;

const TEMPLATES = [
  { template: 'templates/index.template.html', out: 'index.html' },
  { template: 'templates/thanks.template.html', out: 'thanks.html' },
];

const copy = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'content/copy.json'), 'utf8')
);

// Flatten nested copy.json into { 'hero.h1': '...', 'signup.button': '...' }.
// Arrays flatten by index, so film.lines[3].words is {{film.lines.3.words}}.
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      flatten(value, flatKey, out);
    } else {
      out[flatKey] = String(value);
    }
  }
  return out;
}

const fields = flatten(copy);

// Generated fields, so the film's words live in one place (copy.json film.lines)
// and the transcript list, the search data's transcript and its description can
// never drift apart. {{@...}} keys exist only here.
const ENTITIES = { rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D', middot: '\u00B7', amp: '&', nbsp: '\u00A0', hellip: '\u2026' };
function plainText(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
      if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : +name.slice(1));
      if (!(name in ENTITIES)) throw new Error(`copy.json: no plain-text form for &${name}; (add it to ENTITIES)`);
      return ENTITIES[name];
    });
}
// For a JSON string inside the JSON-LD block: plain text, JSON-escaped, no quotes.
const jsonText = (html) => JSON.stringify(plainText(html)).slice(1, -1).replaceAll('</', '<\\/');
fields['@film.lines.items'] = copy.film.lines
  .map((l) => `<li><span class="t-words">${l.words}</span> <span class="t-drawing">${l.drawing}</span></li>`)
  .join('\n        ');
fields['@film.lines.text'] = jsonText(copy.film.lines.map((l) => l.words).join(' '));
fields['@hero.sub.text'] = jsonText(copy.hero.sub);

for (const { template, out } of TEMPLATES) {
  const templatePath = path.join(__dirname, template);
  const outPath = path.join(OUT_DIR, out);
  let html = fs.readFileSync(templatePath, 'utf8');

  for (const [key, value] of Object.entries(fields)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }

  const unresolved = html.match(/\{\{[^}]+\}\}/g);
  if (unresolved) {
    throw new Error(`${template}: unresolved placeholders: ${unresolved.join(', ')}`);
  }

  fs.writeFileSync(outPath, html);
  console.log(`built ${out}`);
}

// Stamp every root page's stylesheet link with a content hash.
//
// Why this exists: Cloudflare serves styles.css with `max-age=14400` while the
// HTML is `max-age=0, must-revalidate`. A deploy therefore gave returning
// visitors FRESH HTML against a FOUR-HOUR-STALE STYLESHEET — new markup with
// none of its rules. On 2026-07-24 that shipped a homepage where the device
// screenshot rendered at its intrinsic 700px and blew the mobile layout apart,
// the theme toggle fell back to iOS's default grey button, and the hero claim
// collided with the specimen. The HTML is always revalidated, so a hash in the
// href guarantees the matching CSS is fetched — no cache purge needed, and the
// two can never desync again.
const cssPath = path.join(__dirname, 'styles.css');
const cssHash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(cssPath))
  .digest('hex')
  .slice(0, 8);

const PAGES = fs
  .readdirSync(OUT_DIR)
  .filter((f) => f.endsWith('.html') && f !== 'og-card-source.html');

for (const page of PAGES) {
  const pagePath = path.join(OUT_DIR, page);
  const before = fs.readFileSync(pagePath, 'utf8');
  const after = before.replace(
    /href="styles\.css(?:\?v=[a-f0-9]+)?"/g,
    `href="styles.css?v=${cssHash}"`
  );
  if (after !== before) {
    fs.writeFileSync(pagePath, after);
    console.log(`stamped ${page} -> styles.css?v=${cssHash}`);
  }
}

// Re-stamp sitemap.xml <lastmod> per URL from each page file's mtime, so the
// dates can never drift from reality again (they had, by 2026-07-22).
const SITEMAP_PAGES = {
  'https://theledeapp.com/': 'index.html',
  'https://theledeapp.com/support': 'support.html',
  'https://theledeapp.com/privacy': 'privacy.html',
  'https://theledeapp.com/sourcing': 'sourcing.html',
  'https://theledeapp.com/press': 'press.html',
};
const sitemapPath = path.join(__dirname, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
for (const [url, file] of Object.entries(SITEMAP_PAGES)) {
  const mtime = fs.statSync(path.join(__dirname, file)).mtime.toISOString().slice(0, 10);
  sitemap = sitemap.replace(
    new RegExp(`(<loc>${url.replaceAll('/', '\\/')}</loc>\\s*<lastmod>)[^<]+(</lastmod>)`),
    `$1${mtime}$2`
  );
}
fs.writeFileSync(sitemapPath, sitemap);
console.log('stamped sitemap.xml lastmod from page mtimes');
