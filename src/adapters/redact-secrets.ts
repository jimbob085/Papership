/**
 * Secret redaction filter for stdout/stderr streams.
 *
 * Masks API keys, bearer tokens, environment variable dumps containing
 * sensitive values, and long hex strings that look like tokens.
 *
 * Every pattern preserves the first 8 characters so operators can
 * identify *which* credential leaked without exposing the full value.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,                         // Anthropic API keys
  /sk-[a-zA-Z0-9]{20,}/g,                               // OpenAI API keys
  /AIza[a-zA-Z0-9_-]{30,}/g,                            // Google API keys
  /key_[a-zA-Z0-9_]{20,}/g,                              // Generic key_* tokens
  /AKIA[A-Z0-9]{16}/g,                                  // AWS access key IDs
  /Bearer\s+[a-zA-Z0-9._-]{20,}/gi,                     // Authorization headers
  /(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)=\S+/gi,    // Env var dumps
  /(?<![a-zA-Z0-9])[0-9a-f]{32,}(?![a-zA-Z0-9])/gi,    // 32+ char hex strings (tokens)
];

/**
 * Replace every occurrence of a known secret pattern with a truncated
 * prefix followed by `***REDACTED***`.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex since we reuse the same RegExp objects (global flag)
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      const prefix = match.slice(0, 8);
      return `${prefix}***REDACTED***`;
    });
  }
  return result;
}
