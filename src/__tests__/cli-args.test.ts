import { describe, it, expect } from 'vitest';
import { describeConfigError, flagValue } from '../cli-args.js';

const fail = (m: string): never => {
  throw new Error(m);
};

describe('flagValue (TD-007)', () => {
  it('returns a normal value', () => {
    expect(flagValue('--log-file', '/tmp/x.log', fail)).toBe('/tmp/x.log');
  });
  it.each([undefined, '', '--log-level'])('rejects %j', v => {
    expect(() => flagValue('--log-file', v, fail)).toThrow('--log-file requires a value');
  });
});

describe('describeConfigError (TD-007)', () => {
  it('never echoes JSON.parse text, which can quote key material', () => {
    let err: unknown;
    try {
      JSON.parse('{"preshared_key": "amb_pk_SECRET", oops}');
    } catch (e) {
      err = e;
    }
    const out = describeConfigError(err);
    expect(out).toMatch(/^invalid JSON \(SyntaxError at /);
    expect(out).not.toMatch(/amb_pk_SECRET|oops/);
  });
  it('reports name and code for other errors', () => {
    const e = Object.assign(new Error('ENOENT: no such file /secret/path'), { code: 'ENOENT' });
    expect(describeConfigError(e)).toBe('Error ENOENT');
  });
});
