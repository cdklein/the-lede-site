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
