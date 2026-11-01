/**
 * Agent-facing approval results (server ADR-023).
 *
 * The server reports them in `metadata.approval` of a /v1/tools/invoke response. That field is set by the
 * Ambassador pipeline only; a downstream tool controls `result` and can imitate any shape there, so the
 * result body is never read as an approval. Every field is still matched against a strict format (ids,
 * timestamps, fixed reason codes, a same-host URL) so nothing free-form reaches the host agent.
 */

export const APPROVALS_PATH_PREFIX = '/app/approvals/';

const UNAVAILABLE_REASONS = ['arguments_too_large', 'too_many_pending', 'rate_limited'] as const;
export type ApprovalUnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export type ApprovalResult =
  | {
      status: 'approval_required';
      approval_id: string;
      expires_at: string;
      retry_after_seconds: number;
      /** Present only when it points at this server's approvals page for this request. */
      approval_url?: string;
    }
  | { status: 'approval_denied'; approval_id: string | null; retry_after_seconds: number }
  | { status: 'approval_expired'; approval_id: string }
  | { status: 'approval_unavailable'; reason: ApprovalUnavailableReason };

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const id = (v: unknown): string | null => (typeof v === 'string' && ID_RE.test(v) ? v : null);

const isoTime = (v: unknown): string | null =>
  typeof v === 'string' && ISO_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;

const seconds = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 86400 ? v : null;

/**
 * The approval URL is shown to a person as the place to approve, so it must be this server's SPA route for
 * this exact request: https (http only for loopback), same hostname as `server_url` (the port may differ,
 * the SPA is on another port), no credentials, query or fragment. Anything else is dropped.
 */
function safeApprovalUrl(v: unknown, approvalId: string, serverUrl: string): string | null {
  if (typeof v !== 'string' || v.length > 512) return null;
  try {
    const u = new URL(v);
    const s = new URL(serverUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return null;
    if (u.hostname !== s.hostname) return null;
    if (u.username || u.password || u.search || u.hash) return null;
    if (u.pathname !== APPROVALS_PATH_PREFIX + approvalId) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Returns a validated copy, or null if `value` is not a well-formed approval result. */
export function parseApprovalResult(value: unknown, serverUrl: string): ApprovalResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  switch (r['status']) {
    case 'approval_required': {
      const approval_id = id(r['approval_id']);
      const expires_at = isoTime(r['expires_at']);
      const retry_after_seconds = seconds(r['retry_after_seconds']);
      if (!approval_id || !expires_at || retry_after_seconds === null) return null;
      const url = safeApprovalUrl(r['approval_url'], approval_id, serverUrl);
      return {
        status: 'approval_required',
        approval_id,
        expires_at,
        retry_after_seconds,
        ...(url ? { approval_url: url } : {}),
      };
    }
    case 'approval_denied': {
      const retry_after_seconds = seconds(r['retry_after_seconds']);
      const approval_id = r['approval_id'] === null ? null : id(r['approval_id']);
      if (retry_after_seconds === null || (approval_id === null && r['approval_id'] !== null)) {
        return null;
      }
      return { status: 'approval_denied', approval_id, retry_after_seconds };
    }
    case 'approval_expired': {
      const approval_id = id(r['approval_id']);
      return approval_id ? { status: 'approval_expired', approval_id } : null;
    }
    case 'approval_unavailable': {
      const reason = UNAVAILABLE_REASONS.find(x => x === r['reason']);
      return reason ? { status: 'approval_unavailable', reason } : null;
    }
    default:
      return null;
  }
}

const UNAVAILABLE_TEXT: Record<ApprovalUnavailableReason, string> = {
  arguments_too_large: 'the arguments are too large to be reviewed by a person',
  too_many_pending: 'too many approval requests are already waiting',
  rate_limited: 'approval requests are being created too fast',
};

/** One short line for the host agent: what happened and what to do next. */
export function approvalMessage(a: ApprovalResult): string {
  switch (a.status) {
    case 'approval_required':
      return (
        `Approval required: this tool call is waiting for a person to approve it (request ${a.approval_id}, ` +
        `expires ${a.expires_at}). Ask the user to approve it ` +
        (a.approval_url ? `at ${a.approval_url}` : 'in the Ambassador console (Approvals)') +
        `, then retry the same call (same tool, same arguments) after about ${a.retry_after_seconds}s.`
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
      return `Approval could not be requested: ${UNAVAILABLE_TEXT[a.reason]}. This call cannot proceed as asked.`;
  }
}
