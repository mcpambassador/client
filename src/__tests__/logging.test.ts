import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureLogging, isLogLevel } from '../logging.js';

function fakeConsole() {
  const native: unknown[][] = [];
  const c = {
    log: (..._a: unknown[]) => {},
    info: (..._a: unknown[]) => {},
    warn: (..._a: unknown[]) => {},
    debug: (..._a: unknown[]) => {},
    error: (...a: unknown[]) => void native.push(a),
  };
  return { c, native };
}

const dir = () => mkdtempSync(join(tmpdir(), 'amb-log-'));

describe('configureLogging (TD-007)', () => {
  it('defaults to stderr in the historical [level] format and leaves console.error alone', () => {
    const { c } = fakeConsole();
    const nativeError = c.error;
    const lines: string[] = [];
    configureLogging({}, { console: c, writeStderr: l => void lines.push(l) });
    c.info('hello', { a: 1 });
    c.warn('careful');
    c.debug('dbg');
    expect(lines).toEqual(['[info] hello {"a":1}\n', '[warn] careful\n', '[debug] dbg\n']);
    expect(c.error).toBe(nativeError);
  });

  it('--log-level drops lower levels', () => {
    const { c } = fakeConsole();
    const lines: string[] = [];
    configureLogging({ logLevel: 'warn' }, { console: c, writeStderr: l => void lines.push(l) });
    c.info('quiet');
    c.log('quiet');
    c.debug('quiet');
    c.warn('shown');
    expect(lines).toEqual(['[warn] shown\n']);
  });

  it('writes to the file only (mode 0600, timestamped), mirrors console.error to stderr', () => {
    const { c, native } = fakeConsole();
    const file = join(dir(), 'client.log');
    const lines: string[] = [];
    const close = configureLogging(
      { logFile: file },
      { console: c, writeStderr: l => void lines.push(l) }
    );
    c.info('to file');
    c.warn('also file');
    c.error('fatal %s', 'thing');
    close();
    expect(lines).toEqual([]);
    expect(native).toEqual([['fatal %s', 'thing']]);
    const text = readFileSync(file, 'utf8').trimEnd().split('\n');
    expect(text).toHaveLength(3);
    expect(text[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z \[info\] to file$/);
    expect(text[2]).toMatch(/\[error\] fatal thing$/);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('appends to an existing file', () => {
    const { c } = fakeConsole();
    const file = join(dir(), 'client.log');
    writeFileSync(file, 'old\n', { mode: 0o600 });
    configureLogging({ logFile: file }, { console: c, writeStderr: () => {} })();
    const close = configureLogging({ logFile: file }, { console: c, writeStderr: () => {} });
    c.info('new');
    close();
    expect(readFileSync(file, 'utf8')).toMatch(/^old\n.* \[info\] new\n$/);
  });

  it.skipIf(process.platform === 'win32')(
    'warns about a group/world-readable existing file',
    () => {
      const { c } = fakeConsole();
      const file = join(dir(), 'client.log');
      writeFileSync(file, '');
      chmodSync(file, 0o644);
      const lines: string[] = [];
      configureLogging({ logFile: file }, { console: c, writeStderr: l => void lines.push(l) })();
      expect(lines.join('')).toMatch(/readable by other users/);
    }
  );

  it.skipIf(process.platform === 'win32')('refuses a symlink and falls back to stderr', () => {
    const { c } = fakeConsole();
    const d = dir();
    const target = join(d, 'target.log');
    writeFileSync(target, '');
    const link = join(d, 'link.log');
    symlinkSync(target, link);
    const lines: string[] = [];
    configureLogging({ logFile: link }, { console: c, writeStderr: l => void lines.push(l) });
    c.info('x');
    expect(lines[0]).toMatch(/cannot open log file/);
    expect(lines[1]).toBe('[info] x\n');
    expect(readFileSync(target, 'utf8')).toBe('');
  });

  it('falls back to stderr when the file cannot be opened', () => {
    const { c } = fakeConsole();
    const lines: string[] = [];
    configureLogging(
      { logFile: join(dir(), 'missing', 'client.log') },
      { console: c, writeStderr: l => void lines.push(l) }
    );
    c.warn('still logged');
    expect(lines[0]).toMatch(/cannot open log file/);
    expect(lines[1]).toBe('[warn] still logged\n');
  });

  it.skipIf(process.platform === 'win32')(
    'refuses a FIFO without blocking and logs to stderr',
    () => {
      const { c } = fakeConsole();
      const fifo = join(dir(), 'pipe.log');
      execFileSync('mkfifo', [fifo]);
      const lines: string[] = [];
      configureLogging({ logFile: fifo }, { console: c, writeStderr: l => void lines.push(l) });
      c.info('x');
      expect(lines[0]).toMatch(/cannot open log file/);
      expect(lines[1]).toBe('[info] x\n');
    }
  );

  it.skipIf(process.platform === 'win32')('refuses a file owned by another user', () => {
    const { c } = fakeConsole();
    const f = join(dir(), 'foreign.log');
    writeFileSync(f, 'keep\n');
    const lines: string[] = [];
    configureLogging(
      { logFile: f },
      {
        console: c,
        writeStderr: l => void lines.push(l),
        getuid: () => (process.getuid?.() ?? 0) + 1,
      }
    );
    c.info('x');
    expect(lines[0]).toMatch(/owned by another user/);
    expect(readFileSync(f, 'utf8')).toBe('keep\n');
  });

  it.skipIf(process.platform === 'win32')(
    'warns, but still logs, to a group/world-readable file',
    () => {
      const { c } = fakeConsole();
      const f = join(dir(), 'open.log');
      writeFileSync(f, '');
      chmodSync(f, 0o644);
      const lines: string[] = [];
      configureLogging({ logFile: f }, { console: c, writeStderr: l => void lines.push(l) });
      c.info('x');
      expect(lines[0]).toMatch(/readable by other users/);
      expect(readFileSync(f, 'utf8')).toMatch(/\[info\] x\n$/);
    }
  );

  it('renders Error objects and circular values without throwing', () => {
    const { c } = fakeConsole();
    const lines: string[] = [];
    configureLogging({}, { console: c, writeStderr: l => void lines.push(l) });
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    c.warn('failed:', new Error('boom'), circ);
    expect(lines[0]).toMatch(/^\[warn\] failed: Error: boom/);
    expect(lines[0]).toMatch(/<ref \*1>/);
  });

  it('isLogLevel', () => {
    expect(isLogLevel('debug')).toBe(true);
    expect(isLogLevel('verbose')).toBe(false);
  });
});
