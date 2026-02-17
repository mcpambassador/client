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

  // M6.6: Tests for implemented features
  it('should return cached credentials if already registered', async () => {
    const client = new AmbassadorClient({
      server_url: 'https://ambassador.internal:8443',
      friendly_name: 'test-client',
      host_tool: 'test',
      client_id: 'existing-client-id',
      api_key: 'existing-api-key',
    });

    const response = await client.register();
    expect(response.client_id).toBe('existing-client-id');
    expect(response.status).toBe('active');
  });
});
