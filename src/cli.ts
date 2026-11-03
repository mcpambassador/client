#!/usr/bin/env node
/**
 * Ambassador Client CLI
 *
 * Command-line interface for running the Ambassador Client.
 *
 * Usage:
 *   mcpambassador-client --server https://ambassador.internal:8443
 *   mcpambassador-client --config ./config.json
 *   mcpambassador-client --server https://localhost:8443 --allow-self-signed
 */

import { readFileSync } from 'fs';
import { AmbassadorClient, type ClientConfig } from './index.js';
import { VERSION } from './version.js';
import { HOST_TOOLS, isHostTool } from './host-tools.js';
import { LOG_LEVELS, configureLogging, isLogLevel, type LogLevel } from './logging.js';

/** A flag's value must be present and not another flag. */
function flagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    console.error(`${flag} requires a value`);
    process.exit(1);
  }
  return value;
}

/** Describe a config load failure without echoing JSON.parse text, which can quote key material. */
function describeConfigError(error: unknown): string {
  if (error instanceof SyntaxError) {
    const msg = error.message;
    const where =
      /line (\d+) column (\d+)/.exec(msg)?.[0] ??
      /position (\d+)/.exec(msg)?.[0] ??
      'unknown position';
    return `invalid JSON (SyntaxError at ${where})`;
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return `${(error as Error | undefined)?.name ?? 'Error'}${code ? ` ${code}` : ''}`;
}

function parseArgs(): {
  serverUrl?: string;
  configPath?: string;
  allowSelfSigned?: boolean;
  heartbeatInterval?: number;
  cacheTtl?: number;
  logFile?: string;
  logLevel?: string;
} {
  const args = process.argv.slice(2);

  let serverUrl: string | undefined;
  let configPath: string | undefined;
  let allowSelfSigned = false;
  let heartbeatInterval: number | undefined;
  let cacheTtl: number | undefined;
  let logFile: string | undefined;
  let logLevel: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--server') {
      serverUrl = args[++i];
    } else if (arg?.startsWith('--server=')) {
      serverUrl = arg.split('=')[1];
    } else if (arg === '--config') {
      configPath = args[++i];
    } else if (arg?.startsWith('--config=')) {
      configPath = arg.split('=')[1];
    } else if (arg === '--allow-self-signed') {
      allowSelfSigned = true;
    } else if (arg === '--heartbeat-interval') {
      const value = args[++i];
      if (value) {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          console.error(`--heartbeat-interval must be a whole number, got: "${value}"`);
          process.exit(1);
        }
        heartbeatInterval = parsed;
      }
    } else if (arg?.startsWith('--heartbeat-interval=')) {
      const value = arg.split('=')[1];
      if (value) {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          console.error(`--heartbeat-interval must be a whole number, got: "${value}"`);
          process.exit(1);
        }
        heartbeatInterval = parsed;
      }
    } else if (arg === '--cache-ttl') {
      const value = args[++i];
      if (value) {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          console.error(`--cache-ttl must be a whole number, got: "${value}"`);
          process.exit(1);
        }
        cacheTtl = parsed;
      }
    } else if (arg?.startsWith('--cache-ttl=')) {
      const value = arg.split('=')[1];
      if (value) {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          console.error(`--cache-ttl must be a whole number, got: "${value}"`);
          process.exit(1);
        }
        cacheTtl = parsed;
      }
    } else if (arg === '--log-file') {
      logFile = flagValue('--log-file', args[++i]);
    } else if (arg?.startsWith('--log-file=')) {
      logFile = flagValue('--log-file', arg.slice('--log-file='.length));
    } else if (arg === '--log-level') {
      logLevel = flagValue('--log-level', args[++i]);
    } else if (arg?.startsWith('--log-level=')) {
      logLevel = flagValue('--log-level', arg.slice('--log-level='.length));
    } else if (arg === '--version' || arg === '-v') {
      process.stdout.write(`mcpambassador-client ${VERSION}\n`);
      process.exit(0);
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`
MCP Ambassador Client

Usage:
  mcpambassador-client --server <url>
  mcpambassador-client --config <path>

Options:
  --server <url>              Ambassador Server URL (e.g., https://ambassador.internal:8443)
  --config <path>             Path to JSON config file
  --allow-self-signed         Allow self-signed TLS certificates (dev/test only)
   --heartbeat-interval <sec>  Heartbeat interval in seconds (default: 120, min: 15, max: 300)
   --cache-ttl <sec>           Tool catalog cache TTL in seconds (default: 300, 0 to disable)
  --log-file <path>           Append logs to this file (mode 0600) instead of stderr
  --log-level <level>         debug, info, warn or error (default: debug = everything)
  --version, -v               Show version number
  --help, -h                  Show this help message

Environment Variables:
  MCP_AMBASSADOR_URL                  Ambassador Server URL (alternative to --server)
  MCP_AMBASSADOR_PRESHARED_KEY        Preshared key for authentication (REQUIRED)
  MCP_AMBASSADOR_ALLOW_SELF_SIGNED    Set to "true" to allow self-signed certs
  MCP_AMBASSADOR_HOST_TOOL            Host tool identifier (default: vscode)
   MCP_AMBASSADOR_HEARTBEAT_INTERVAL   Heartbeat interval in seconds (default: 120)
   MCP_AMBASSADOR_CACHE_TTL            Tool catalog cache TTL in seconds (default: 300)
   MCP_AMBASSADOR_DISABLE_CACHE        Disable client tool cache (default: false, cache is enabled)
  MCP_AMBASSADOR_LOG_FILE             Append logs to this file instead of stderr (alternative to --log-file)
  MCP_AMBASSADOR_LOG_LEVEL            debug, info, warn or error (default: debug = everything)
  HOSTNAME                            Used as friendly_name if not specified

Config File Format (JSON):
  {
    "server_url": "https://ambassador.internal:8443",
    "preshared_key": "amb_pk_...",
    "friendly_name": "my-workstation",
    "host_tool": "vscode",
   "heartbeat_interval_seconds": 120,
    "cache_ttl_seconds": 300,
    "disable_cache": false,
    "allow_self_signed": false
  }

  Required: server_url, preshared_key. All other fields are optional.

Example:
  mcpambassador-client --server https://ambassador.internal:8443 --allow-self-signed
\n`);
      process.exit(0);
    }
  }

  return { serverUrl, configPath, allowSelfSigned, heartbeatInterval, cacheTtl, logFile, logLevel };
}

async function main(): Promise<void> {
  const {
    serverUrl: argServerUrl,
    configPath,
    allowSelfSigned: argAllowSelfSigned,
    heartbeatInterval: argHeartbeatInterval,
    cacheTtl: argCacheTtl,
    logFile: argLogFile,
    logLevel: argLogLevel,
  } = parseArgs();

  // MCP stdio requires stdout to carry only protocol frames. Logs go to stderr by default,
  // or to a file when --log-file / MCP_AMBASSADOR_LOG_FILE is set (TD-007).
  const logLevel = argLogLevel ?? process.env.MCP_AMBASSADOR_LOG_LEVEL;
  if (logLevel !== undefined && !isLogLevel(logLevel)) {
    console.error(`--log-level must be one of ${LOG_LEVELS.join(', ')}, got: "${logLevel}"`);
    process.exit(1);
  }
  configureLogging({
    logFile: argLogFile || process.env.MCP_AMBASSADOR_LOG_FILE || undefined,
    logLevel: logLevel as LogLevel | undefined,
  });

  // Fall back to environment variables if no CLI args provided
  const serverUrl = argServerUrl || process.env.MCP_AMBASSADOR_URL;
  const presharedKey = process.env.MCP_AMBASSADOR_PRESHARED_KEY;
  const allowSelfSigned =
    argAllowSelfSigned || process.env.MCP_AMBASSADOR_ALLOW_SELF_SIGNED === 'true';
  const heartbeatInterval =
    argHeartbeatInterval ||
    (process.env.MCP_AMBASSADOR_HEARTBEAT_INTERVAL
      ? parseInt(process.env.MCP_AMBASSADOR_HEARTBEAT_INTERVAL, 10)
      : undefined);
  const cacheTtl =
    argCacheTtl ||
    (process.env.MCP_AMBASSADOR_CACHE_TTL
      ? parseInt(process.env.MCP_AMBASSADOR_CACHE_TTL, 10)
      : undefined);
  const disableCache =
    process.env.MCP_AMBASSADOR_DISABLE_CACHE !== undefined
      ? process.env.MCP_AMBASSADOR_DISABLE_CACHE === 'true'
      : undefined;

  if (!serverUrl && !configPath) {
    console.error('Either --server or --config must be provided');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Load configuration
  let config: ClientConfig;

  if (configPath) {
    try {
      const configFile = readFileSync(configPath, 'utf-8');
      config = JSON.parse(configFile);
      if (!config.server_url) {
        console.error(`Config file "${configPath}" is missing required field: server_url`);
        process.exit(1);
      }
      if (!config.preshared_key) {
        console.error(`Config file "${configPath}" is missing required field: preshared_key`);
        process.exit(1);
      }
      console.info(`[client] Loaded config from ${configPath}`);
    } catch (error) {
      console.error(`[client] Failed to load config file: ${describeConfigError(error)}`);
      process.exit(1);
    }
  } else {
    if (!presharedKey) {
      console.error('MCP_AMBASSADOR_PRESHARED_KEY environment variable is required');
      console.error('Run with --help for usage information');
      process.exit(1);
    }

    config = {
      server_url: serverUrl!,
      preshared_key: presharedKey,
      friendly_name: process.env.HOSTNAME || undefined,
      host_tool: (process.env.MCP_AMBASSADOR_HOST_TOOL as ClientConfig['host_tool']) || undefined, // server validates the enum
      allow_self_signed: allowSelfSigned,
      heartbeat_interval_seconds: heartbeatInterval,
      cache_ttl_seconds: cacheTtl,
      disable_cache: disableCache,
    };
  }

  if (config.host_tool !== undefined && !isHostTool(config.host_tool)) {
    console.error(
      `[client] Invalid host_tool "${String(config.host_tool)}". Valid values: ${HOST_TOOLS.join(', ')}`
    );
    process.exit(1);
  }

  // Create and initialize client
  const client = new AmbassadorClient(config);

  console.info('[client] Starting Ambassador Client...');
  console.info(`[client] Server: ${config.server_url}`);
  console.info(`[client] Friendly name: ${config.friendly_name}`);

  try {
    // Register with server (or load existing credentials)
    await client.register();
    console.info('[client] Registration successful');

    // Start MCP server
    await client.start();
    console.info('[client] MCP server started (listening on stdio)');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.info('[client] Received SIGINT, shutting down...');
      void client.stop().then(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      console.info('[client] Received SIGTERM, shutting down...');
      void client.stop().then(() => process.exit(0));
    });
  } catch (error) {
    console.error('[client] Fatal error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('[client] Unhandled error:', error);
  process.exit(1);
});
