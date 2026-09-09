#!/usr/bin/env node
/** Generate release notes from the exact version's canonical changelog section. */
import { readFileSync, writeFileSync } from 'node:fs';

function main() {
  const args = process.argv.slice(2);
  let version;
  let outputPath;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--output') {
      outputPath = args.shift();
      if (!outputPath || outputPath.startsWith('--')) throw new Error('--output requires a file path.');
    } else if (!version && !argument.startsWith('--')) {
      version = argument.replace(/^v/, '');
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }
  version ??= JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid version: ${version}`);

  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\].*$/gm)];
  const index = sections.findIndex((section) => section[1] === version);
  if (index < 0) throw new Error(`CHANGELOG.md has no [${version}] release section. Move the release's Unreleased entries into it first.`);
  const heading = sections[index];
  const notes = changelog.slice(heading.index + heading[0].length, sections[index + 1]?.index).trim();
  if (!notes) throw new Error(`CHANGELOG.md has an empty [${version}] release section.`);

  const body = [
    `# Officewrite v${version}`,
    '',
    notes,
    '',
    '## Downloads and source',
    '',
    '- The Windows installer is attached to this release.',
    `- [Source and changelog](https://github.com/DandanITman/OfficeWrite/tree/v${version})`,
    '- [Project website](https://officewrite.com/)',
    '',
  ].join('\n');

  if (outputPath) {
    writeFileSync(outputPath, body, 'utf8');
    console.log(`Wrote release notes to ${outputPath}`);
  } else {
    console.log(body);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
