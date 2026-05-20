import { describe, expect, it } from 'vitest';
import { LoginSchema, PasswordChangeSchema } from './auth.schema';

describe('LoginSchema', () => {
  it('accepts a valid email + password', () => {
    expect(
      LoginSchema.safeParse({ email: 'alice@example.com', password: 'hunter2hunter' }).success,
    ).toBe(true);
  });

  it('rejects short passwords', () => {
    expect(LoginSchema.safeParse({ email: 'alice@example.com', password: 'short' }).success).toBe(
      false,
    );
  });

  it('rejects bad email shape', () => {
    expect(LoginSchema.safeParse({ email: 'not-email', password: 'hunter2hunter' }).success).toBe(
      false,
    );
  });
});

describe('PasswordChangeSchema', () => {
  it('accepts valid input', () => {
    expect(
      PasswordChangeSchema.safeParse({
        currentPassword: 'currentcurrent',
        newPassword: 'newnewnewnew',
      }).success,
    ).toBe(true);
  });

  it('rejects short new password', () => {
    expect(
      PasswordChangeSchema.safeParse({
        currentPassword: 'currentcurrent',
        newPassword: 'tiny',
      }).success,
    ).toBe(false);
  });
});
