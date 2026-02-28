/**
 * Security Fixes from M16 Review
 * Tests for SEC-M16-F2, SEC-M16-F3, SEC-M16-F4
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AmbassadorClient } from '../index.js';

describe('M16 Security Fixes', () => {
  let consoleWarnSpy: any[] = [];
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    consoleWarnSpy = [];
    originalConsoleWarn = console.warn;
    console.warn = (...args: any[]) => {
      consoleWarnSpy.push(args.join(' '));
    };
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  describe('SEC-M16-F2: HTTPS Scheme Validation', () => {
    it('should accept https:// URLs without warning', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
      });

      expect(consoleWarnSpy.length).toBe(0);
      expect(client).toBeDefined();
    });

    it('should accept http://localhost URLs without warning', () => {
      const client = new AmbassadorClient({
        server_url: 'http://localhost:8443',
        preshared_key: 'amb_pk_test123',
      });

      expect(consoleWarnSpy.length).toBe(0);
      expect(client).toBeDefined();
    });

    it('should accept http://127.0.0.1 URLs without warning', () => {
      const client = new AmbassadorClient({
        server_url: 'http://127.0.0.1:8443',
        preshared_key: 'amb_pk_test123',
      });

      expect(consoleWarnSpy.length).toBe(0);
      expect(client).toBeDefined();
    });

    it('should warn on non-localhost http:// URLs', () => {
      const client = new AmbassadorClient({
        server_url: 'http://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
      });

      expect(client).toBeDefined();
      expect(consoleWarnSpy.length).toBe(1);
      expect(consoleWarnSpy[0]).toContain('insecure HTTP');
      expect(consoleWarnSpy[0]).toContain('HTTPS is strongly recommended');
    });

    it('should reject invalid URL schemes', () => {
      expect(() => {
        new AmbassadorClient({
          server_url: 'ftp://ambassador.internal:8443',
          preshared_key: 'amb_pk_test123',
        });
      }).toThrow('Invalid URL scheme');
    });

    it('should reject malformed URLs', () => {
      expect(() => {
        new AmbassadorClient({
          server_url: 'not-a-url',
          preshared_key: 'amb_pk_test123',
        });
      }).toThrow('Invalid server_url');
    });
  });

  describe('SEC-M16-F4: heartbeat_interval_seconds Bounds', () => {
    it('should clamp heartbeat below minimum to 5 seconds', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
        heartbeat_interval_seconds: 1,
      });

      expect(consoleWarnSpy.length).toBe(1);
      expect(consoleWarnSpy[0]).toContain('below minimum');
      expect(consoleWarnSpy[0]).toContain('Clamping to 5s');
      expect(client['config'].heartbeat_interval_seconds).toBe(5);
    });

    it('should clamp heartbeat above maximum to 300 seconds', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
        heartbeat_interval_seconds: 500,
      });

      expect(consoleWarnSpy.length).toBe(1);
      expect(consoleWarnSpy[0]).toContain('exceeds maximum');
      expect(consoleWarnSpy[0]).toContain('Clamping to 300s');
      expect(client['config'].heartbeat_interval_seconds).toBe(300);
    });

    it('should accept valid heartbeat values without clamping', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
        heartbeat_interval_seconds: 60,
      });

      expect(consoleWarnSpy.length).toBe(0);
      expect(client['config'].heartbeat_interval_seconds).toBe(60);
    });

    it('should use default of 60 seconds when not specified', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
      });

      expect(consoleWarnSpy.length).toBe(0);
      expect(client['config'].heartbeat_interval_seconds).toBe(60);
    });

    it('should accept minimum valid heartbeat of 5 seconds', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
        heartbeat_interval_seconds: 5,
      });

      expect(consoleWarnSpy.length).toBe(0);
      expect(client['config'].heartbeat_interval_seconds).toBe(5);
    });

    it('should accept maximum valid heartbeat of 300 seconds', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
        heartbeat_interval_seconds: 300,
      });

      expect(consoleWarnSpy.length).toBe(0);
      expect(client['config'].heartbeat_interval_seconds).toBe(300);
    });

    it('should prevent tight loop with heartbeat of 0', () => {
      const client = new AmbassadorClient({
        server_url: 'https://ambassador.internal:8443',
        preshared_key: 'amb_pk_test123',
        heartbeat_interval_seconds: 0,
      });

      expect(consoleWarnSpy.length).toBe(1);
      expect(consoleWarnSpy[0]).toContain('below minimum');
      expect(client['config'].heartbeat_interval_seconds).toBe(5);
    });
  });
});
