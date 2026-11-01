#!/usr/bin/env node
// Fails if src/protocol-types.ts differs from packages/protocol/src/index.ts on
// mcpambassador/server main. Leading "// Source:" header lines are ignored.
// PROTOCOL_SOURCE=<local file or URL> overrides the upstream location.
import { readFileSync } from 'node:fs';

const DEFAULT_URL =
  'https://raw.githubusercontent.com/mcpambassador/server/main/packages/protocol/src/index.ts';
const source = process.env.PROTOCOL_SOURCE || DEFAULT_URL;
const localPath = new URL('../src/protocol-types.ts', import.meta.url);

const normalize = text => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  while (lines.length && lines[0].startsWith('// Source:')) lines.shift();
  return lines.join('\n');
};

let upstream;
if (/^https?:\/\//.test(source)) {
  const res = await fetch(source);
  if (!res.ok) {
    console.error(`check:protocol: failed to fetch ${source}: HTTP ${res.status}`);
    process.exit(2);
  }
  upstream = await res.text();
} else {
  upstream = readFileSync(source, 'utf8');
}

const a = normalize(readFileSync(localPath, 'utf8'));
const b = normalize(upstream);
if (a === b) {
  console.log('check:protocol: src/protocol-types.ts matches upstream.');
  process.exit(0);
}

const al = a.split('\n');
const bl = b.split('\n');
let i = 0;
while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
console.error('check:protocol: DRIFT — src/protocol-types.ts differs from upstream.');
console.error(`First difference at line ${i + 1}:`);
console.error(`  local:    ${al[i] ?? '<EOF>'}`);
console.error(`  upstream: ${bl[i] ?? '<EOF>'}`);
console.error(`Source: ${source}`);
process.exit(1);
