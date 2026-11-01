import { describe, it, expect, expectTypeOf } from 'vitest';
import { HOST_TOOLS, isHostTool, assertHostTool } from '../host-tools.js';
import type { HostTool } from '../protocol-types.js';

describe('host_tool validation', () => {
  it('HOST_TOOLS and the HostTool union stay in sync (type level)', () => {
    expectTypeOf<(typeof HOST_TOOLS)[number]>().toEqualTypeOf<HostTool>();
  });

  it('accepts every listed value', () => {
    for (const t of HOST_TOOLS) expect(isHostTool(t)).toBe(true);
  });

  it('rejects unknown values with a clear message', () => {
    expect(isHostTool('emacs')).toBe(false);
    expect(() => assertHostTool('emacs')).toThrow(/Invalid host_tool "emacs".*vscode/);
  });
});
