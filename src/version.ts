import { readFileSync } from 'fs';

/** Package version, read from package.json (resolves from both src/ and dist/). */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
