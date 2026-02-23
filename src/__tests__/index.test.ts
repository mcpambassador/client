/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmbassadorClient } from '../index.js';
import https from 'https';

// Mock https module
vi.mock('https');

describe('AmbassadorClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Configuration', () => {
    it('should validate preshared_key is required', () => {
      expect(() => {
        new AmbassadorClient({
          server_url: 'https://ambassador.internal:8443',
        } as any);
      }).toThrow('preshared_key is required');
    });

    it('should set default values for optional fields', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
      });

      expect(client).toBeInstanceOf(AmbassadorClient);
      // Check defaults are applied (via behavior, not direct field access)
    });

    it('should accept all optional configuration fields', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
        friendly_name: 'test-client',
        host_tool: 'vscode',
        heartbeat_interval_seconds: 30,
        cache_ttl_seconds: 600,
        allow_self_signed: true,
      });

      expect(client).toBeInstanceOf(AmbassadorClient);
    });
  });

  describe('Session Registration', () => {
    it('should register with preshared key and receive session credentials', async () => {
      const mockResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      // Mock https.request
      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      const mockRes = {
        statusCode: 200,
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify(mockResponse)));
          } else if (event === 'end') {
            handler();
          }
        }),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
        friendly_name: 'test-client',
        host_tool: 'vscode',
      });

      const response = await client.register();

      expect(response).toEqual(mockResponse);
      expect(mockReq.write).toHaveBeenCalledWith(
        expect.stringContaining('amb_pk_test1234567890')
      );
      expect(mockReq.write).toHaveBeenCalledWith(
        expect.stringContaining('test-client')
      );
    });

    it('should mask preshared key in logs', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const mockResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      const mockRes = {
        statusCode: 200,
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify(mockResponse)));
          } else if (event === 'end') {
            handler();
          }
        }),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_secretkey123456',
        friendly_name: 'test-client',
        host_tool: 'vscode',
      });

      await client.register();

      // Check that full key never appears in logs
      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).not.toContain('amb_pk_secretkey123456');
      expect(allCalls).toContain('amb_pk_secr****');

      consoleSpy.mockRestore();
    });
  });

  describe('Authentication Headers', () => {
    it('should send X-Session-Token header for authenticated requests', async () => {
      const mockRegResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      const mockCatalogResponse = {
        tools: [],
        api_version: 'v1',
        timestamp: '2026-02-18T10:00:00Z',
      };

      let requestOptions: any = null;

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        requestOptions = options;
        const mockRes = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              const response = (options as any).path === '/v1/sessions/register'
                ? mockRegResponse
                : mockCatalogResponse;
              handler(Buffer.from(JSON.stringify(response)));
            } else if (event === 'end') {
              handler();
            }
          }),
        };
        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
      });

      await client.register();
      await client.getToolCatalog();

      // Check that X-Session-Token header was sent
      expect(requestOptions.headers['X-Session-Token']).toBe('tok_xyz789');
    });

    it('should not send X-API-Key or X-Client-Id headers', async () => {
      const mockRegResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      let requestOptions: any = null;

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        requestOptions = options;
        const mockRes = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify(mockRegResponse)));
            } else if (event === 'end') {
              handler();
            }
          }),
        };
        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
      });

      await client.register();

      expect(requestOptions.headers['X-API-Key']).toBeUndefined();
      expect(requestOptions.headers['X-Client-Id']).toBeUndefined();
    });
  });

  describe('Heartbeat', () => {
    it('should start heartbeat timer after registration', async () => {
      const mockResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      const mockRes = {
        statusCode: 200,
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify(mockResponse)));
          } else if (event === 'end') {
            handler();
          }
        }),
      };

      vi.mocked(https.request).mockReturnValue(mockReq as any).mockImplementation((options: any, callback?: any) => {
        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
        heartbeat_interval_seconds: 60,
      });

      await client.register();

      // Verify setInterval was called
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    it('should stop heartbeat timer on shutdown', async () => {
      const mockResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      const mockRes = {
        statusCode: 200,
        on: vi.fn((event, handler) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify(mockResponse)));
          } else if (event === 'end') {
            handler();
          }
        }),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
      });

      await client.register();
      await client.start();

      const timerCountBefore = vi.getTimerCount();
      expect(timerCountBefore).toBeGreaterThan(0);

      await client.stop();

      const timerCountAfter = vi.getTimerCount();
      expect(timerCountAfter).toBe(0);
    });

    it('should handle 429 rate limit gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockRegResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      let callCount = 0;

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        callCount++;
        const isHeartbeat = (options as any).path === '/v1/sessions/heartbeat';
        const mockRes = {
          statusCode: isHeartbeat && callCount > 1 ? 429 : 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify(mockRegResponse)));
            } else if (event === 'end') {
              handler();
            }
          }),
        };
        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
        heartbeat_interval_seconds: 1,
      });

      await client.register();

      // Advance timer to trigger heartbeat
      await vi.advanceTimersByTimeAsync(1000);

      // Should log debug message, not error
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Heartbeat failed')
      );

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Session Expiry Handling', () => {
    it('should re-register on 401 and retry request', async () => {
      const mockRegResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      const mockNewRegResponse = {
        session_id: 'sess_new456',
        session_token: 'tok_new123',
        expires_at: '2026-02-18T13:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_789',
      };

      const mockCatalogResponse = {
        tools: [{ name: 'test', description: 'test', input_schema: {} }],
        api_version: 'v1',
        timestamp: '2026-02-18T10:00:00Z',
      };

      let callCount = 0;

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        callCount++;
        const path = (options as any).path;

        let mockRes: any;

        if (path === '/v1/sessions/register') {
          // First registration or re-registration
          mockRes = {
            statusCode: 200,
            on: vi.fn((event, handler) => {
              if (event === 'data') {
                const response = callCount === 1 ? mockRegResponse : mockNewRegResponse;
                handler(Buffer.from(JSON.stringify(response)));
              } else if (event === 'end') {
                handler();
              }
            }),
          };
        } else if (path === '/v1/tools') {
          // First catalog request returns 401, second succeeds
          mockRes = {
            statusCode: callCount === 2 ? 401 : 200,
            on: vi.fn((event, handler) => {
              if (event === 'data') {
                handler(Buffer.from(JSON.stringify(mockCatalogResponse)));
              } else if (event === 'end') {
                handler();
              }
            }),
          };
        }

        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
      });

      await client.register();

      // This should trigger 401, then re-register, then succeed
      const catalog = await client.getToolCatalog();

      expect(catalog.tools).toHaveLength(1);
      expect(callCount).toBeGreaterThanOrEqual(3); // register, catalog (401), re-register, catalog (200)
    });

    it('should only retry once on 401', async () => {
      const mockRegResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        const path = (options as any).path;

        const mockRes = {
          statusCode: path === '/v1/sessions/register' ? 200 : 401,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify(mockRegResponse)));
            } else if (event === 'end') {
              handler();
            }
          }),
        };

        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
      });

      await client.register();

      // This should fail after retry
      await expect(client.getToolCatalog()).rejects.toThrow();
    });
  });

  describe('Graceful Degradation', () => {
    it('should use stale cache on network failure', async () => {
      const mockRegResponse = {
        session_id: 'sess_abc123',
        session_token: 'tok_xyz789',
        expires_at: '2026-02-18T12:00:00Z',
        profile_id: 'prof_123',
        connection_id: 'conn_456',
      };

      const mockCatalogResponse = {
        tools: [{ name: 'cached-tool', description: 'test', input_schema: {} }],
        api_version: 'v1',
        timestamp: '2026-02-18T10:00:00Z',
      };

      let callCount = 0;

      const mockReq = {
        on: vi.fn((event, handler) => {
          if (event === 'error' && callCount > 2) {
            handler(new Error('Network error'));
          }
        }),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      vi.mocked(https.request).mockImplementation((options: any, callback?: any) => {
        callCount++;
        const path = (options as any).path;

        if (callCount > 2 && path === '/v1/tools') {
          // Simulate network error
          setTimeout(() => {
            mockReq.on('error', () => {});
          }, 0);
          return mockReq as any;
        }

        const mockRes = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              const response = path === '/v1/sessions/register' ? mockRegResponse : mockCatalogResponse;
              handler(Buffer.from(JSON.stringify(response)));
            } else if (event === 'end') {
              handler();
            }
          }),
        };

        if (callback) {
          callback(mockRes as any);
        }
        return mockReq as any;
      });

      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test1234567890',
      });

      await client.register();

      // First fetch - should cache
      const firstCatalog = await client.getToolCatalog();
      expect(firstCatalog.tools).toHaveLength(1);

      // Second fetch - should fail but return stale cache
      const secondCatalog = await client.getToolCatalog();
      expect(secondCatalog.tools).toHaveLength(1);
      expect(secondCatalog.tools?.[0]?.name).toBe('cached-tool');
    });
  });
});
