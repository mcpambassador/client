import { describe, it, expect } from 'vitest';
import { APPROVALS_PATH_PREFIX, ID_RE } from '../approval-result.js';

// These mirror server @mcpambassador/contracts APPROVAL_ID_PATTERN and APPROVAL_SPA_PATH_PREFIX.
// A change on either side must be a deliberate, paired edit.
describe('approval constants stay in step with the server contract', () => {
  it('pins the SPA path prefix', () => {
    expect(APPROVALS_PATH_PREFIX).toBe('/app/approvals/');
  });
  it('pins the approval id pattern', () => {
    expect(ID_RE.source).toBe('^[A-Za-z0-9_-]{8,64}$');
    expect(ID_RE.test('apr_abcdefgh')).toBe(true);
    expect(ID_RE.test('short')).toBe(false);
    expect(ID_RE.test('has space 12345')).toBe(false);
  });
});
