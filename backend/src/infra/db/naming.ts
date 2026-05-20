import { DefaultNamingStrategy, type NamingStrategyInterface, type Table } from 'typeorm';
import pluralize from 'pluralize';
import { snakeCase } from './case';

export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(targetName: string, userSpecifiedName?: string): string {
    if (userSpecifiedName !== undefined && userSpecifiedName.length > 0) return userSpecifiedName;
    return snakeCase(pluralize(targetName));
  }

  override columnName(
    propertyName: string,
    customName?: string,
    embeddedPrefixes: string[] = [],
  ): string {
    if (customName !== undefined && customName.length > 0) return customName;
    if (embeddedPrefixes.length === 0) return snakeCase(propertyName);
    return snakeCase([...embeddedPrefixes, propertyName].join('_'));
  }

  override relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return `${snakeCase(relationName)}_${snakeCase(referencedColumnName)}`;
  }

  override joinTableName(
    firstTableName: string,
    _secondTableName: string,
    firstPropertyName: string,
    _secondPropertyName: string,
  ): string {
    return snakeCase(`${firstTableName}_${firstPropertyName.replace(/\./g, '_')}`);
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }

  override indexName(tableOrName: Table | string, columns: string[], where?: string): string {
    const table = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    const base = `idx_${table}_${columns.map(snakeCase).join('_')}`;
    return where !== undefined && where.length > 0 ? `${base}_partial` : base;
  }

  override primaryKeyName(tableOrName: Table | string): string {
    const table = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    return `pk_${table}`;
  }

  override foreignKeyName(tableOrName: Table | string, columnNames: string[]): string {
    const table = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    return `fk_${table}_${columnNames.map(snakeCase).join('_')}`;
  }
}
