import { describe, it, expect } from 'vitest';
import { AmbassadorClient } from '../index.js';

describe('AmbassadorClient', () => {
  it('should create client instance', () => {
    const client = new AmbassadorClient({
      server_url: 'https://ambassador.internal:8443',
      friendly_name: 'test-client',
      host_tool: 'test',
    });
    
    expect(client).toBeInstanceOf(AmbassadorClient);
  });
  
  it('should throw error on register() - not implemented yet', async () => {
    const client = new AmbassadorClient({
      server_url: 'https://ambassador.internal:8443',
      friendly_name: 'test-client',
      host_tool: 'test',
    });
    
    await expect(client.register()).rejects.toThrow('not implemented');
  });
  
  it('should throw error on getToolCatalog() - not implemented yet', async () => {
    const client = new AmbassadorClient({
      server_url: 'https://ambassador.internal:8443',
      friendly_name: 'test-client',
      host_tool: 'test',
    });
    
    await expect(client.getToolCatalog()).rejects.toThrow('not implemented');
  });
  
  it('should throw error on invokeTool() - not implemented yet', async () => {
    const client = new AmbassadorClient({
      server_url: 'https://ambassador.internal:8443',
      friendly_name: 'test-client',
      host_tool: 'test',
    });
    
    await expect(client.invokeTool({
      client_id: 'test',
      tool_name: 'test_tool',
      arguments: {},
    })).rejects.toThrow('not implemented');
  });
});
