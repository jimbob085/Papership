import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redact-secrets.js';

describe('redactSecrets', () => {
  it('returns unchanged text when no secrets are present', () => {
    const input = 'Hello world, nothing sensitive here.';
    expect(redactSecrets(input)).toBe(input);
  });

  // -- Anthropic keys --
  it('redacts Anthropic API keys (sk-ant-*)', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
    const input = `Authorization: ${key}`;
    const result = redactSecrets(input);
    expect(result).toContain('sk-ant-a***REDACTED***');
    expect(result).not.toContain(key);
  });

  // -- OpenAI keys --
  it('redacts OpenAI API keys (sk-*)', () => {
    const key = 'sk-proj1234567890abcdefghijklmnop';
    const input = `key=${key}`;
    const result = redactSecrets(input);
    expect(result).toContain('sk-proj1***REDACTED***');
    expect(result).not.toContain(key);
  });

  // -- Google keys --
  it('redacts Google API keys (AIza*)', () => {
    const key = 'AIzaSyA1234567890abcdefghijklmnopqrstu';
    const input = `google_key: ${key}`;
    const result = redactSecrets(input);
    expect(result).toContain('AIzaSyA1***REDACTED***');
    expect(result).not.toContain(key);
  });

  // -- Generic key_* tokens --
  it('redacts generic key_* tokens', () => {
    const key = 'key_live_abcdefghijklmnopqrstuv';
    const input = `api_key_value: ${key}`;
    const result = redactSecrets(input);
    expect(result).toContain('key_live***REDACTED***');
    expect(result).not.toContain(key);
  });

  // -- AWS access keys --
  it('redacts AWS access key IDs (AKIA*)', () => {
    const key = 'AKIAIOSFODNN7EXAMPLE';
    const input = `aws_key=${key}`;
    const result = redactSecrets(input);
    expect(result).toContain('AKIAIOSF***REDACTED***');
    expect(result).not.toContain(key);
  });

  // -- Bearer tokens --
  it('redacts Bearer tokens in Authorization headers', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N';
    const input = `Authorization: Bearer ${token}`;
    const result = redactSecrets(input);
    expect(result).toContain('Bearer e***REDACTED***');
    expect(result).not.toContain(token);
  });

  it('redacts bearer tokens case-insensitively', () => {
    const input = 'bearer abcdefghijklmnopqrstuv1234';
    const result = redactSecrets(input);
    expect(result).toContain('***REDACTED***');
    expect(result).not.toContain('abcdefghijklmnopqrstuv1234');
  });

  // -- Env var dumps --
  it('redacts API_KEY=value in env dumps', () => {
    const input = 'API_KEY=super_secret_value_123';
    const result = redactSecrets(input);
    expect(result).toContain('API_KEY=***REDACTED***');
    expect(result).not.toContain('super_secret_value_123');
  });

  it('redacts SECRET=value in env dumps', () => {
    const input = 'MY_SECRET=foobarbazqux123';
    const result = redactSecrets(input);
    expect(result).toContain('***REDACTED***');
    expect(result).not.toContain('foobarbazqux123');
  });

  it('redacts TOKEN=value in env dumps', () => {
    const input = 'GITHUB_TOKEN=ghp_abcdefghijklmnop';
    const result = redactSecrets(input);
    expect(result).toContain('***REDACTED***');
    expect(result).not.toContain('ghp_abcdefghijklmnop');
  });

  it('redacts PASSWORD=value in env dumps', () => {
    const input = 'DB_PASSWORD=hunter2_really_long_password';
    const result = redactSecrets(input);
    expect(result).toContain('***REDACTED***');
    expect(result).not.toContain('hunter2_really_long_password');
  });

  it('redacts CREDENTIAL=value in env dumps', () => {
    const input = 'CREDENTIAL=my_credential_value_here';
    const result = redactSecrets(input);
    expect(result).toContain('***REDACTED***');
    expect(result).not.toContain('my_credential_value_here');
  });

  // -- Long hex strings --
  it('redacts 32+ char hex strings that look like tokens', () => {
    const hex = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const input = `response_token: ${hex} end`;
    const result = redactSecrets(input);
    expect(result).toContain('a1b2c3d4***REDACTED***');
    expect(result).not.toContain(hex);
  });

  it('does not redact short hex strings (under 32 chars)', () => {
    const hex = 'a1b2c3d4e5f6';
    const input = `short: ${hex}`;
    expect(redactSecrets(input)).toBe(input);
  });

  // -- Multiple secrets in one string --
  it('redacts multiple secrets in a single string', () => {
    const input = [
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.long.token.value',
      'API_KEY=sk-ant-api03-supersecretvalue1234567890abcdef',
      'aws=AKIAIOSFODNN7EXAMPLE',
    ].join('\n');
    const result = redactSecrets(input);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).not.toContain('supersecretvalue1234567890abcdef');
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // Confirm prefix preservation
    expect(result).toContain('Bearer e***REDACTED***');
    expect(result).toContain('AKIAIOSF***REDACTED***');
  });

  // -- Idempotence --
  it('is idempotent (running twice gives same result)', () => {
    const input = 'TOKEN=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
    const once = redactSecrets(input);
    const twice = redactSecrets(once);
    expect(twice).toBe(once);
  });
});
