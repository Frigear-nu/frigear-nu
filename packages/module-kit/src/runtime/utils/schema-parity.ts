import { is, Table, type Column } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { getTableConfig as getSQLiteTableConfig } from 'drizzle-orm/sqlite-core'
import { getTableConfig as getPgTableConfig, PgTable } from 'drizzle-orm/pg-core'

type SchemaModule = Record<string, unknown>

type TableShape = {
  name: string
  columns: Record<string, Record<string, unknown>>
  indexes: Record<string, { columns: string[], unique: boolean }>
  foreignKeys: string[]
  primaryKeys: string[]
  uniqueConstraints: string[]
}

// Column options as they read the same in every dialect: drizzle's `dataType` (`string`, `number`, `date`, `json`,
// `boolean`, `custom`, ...) instead of the SQL type, which differs by design (`integer` timestamps vs `timestamp`).
const describeColumn = (column: Column) => {
  const options = column as unknown as Record<string, unknown>
  return {
    name: column.name,
    dataType: column.dataType,
    notNull: column.notNull,
    primary: column.primary,
    unique: column.isUnique,
    default: column.default,
    defaultFn: Boolean(column.defaultFn),
    onUpdateFn: Boolean(column.onUpdateFn),
    autoIncrement: options.autoIncrement === true || /Serial/.test(column.columnType) || Boolean(column.generatedIdentity),
  }
}

const describeTable = (table: Table): TableShape => {
  const config = is(table, PgTable) ? getPgTableConfig(table) : getSQLiteTableConfig(table as SQLiteTable)
  const columnNames = (columns: Array<{ name: string }>) => columns.map(column => column.name)
  return {
    name: config.name,
    columns: Object.fromEntries(config.columns.map(column => [column.name, describeColumn(column)])),
    indexes: Object.fromEntries(config.indexes.map(({ config: index }) => [
      index.name,
      { columns: index.columns.map(column => (column as { name?: string }).name ?? String(column)), unique: index.unique },
    ])),
    foreignKeys: config.foreignKeys.map((foreignKey) => {
      const { columns, foreignTable, foreignColumns } = foreignKey.reference()
      const target = is(foreignTable, PgTable) ? getPgTableConfig(foreignTable).name : getSQLiteTableConfig(foreignTable as SQLiteTable).name
      return `(${columnNames(columns)}) -> ${target}(${columnNames(foreignColumns)}) on delete ${foreignKey.onDelete ?? 'no action'} on update ${foreignKey.onUpdate ?? 'no action'}`
    }).sort(),
    primaryKeys: config.primaryKeys.map(primaryKey => `(${columnNames(primaryKey.columns)})`).sort(),
    uniqueConstraints: config.uniqueConstraints.map(unique => `(${columnNames(unique.columns)})`).sort(),
  }
}

const tablesOf = (schema: SchemaModule) => Object.fromEntries(
  Object.entries(schema).filter(([, value]) => is(value, Table)) as Array<[string, Table]>,
)

const diffShapes = (path: string, expected: unknown, actual: unknown, differences: string[]) => {
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      diffShapes(`${path}.${key}`, (expected as Record<string, unknown>)[key], (actual as Record<string, unknown>)[key], differences)
    }
    return
  }
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    differences.push(`${path}: sqlite ${JSON.stringify(expected)} != postgresql ${JSON.stringify(actual)}`)
  }
}

/**
 * Lists every difference between the tables a module's `schema.sqlite.ts` and `schema.postgresql.ts` export: export
 * names, table names, columns (name, drizzle data type, not null, primary key, unique, defaults, `$defaultFn`,
 * `$onUpdateFn`, auto increment), indexes and foreign keys. An empty list means the two files are in sync.
 */
export const compareSchemaDialects = (sqlite: SchemaModule, postgresql: SchemaModule): string[] => {
  const differences: string[] = []
  const sqliteTables = tablesOf(sqlite)
  const postgresqlTables = tablesOf(postgresql)
  for (const name of new Set([...Object.keys(sqliteTables), ...Object.keys(postgresqlTables)])) {
    const sqliteTable = sqliteTables[name]
    const postgresqlTable = postgresqlTables[name]
    if (!sqliteTable || !postgresqlTable) {
      differences.push(`${name}: only exported by ${sqliteTable ? 'sqlite' : 'postgresql'}`)
      continue
    }
    diffShapes(name, describeTable(sqliteTable), describeTable(postgresqlTable), differences)
  }
  return differences
}

/** Throws, listing every difference, when the sqlite and postgresql schema files of a module are out of sync. */
export const expectSchemaParity = (sqlite: SchemaModule, postgresql: SchemaModule) => {
  const differences = compareSchemaDialects(sqlite, postgresql)
  if (differences.length) {
    throw new Error(`[module-kit] The sqlite and postgresql schemas are out of sync:\n${differences.map(line => `  - ${line}`).join('\n')}`)
  }
}
