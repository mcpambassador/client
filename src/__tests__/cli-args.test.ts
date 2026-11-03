import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = join(process.cwd(), 'dist', 'cli.js');
const run = (args: string[]) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { PATH: process.env.PATH },
  });

describe('cli flag handling (TD-007)', () => {
  it.each([
    [['--log-file']],
    [['--log-file', '--log-level', 'warn']],
    [['--log-level=']],
    [['--log-level']],
  ])('rejects a missing or flag-like value: %j', args => {
    const r = run([...args]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/requires a value/);
  });

  it('does not echo JSON.parse text (it can quote key material) for a broken config', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'amb-cfg-')), 'c.json');
    writeFileSync(f, '{"preshared_key": "amb_pk_SECRET", oops}');
    const r = run(['--config', f]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/invalid JSON \(SyntaxError at /);
    expect(r.stderr).not.toMatch(/amb_pk_SECRET|oops/);
  });
});
