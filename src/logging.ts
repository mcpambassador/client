/**
 * Client logging (TD-007).
 *
 * MCP stdio requires stdout to carry only protocol frames, so console output is routed away from it.
 * Default: stderr (MCP hosts capture it). Opt in to a log file with `--log-file` /
 * `MCP_AMBASSADOR_LOG_FILE`; reduce noise with `--log-level` / `MCP_AMBASSADOR_LOG_LEVEL`.
 */
import { constants, closeSync, fstatSync, openSync, writeSync } from 'node:fs';
import { format, inspect } from 'node:util';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

export interface LoggingOptions {
  /** Append log lines to this file (created with mode 0600) instead of stderr. */
  logFile?: string;
  /** Drop messages below this level (default: debug, i.e. everything, as before). */
  logLevel?: LogLevel;
}

type ConsoleLike = Pick<Console, 'log' | 'info' | 'warn' | 'debug' | 'error'>;

export interface LoggingEnv {
  console?: ConsoleLike;
  writeStderr?: (line: string) => void;
  /** Effective uid used for the file-owner check (default: process.getuid; none on Windows). */
  getuid?: () => number;
}

function renderOne(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  // Errors have no enumerable fields (JSON.stringify gives "{}"); inspect shows name, message and stack.
  if (!(arg instanceof Error)) {
    try {
      const json = JSON.stringify(arg);
      if (json !== undefined) return json;
    } catch {
      // circular, BigInt, ...: fall through to inspect
    }
  }
  return inspect(arg, { depth: 4, breakLength: Infinity });
}

function render(args: unknown[]): string {
  return args.map(renderOne).join(' ');
}

/**
 * Open the log file for append, mode 0600, never following a symlink and never blocking on a FIFO.
 * Refuses anything that is not a regular file, and (POSIX) a file owned by another user. Returns the fd.
 */
function openLogFile(
  path: string,
  warn: (line: string) => void,
  getuid: (() => number) | undefined
): number {
  const fd = openSync(
    path,
    constants.O_WRONLY |
      constants.O_APPEND |
      constants.O_CREAT |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
    0o600
  );
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error('not a regular file');
    if (getuid && st.uid !== getuid()) throw new Error('owned by another user');
    const mode = st.mode & 0o777;
    if (process.platform !== 'win32' && (mode & 0o077) !== 0) {
      warn(
        `[warn] log file ${path} is readable by other users (mode ${mode.toString(8)}); chmod 600 it\n`
      );
    }
  } catch (err) {
    closeSync(fd);
    throw err;
  }
  return fd;
}

/**
 * Route console output. Returns a function that closes the log file (if any).
 *
 * Without a log file everything goes to stderr, exactly as before. With one, log lines go to the file
 * only, except `console.error` (fatal/startup problems), which is also kept on stderr so the host still
 * sees why the process failed. If the file cannot be opened, logging falls back to stderr.
 */
export function configureLogging(options: LoggingOptions = {}, env: LoggingEnv = {}): () => void {
  const target = env.console ?? console;
  const writeStderr = env.writeStderr ?? ((line: string) => void process.stderr.write(line));
  const threshold = LOG_LEVELS.indexOf(options.logLevel ?? 'debug');
  const nativeError = target.error.bind(target);

  let fd: number | undefined;
  if (options.logFile) {
    try {
      fd = openLogFile(options.logFile, writeStderr, env.getuid ?? process.getuid?.bind(process));
    } catch (err) {
      writeStderr(
        `[warn] cannot open log file ${options.logFile} (${(err as Error).message}); logging to stderr\n`
      );
    }
  }

  // stderr keeps the historical `[level] message` format; the file adds an ISO timestamp.
  const sink = (level: LogLevel, text: string): void => {
    if (fd !== undefined) {
      try {
        writeSync(fd, `${new Date().toISOString()} [${level}] ${text}\n`);
        return;
      } catch {
        // fall through to stderr
      }
    }
    writeStderr(`[${level}] ${text}\n`);
  };

  const make =
    (level: LogLevel) =>
    (...args: unknown[]): void => {
      if (LOG_LEVELS.indexOf(level) < threshold) return;
      sink(level, render(args));
    };

  target.log = make('info');
  target.info = make('info');
  target.warn = make('warn');
  target.debug = make('debug');
  if (fd !== undefined) {
    const logged = make('error');
    target.error = (...args: unknown[]): void => {
      logged(...[format(...args)]);
      nativeError(...args);
    };
  }

  return () => {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // already closed
      }
      fd = undefined;
    }
  };
}
