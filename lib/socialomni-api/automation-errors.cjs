class AutomationError extends Error {
  constructor(message) { super(message); this.name = 'AutomationError'; this.publicMessage = message; }
}
async function readable(page, candidates, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new AutomationError('Browser closed. Task stopped.');
    for (const candidate of candidates) if (await candidate.first().isVisible().catch(() => false)) return candidate.first();
    await page.waitForTimeout(200);
  }
  throw new AutomationError(`Required platform control unavailable: ${label}. The page layout, language or account permissions may have changed. Review the browser; no automatic submission retry.`);
}
function publicError(error, phase = 'Task') {
  if (error.publicMessage) return error.publicMessage;
  const codes = {
    EAUTH: 'Authentication rejected. Check the saved connection credentials.',
    ECONNECTION: 'Provider connection failed. Check the host and network.',
    ESOCKET: 'Provider TLS/socket connection failed. Check the TLS port and network.',
    ETIMEDOUT: 'Provider connection timed out.',
    EENVELOPE: 'The mail server rejected the sender or recipient.',
    EMESSAGE: 'The mail server rejected the message.',
  };
  if (codes[error.code]) return codes[error.code];
  if (/FLOOD_WAIT/i.test(error.message || '')) return 'Telegram rate limit reached. Stop and wait for the platform restriction to expire; no automatic retry.';
  if (/API_ID_INVALID|API_ID_PUBLISHED_FLOOD/i.test(error.message || '')) return 'Telegram rejected the API settings. Check the API ID and hash.';
  if (/PHONE_CODE_INVALID|PHONE_CODE_EXPIRED/i.test(error.message || '')) return 'Telegram sign-in code is invalid or expired. Start sign-in again.';
  if (/SESSION_PASSWORD_NEEDED|PASSWORD_HASH_INVALID/i.test(error.message || '')) return 'Telegram requires a valid two-factor password.';
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED/i.test(error.message || '')) return 'Telegram session expired or was revoked. Sign in again.';
  if (error.name === 'TimeoutError') return `${phase}: the expected platform response timed out. Review the page layout, sign-in and permissions; uncertain submissions are not retried.`;
  if (/^(A recipient is opted out|An SMS recipient is opted out|SMS text must be 1–1600 characters|Twilio rejected the SMS request|You do not have|Member extraction is limited|Telegram authorization expired|No readable|Platform restriction|Browser closed|Sign-in timed out|Group composer|Membership outcome|Facebook redirected)/.test(error.message || '')) return error.message;
  return `${phase}: permission, connection, restriction, or unreadable platform response. Review any Unconfirmed attempts manually; nothing is retried automatically.`;
}
module.exports = { AutomationError, readable, publicError };
