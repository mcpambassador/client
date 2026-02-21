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

function parseArgs(): { serverUrl?: string; configPath?: string; allowSelfSigned?: boolean; heartbeatInterval?: number; cacheTtl?: number } {
  const args = process.argv.slice(2);

  let serverUrl: string | undefined;
  let configPath: string | undefined;
  let allowSelfSigned = false;
  let heartbeatInterval: number | undefined;
  let cacheTtl: number | undefined;

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
        heartbeatInterval = parseInt(value, 10);
      }
    } else if (arg?.startsWith('--heartbeat-interval=')) {
      const value = arg.split('=')[1];
      if (value) {
        heartbeatInterval = parseInt(value, 10);
      }
    } else if (arg === '--cache-ttl') {
      const value = args[++i];
      if (value) {
        cacheTtl = parseInt(value, 10);
      }
    } else if (arg?.startsWith('--cache-ttl=')) {
      const value = arg.split('=')[1];
      if (value) {
        cacheTtl = parseInt(value, 10);
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
MCP Ambassador Client

Usage:
  mcpambassador-client --server <url>
  mcpambassador-client --config <path>
  
Options:
  --server <url>              Ambassador Server URL (e.g., https://ambassador.internal:8443)
  --config <path>             Path to JSON config file
  --allow-self-signed         Allow self-signed TLS certificates (dev/test only)
  --heartbeat-interval <sec>  Heartbeat interval in seconds (default: 60)
  --cache-ttl <sec>           Tool catalog cache TTL in seconds (default: 60)
  --help, -h                  Show this help message

Environment Variables:
  MCP_AMBASSADOR_URL                  Ambassador Server URL (alternative to --server)
  MCP_AMBASSADOR_PRESHARED_KEY        Preshared key for authentication (REQUIRED)
  MCP_AMBASSADOR_ALLOW_SELF_SIGNED    Set to "true" to allow self-signed certs
  MCP_AMBASSADOR_HOST_TOOL            Host tool identifier (default: vscode)
  MCP_AMBASSADOR_HEARTBEAT_INTERVAL   Heartbeat interval in seconds (default: 60)
  MCP_AMBASSADOR_CACHE_TTL            Tool catalog cache TTL in seconds (default: 60)
  HOSTNAME                            Used as friendly_name if not specified
  
Config File Format (JSON):
  {
    "server_url": "https://ambassador.internal:8443",
    "preshared_key": "amb_pk_...",
    "friendly_name": "my-workstation",
    "host_tool": "vscode",
    "heartbeat_interval_seconds": 60
  }

Example:
  mcpambassador-client --server https://ambassador.internal:8443 --allow-self-signed
      `);
      process.exit(0);
    }
  }

  return { serverUrl, configPath, allowSelfSigned, heartbeatInterval, cacheTtl };
}

async function main(): Promise<void> {
  const { serverUrl: argServerUrl, configPath, allowSelfSigned: argAllowSelfSigned, heartbeatInterval: argHeartbeatInterval, cacheTtl: argCacheTtl } = parseArgs();

  // Fall back to environment variables if no CLI args provided
  const serverUrl = argServerUrl || process.env.MCP_AMBASSADOR_URL;
  const presharedKey = process.env.MCP_AMBASSADOR_PRESHARED_KEY;
  const allowSelfSigned = argAllowSelfSigned || process.env.MCP_AMBASSADOR_ALLOW_SELF_SIGNED === 'true';
  const heartbeatInterval = argHeartbeatInterval || 
    (process.env.MCP_AMBASSADOR_HEARTBEAT_INTERVAL ? parseInt(process.env.MCP_AMBASSADOR_HEARTBEAT_INTERVAL, 10) : undefined);
  const cacheTtl = argCacheTtl ||
    (process.env.MCP_AMBASSADOR_CACHE_TTL ? parseInt(process.env.MCP_AMBASSADOR_CACHE_TTL, 10) : undefined);

  if (!serverUrl && !configPath) {
    console.error('Error: Either --server or --config must be provided');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Load configuration
  let config: ClientConfig;

  if (configPath) {
    try {
      const configFile = readFileSync(configPath, 'utf-8');
      config = JSON.parse(configFile);
      console.info(`[client] Loaded config from ${configPath}`);
    } catch (error) {
      console.error(`[client] Failed to load config file: ${error}`);
      process.exit(1);
    }
  } else {
    if (!presharedKey) {
      console.error('Error: MCP_AMBASSADOR_PRESHARED_KEY environment variable is required');
      console.error('Run with --help for usage information');
      process.exit(1);
    }

    config = {
      server_url: serverUrl!,
      preshared_key: presharedKey,
      friendly_name: process.env.HOSTNAME || undefined,
      host_tool: process.env.MCP_AMBASSADOR_HOST_TOOL || undefined,
      allow_self_signed: allowSelfSigned,
      heartbeat_interval_seconds: heartbeatInterval,
      cache_ttl_seconds: cacheTtl,
    };
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
