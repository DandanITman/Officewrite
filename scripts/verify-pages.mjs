#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// CNAME is what points officewrite.com at this site: lose it and the custom
// domain silently reverts to the github.io URL on the next deploy.
const required = [
  'docs/index.html',
  'docs/site.css',
  'docs/site.js',
  'docs/logo.png',
  'docs/CNAME',
  'docs/robots.txt',
  'docs/sitemap.xml',
  'docs/llms.txt',
  // Catches every stale URL, including the two article pages folded into the
  // home page. Without it GitHub serves its own generic 404.
  'docs/404.html',
  ...['home', 'templates', 'editor', 'insert', 'references', 'review', 'mailings', 'navigation', 'dark']
    .map((shot) => `docs/shots/${shot}.png`),
];
if (process.argv.includes('--built')) required.push('docs/app/index.html');
let failed = false;

console.log('Checking GitHub Pages site files...\n');

for (const file of required) {
  const path = join(root, file);
  if (existsSync(path)) {
    console.log(`  ok  ${file}`);
  } else {
    console.error(`  missing  ${file}`);
    failed = true;
  }
}

// Check local HTML dependencies, including the generated browser bundle.
for (const file of ['docs/index.html', ...(process.argv.includes('--built') ? ['docs/app/index.html'] : [])]) {
  const pagePath = join(root, file);
  if (!existsSync(pagePath)) continue;
  for (const match of readFileSync(pagePath, 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = match[1].split(/[?#]/)[0];
    if (!reference || /^[a-z][a-z\d+.-]*:|^\/\//i.test(reference)) continue;
    // The app is generated later; source-only checks do not require it.
    if (!process.argv.includes('--built') && reference === 'app/') continue;
    const base = reference.startsWith('/') ? join(root, 'docs') : dirname(pagePath);
    const target = join(base, reference.replace(/^\//, ''));
    if (!existsSync(target)) {
      console.error(`  missing dependency  ${file}: ${reference}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nLocal Pages files look good.');
console.log('\nBefore the first GitHub Pages deploy succeeds, enable Pages once:');
console.log('  1. Open https://github.com/DandanITman/OfficeWrite/settings/pages');
console.log('  2. Build and deployment → Source → GitHub Actions');
console.log('  3. Re-run the "Deploy GitHub Pages" workflow if a prior run failed');
console.log('\nLive site (after deploy): https://officewrite.com/');
console.log('DNS must resolve before merging a CNAME change, or the github.io');
console.log('URL redirects to a domain that is not answering yet.\n');
