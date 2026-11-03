/**
 * Client logging (TD-007).
 *
 * MCP stdio requires stdout to carry only protocol frames, so console output is routed away from it.
 * Default: stderr (MCP hosts capture it). Opt in to a log file with `--log-file` /
 * `MCP_AMBASSADOR_LOG_FILE`; reduce noise with `--log-level` / `MCP_AMBASSADOR_LOG_LEVEL`.
 */
import { constants, closeSync, fstatSync, openSync, writeSync } from 'node:fs';
import { format } from 'node:util';

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
}

function render(args: unknown[]): string {
  return args
    .map(arg => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/** Open the log file for append, mode 0600, never following a symlink. Returns the fd. */
function openLogFile(path: string, warn: (line: string) => void): number {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollow,
    0o600
  );
  try {
    const mode = fstatSync(fd).mode & 0o777;
    if (process.platform !== 'win32' && (mode & 0o077) !== 0) {
      warn(
        `[warn] log file ${path} is readable by other users (mode ${mode.toString(8)}); chmod 600 it\n`
      );
    }
  } catch {
    // best effort only
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
      fd = openLogFile(options.logFile, writeStderr);
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
