import { describe, expect, it } from 'vitest';
import { SnakeNamingStrategy } from './naming';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('pluralizes and snake_cases table names', () => {
    expect(strategy.tableName('User', undefined)).toBe('users');
    expect(strategy.tableName('RefreshToken', undefined)).toBe('refresh_tokens');
    expect(strategy.tableName('AuditLog', undefined)).toBe('audit_logs');
  });

  it('honors a user-specified table name', () => {
    expect(strategy.tableName('User', 'legacy_users_v1')).toBe('legacy_users_v1');
  });

  it('snake_cases column names', () => {
    expect(strategy.columnName('createdAt', undefined, [])).toBe('created_at');
    expect(strategy.columnName('tokenFamilyId', undefined, [])).toBe('token_family_id');
  });

  it('honors a custom column name', () => {
    expect(strategy.columnName('createdAt', 'created_ts', [])).toBe('created_ts');
  });

  it('applies embedded prefixes', () => {
    expect(strategy.columnName('city', undefined, ['shippingAddress'])).toBe(
      'shipping_address_city',
    );
  });

  it('builds relation names', () => {
    expect(strategy.relationName('refreshTokens')).toBe('refresh_tokens');
  });

  it('builds join column names', () => {
    expect(strategy.joinColumnName('user', 'id')).toBe('user_id');
    expect(strategy.joinColumnName('parentChat', 'id')).toBe('parent_chat_id');
  });

  it('builds join table names', () => {
    expect(strategy.joinTableName('users', 'roles', 'roles', 'users')).toBe('users_roles');
  });

  it('builds join table column names', () => {
    expect(strategy.joinTableColumnName('users', 'id')).toBe('users_id');
    expect(strategy.joinTableColumnName('users', 'id', 'userId')).toBe('users_user_id');
  });

  it('builds index names', () => {
    expect(strategy.indexName('users', ['email'], undefined)).toBe('idx_users_email');
    expect(strategy.indexName('audit_logs', ['userId', 'createdAt'], undefined)).toBe(
      'idx_audit_logs_user_id_created_at',
    );
    expect(strategy.indexName('users', ['disabled'], 'disabled = false')).toBe(
      'idx_users_disabled_partial',
    );
  });

  it('builds primary key names', () => {
    expect(strategy.primaryKeyName('users')).toBe('pk_users');
  });

  it('builds foreign key names', () => {
    expect(strategy.foreignKeyName('refresh_tokens', ['userId'])).toBe('fk_refresh_tokens_user_id');
  });
});
