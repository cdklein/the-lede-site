// build.mjs — the-lede-site's tiny zero-dependency content build.
//
// Reads templates/*.template.html + content/copy.json, replaces {{dot.path}}
// placeholders with the verbatim strings from copy.json, and writes the
// rendered HTML to the repo root. Root index.html / thanks.html stay
// committed so the site remains servable with no build step at all — this
// script only needs to run when copy actually changes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATES = [
  { template: 'templates/index.template.html', out: 'index.html' },
  { template: 'templates/thanks.template.html', out: 'thanks.html' },
];

const copy = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'content/copy.json'), 'utf8')
);

// Flatten nested copy.json into { 'hero.h1': '...', 'signup.button': '...' }.
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, flatKey, out);
    } else {
      out[flatKey] = String(value);
    }
  }
  return out;
}

const fields = flatten(copy);

for (const { template, out } of TEMPLATES) {
  const templatePath = path.join(__dirname, template);
  const outPath = path.join(__dirname, out);
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

// Re-stamp sitemap.xml <lastmod> per URL from each page file's mtime, so the
// dates can never drift from reality again (they had, by 2026-07-22).
const SITEMAP_PAGES = {
  'https://theledeapp.com/': 'index.html',
  'https://theledeapp.com/support': 'support.html',
  'https://theledeapp.com/privacy': 'privacy.html',
  'https://theledeapp.com/sourcing': 'sourcing.html',
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
