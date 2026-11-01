#!/usr/bin/env node
// Verifies src/protocol-types.ts against packages/protocol/src/index.ts of mcpambassador/server.
// Leading "// Source:" header lines are ignored in the comparison.
//   (default)  compare against the SHA pinned in the header
//              "// Source: mcpambassador/server packages/protocol/src/index.ts @ <sha>"  (blocking)
//   --main     compare against server main (advisory: warns when the server moved on)
// PROTOCOL_SOURCE=<local file or URL> overrides the upstream location.
import { readFileSync } from 'node:fs';

const RAW = 'https://raw.githubusercontent.com/mcpambassador/server';
const FILE = 'packages/protocol/src/index.ts';
const localPath = new URL('../src/protocol-types.ts', import.meta.url);
const localText = readFileSync(localPath, 'utf8');

const useMain = process.argv.includes('--main');
let source = process.env.PROTOCOL_SOURCE;
if (!source) {
  if (useMain) {
    source = `${RAW}/main/${FILE}`;
  } else {
    const m = localText.match(/^\/\/ Source:.*@ ([0-9a-f]{7,40})\s*$/m);
    if (!m) {
      console.error(
        'check:protocol: src/protocol-types.ts has no "// Source: ... @ <sha>" header to pin against.'
      );
      process.exit(2);
    }
    source = `${RAW}/${m[1]}/${FILE}`;
  }
}

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

const a = normalize(localText);
const b = normalize(upstream);
if (a === b) {
  console.log('check:protocol: src/protocol-types.ts matches upstream.');
  process.exit(0);
}

const al = a.split('\n');
const bl = b.split('\n');
let i = 0;
while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
console.error(
  `check:protocol: DRIFT — src/protocol-types.ts differs from ${useMain ? 'server main' : 'its pinned source'}.`
);
console.error(`First difference at line ${i + 1}:`);
console.error(`  local:    ${al[i] ?? '<EOF>'}`);
console.error(`  upstream: ${bl[i] ?? '<EOF>'}`);
console.error(`Source: ${source}`);
process.exit(1);
