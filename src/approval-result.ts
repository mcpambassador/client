/**
 * Agent-facing approval results (server ADR-023). The server returns them from /v1/tools/invoke as a 200
 * with `metadata.is_error: true` and the result object below. Everything here comes from the network, so
 * fields are checked and sanitized before they reach the host agent.
 */

export type ApprovalResult =
  | {
      status: 'approval_required';
      approval_id: string;
      expires_at: string;
      retry_after_seconds: number;
      approval_url: string;
    }
  | { status: 'approval_denied'; approval_id: string | null; retry_after_seconds: number }
  | { status: 'approval_expired'; approval_id: string }
  | { status: 'approval_unavailable'; reason: string };

const MAX_FIELD = 2048;
// Control, zero-width and bidi characters never belong in text we show an agent or a person.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

const clean = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_FIELD ? v.replace(UNSAFE, '') : null;

const seconds = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 86400 ? v : null;

/** Returns a validated, sanitized copy, or null if `value` is not a well-formed approval result. */
export function parseApprovalResult(value: unknown): ApprovalResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  switch (r['status']) {
    case 'approval_required': {
      const approval_id = clean(r['approval_id']);
      const expires_at = clean(r['expires_at']);
      const approval_url = clean(r['approval_url']);
      const retry_after_seconds = seconds(r['retry_after_seconds']);
      if (!approval_id || !expires_at || !approval_url || retry_after_seconds === null) return null;
      return {
        status: 'approval_required',
        approval_id,
        expires_at,
        retry_after_seconds,
        approval_url,
      };
    }
    case 'approval_denied': {
      const retry_after_seconds = seconds(r['retry_after_seconds']);
      const id = r['approval_id'] === null ? null : clean(r['approval_id']);
      if (retry_after_seconds === null || (id === null && r['approval_id'] !== null)) return null;
      return { status: 'approval_denied', approval_id: id, retry_after_seconds };
    }
    case 'approval_expired': {
      const approval_id = clean(r['approval_id']);
      return approval_id ? { status: 'approval_expired', approval_id } : null;
    }
    case 'approval_unavailable': {
      const reason = clean(r['reason']);
      return reason ? { status: 'approval_unavailable', reason } : null;
    }
    default:
      return null;
  }
}

/** One short line for the host agent: what happened and what to do next. */
export function approvalMessage(a: ApprovalResult): string {
  switch (a.status) {
    case 'approval_required':
      return (
        `Approval required: this tool call is waiting for a person to approve it (request ${a.approval_id}, ` +
        `expires ${a.expires_at}). Ask the user to approve it at ${a.approval_url}, then retry the same call` +
        ` (same tool, same arguments) after about ${a.retry_after_seconds}s.`
      );
    case 'approval_denied':
      return (
        'Approval denied: a person refused this tool call' +
        (a.retry_after_seconds > 0 ? `; do not retry for ${a.retry_after_seconds}s` : '') +
        '. Ask the user before trying again.'
      );
    case 'approval_expired':
      return `Approval expired (request ${a.approval_id}). Retry the call to start a new approval request.`;
    case 'approval_unavailable':
      return `Approval could not be requested (${a.reason.replace(/_/g, ' ')}). This call cannot proceed as asked.`;
  }
}
