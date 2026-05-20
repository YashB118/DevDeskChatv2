import { describe, expect, it } from 'vitest';
import { snakeCase } from './case';

describe('snakeCase', () => {
  it.each([
    ['userId', 'user_id'],
    ['createdAt', 'created_at'],
    ['tokenFamilyId', 'token_family_id'],
    ['HTTPResponse', 'http_response'],
    ['camelOneCamelTwo', 'camel_one_camel_two'],
    ['User', 'user'],
    ['simple', 'simple'],
    ['', ''],
    ['with-dash text', 'with_dash_text'],
  ])('converts %s → %s', (input, expected) => {
    expect(snakeCase(input)).toBe(expected);
  });
});
