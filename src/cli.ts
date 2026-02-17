#!/usr/bin/env node
/**
 * Ambassador Client CLI
 * 
 * Command-line interface for running the Ambassador Client.
 * 
 * Usage:
 *   mcpambassador-client --server https://ambassador.internal:8443
 *   mcpambassador-client --config ./config.yaml
 */

import { AmbassadorClient, type ClientConfig } from './index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse command-line arguments
  const serverUrl = args.find(arg => arg.startsWith('--server='))?.split('=')[1];
  const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1];
  
  if (!serverUrl && !configPath) {
    console.error('Usage: mcpambassador-client --server <url> or --config <path>');
    process.exit(1);
  }
  
  // Load configuration
  const config: ClientConfig = {
    server_url: serverUrl || '',
    friendly_name: process.env.HOSTNAME || 'ambassador-client',
    host_tool: 'custom',
  };
  
  // Create and start client
  const client = new AmbassadorClient(config);
  
  console.info(`[client] Starting Ambassador Client...`);
  console.info(`[client] Server: ${config.server_url}`);
  console.info(`[client] Friendly name: ${config.friendly_name}`);
  
  try {
    // Register with server (or load existing credentials)
    await client.register();
    console.info('[client] Registration successful');
    
    // Start MCP server
    await client.start();
    console.info('[client] MCP server started');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.info('[client] Shutting down...');
      await client.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.info('[client] Shutting down...');
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
