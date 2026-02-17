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

function parseArgs(): { serverUrl?: string; configPath?: string; allowSelfSigned?: boolean } {
  const args = process.argv.slice(2);
  
  let serverUrl: string | undefined;
  let configPath: string | undefined;
  let allowSelfSigned = false;
  
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
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
MCP Ambassador Client

Usage:
  mcpambassador-client --server <url>
  mcpambassador-client --config <path>
  
Options:
  --server <url>          Ambassador Server URL (e.g., https://ambassador.internal:8443)
  --config <path>         Path to JSON config file
  --allow-self-signed     Allow self-signed TLS certificates (dev/test only)
  --help, -h              Show this help message

Environment Variables:
  HOSTNAME                Used as friendly_name if not specified in config
  
Example:
  mcpambassador-client --server https://ambassador.internal:8443 --allow-self-signed
      `);
      process.exit(0);
    }
  }
  
  return { serverUrl, configPath, allowSelfSigned };
}

async function main(): Promise<void> {
  const { serverUrl, configPath, allowSelfSigned } = parseArgs();
  
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
    config = {
      server_url: serverUrl!,
      friendly_name: process.env.HOSTNAME || 'ambassador-client',
      host_tool: 'custom',
      allow_self_signed: allowSelfSigned,
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
    process.on('SIGINT', async () => {
      console.info('[client] Received SIGINT, shutting down...');
      await client.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.info('[client] Received SIGTERM, shutting down...');
      await client.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('[client] Fatal error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[client] Unhandled error:', error);
  process.exit(1);
});
