/**
 * Credential and PII redaction for anything the CLI reports about itself.
 *
 * This is the single redaction policy shared by both telemetry surfaces — error
 * reports (utils/telemetry.ts) and usage analytics (utils/analytics.ts). It
 * lives on its own so the two can never drift: a pattern added here to stop a
 * leak has to protect both, and a gap found in one is a gap in the other.
 *
 * The policy is deliberately *not* "collect nothing". Command arguments —
 * bucket names, object keys, paths, flag values — are kept, because they are
 * what make a report or a usage trend actionable. What must never leave the
 * machine is credentials: access keys, secrets, tokens, passwords. Third-party
 * email addresses are redacted too, since an argv can name other people.
 */

// Patterns for sensitive VALUES that may appear anywhere in a captured command
// — as a positional or a flag value — and are redacted wherever found.
const SECRET_PATTERNS: RegExp[] = [
  // Email addresses (PII).
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Tigris access-key ids and secrets (tid_… / tsec_…).
  /\bt(?:id|sec)_[A-Za-z0-9]+/gi,
  // JWTs / opaque bearer tokens.
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  // AWS-style access key ids.
  /AKIA[0-9A-Z]{16}/g,
  // key=value / key: value where the key names a secret.
  /((?:secret[-_ ]?access[-_ ]?key|secret|password|token|authorization)["']?\s*[:=]\s*["']?)([^\s"',]+)/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    // Patterns with a leading capture group (e.g. `secret=`) preserve it and
    // redact the value; patterns without one redact the whole match. The second
    // replacer arg is the capture only when it's a string — for group-less
    // patterns it's the match offset (a number), which must not be emitted.
    out = out.replace(pattern, (_match, prefix?: string | number) =>
      typeof prefix === 'string' ? `${prefix}[redacted]` : '[redacted]'
    );
  }
  return out;
}

// Flag names whose VALUE is a credential or PII and must be redacted. Matched
// loosely so we don't depend on an exact, drift-prone list. `key$` covers the
// key family — `--key` (the CLI's alias for --access-key), `--access-key`,
// `--secret-key` — without matching non-secret flags like `--key-marker`.
// Object keys are positional args, so they never reach this flag check.
const SENSITIVE_FLAG_RE =
  /secret|password|token|credential|auth|user(name)?|e-?mail|owner|name|key$/i;

// Sensitive flags too short to pattern-match. `-t` is the webhook `--token`
// alias; it also aliases `--default-tier` on bucket commands, but redacting a
// tier value is harmless. Extend this as new sensitive short aliases appear.
const SENSITIVE_SHORT_FLAGS: ReadonlySet<string> = new Set(['-t']);

function isSensitiveFlag(flag: string): boolean {
  return SENSITIVE_FLAG_RE.test(flag) || SENSITIVE_SHORT_FLAGS.has(flag);
}

/**
 * Scrub a captured argv. The command and its arguments are kept (bucket names,
 * object keys, and paths are useful for debugging and for understanding usage),
 * but the values of credential/PII flags are redacted, and any credential- or
 * PII-shaped value (access keys, tokens, JWTs, emails) is redacted wherever it
 * appears — including in positionals.
 */
export function scrubArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');

    // `--flag=value`: handled entirely here. Redact the value outright when the
    // flag name is sensitive, otherwise still scrub any secret/PII-shaped value
    // inside it. This must `continue` — falling through to the space-form branch
    // (which tests the whole token) would let a sensitive substring in the value
    // both skip redaction and mis-redact the next positional.
    if (arg.startsWith('-') && eq !== -1) {
      const name = arg.slice(0, eq);
      out.push(
        isSensitiveFlag(name)
          ? `${name}=[redacted]`
          : `${name}=${redactSecrets(arg.slice(eq + 1))}`
      );
      continue;
    }

    // `--flag value` (bare flag only — `--flag=value` already continued above):
    // redact the following value when the flag name is sensitive.
    if (
      arg.startsWith('-') &&
      isSensitiveFlag(arg) &&
      i + 1 < argv.length &&
      !argv[i + 1].startsWith('-')
    ) {
      out.push(arg, '[redacted]');
      i++;
      continue;
    }

    // Positional (or valueless bare flag): redact any secret/PII-shaped value.
    out.push(redactSecrets(arg));
  }
  return out;
}
