// Local mode: the database of the bundled server. Pure logic over a minimal sqlite driver, so the server runs it on
// `bun:sqlite` and the tests on `node:sqlite`.

/** The sqlite calls the local database needs, synchronous like `bun:sqlite` and `node:sqlite`. */
export interface SqliteDriver {
  /** Runs one or more statements without parameters. */
  exec(sql: string): void
  /** Rows as arrays of column values, in column order (what drizzle's sqlite-proxy expects). */
  values(sql: string, params: unknown[]): unknown[][]
  /** Runs one statement with parameters. */
  run(sql: string, params: unknown[]): void
}

export type ProxyMethod = 'run' | 'all' | 'values' | 'get'
export interface ProxyQuery { sql: string, params: unknown[], method: ProxyMethod }
/** `get` answers one row, `undefined` when there is none (drizzle then returns `undefined`, not an empty row). */
export interface ProxyResult { rows: unknown[] | unknown[][] | undefined }

/**
 * The two callbacks of drizzle's `sqlite-proxy` (`drizzle(query, batch, { schema })`) over a driver. The proxy keeps
 * `db.batch`, which `bun-sqlite` and `better-sqlite3` drizzle do not have; a batch runs in one transaction.
 */
export function createSqliteProxy(driver: () => SqliteDriver) {
  const one = ({ sql, params, method }: ProxyQuery): ProxyResult => {
    if (method === 'run') {
      driver().run(sql, params)
      return { rows: [] }
    }
    const rows = driver().values(sql, params)
    return { rows: method === 'get' ? rows[0] : rows }
  }
  return {
    query: async (sql: string, params: unknown[], method: ProxyMethod): Promise<ProxyResult> => one({ sql, params, method }),
    batch: async (queries: ProxyQuery[]): Promise<ProxyResult[]> => transaction(driver(), () => queries.map(one)),
  }
}

function transaction<T>(db: SqliteDriver, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Pragmas every connection of the local database runs: WAL (readers never wait for the writer) and foreign keys. */
export const CONNECTION_PRAGMAS = 'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;'

/**
 * NuxtHub's migrations table, exactly as `@nuxthub/core` creates it for sqlite (`CreateDatabaseMigrationsTableQuerySqlite`),
 * so a database migrated here and one migrated by NuxtHub (`nuxt dev`, `nuxt db migrate`) agree on what is applied.
 * `test/unit/nuxthub-seam.test.ts` compares it with the installed NuxtHub.
 */
export const HUB_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS _hub_migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`

export interface Migration { name: string, sql: string }

/**
 * The migration files that apply to sqlite, from the keys of NuxtHub's migrations folder (`<hub.dir>/db/migrations`,
 * bundled as server assets): `sqlite/<name>.sql` (`sqlite:<name>.sql` as a storage key), `<name>.sqlite.sql` and
 * `<name>.sql` without a dialect, unless a sqlite one has the same name. The names are NuxtHub's (`getMigrationMetadata`),
 * sorted.
 */
export function selectMigrations(keys: string[], dialect = 'sqlite'): { key: string, name: string }[] {
  const files = keys
    .map(key => key.replace(/\//g, ':'))
    .filter(key => key.endsWith('.sql'))
    .map((key) => {
      const base = key.replace(/\.sql$/, '')
      const suffix = /\.(postgresql|sqlite|mysql)$/.exec(base)?.[1]
      if (suffix) return { key, name: base.slice(0, -suffix.length - 1).split(':').pop()!, dialect: suffix }
      const parts = base.split(':')
      const prefix = parts.length > 1 && /^(?:postgresql|sqlite|mysql)$/.test(parts[0]!) ? parts[0] : undefined
      return { key, name: parts.at(-1)!, dialect: prefix }
    })
  const named = files.filter(file => file.dialect === dialect)
  const generic = files.filter(file => !file.dialect && !named.some(other => other.name === file.name))
  return [...named, ...generic]
    .map(({ key, name }) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

/** The names in `_hub_migrations`, creating the table first. */
export function appliedMigrations(db: SqliteDriver): Set<string> {
  db.exec(HUB_MIGRATIONS_TABLE)
  return new Set(db.values('SELECT name FROM _hub_migrations ORDER BY id', []).map(row => String(row[0])))
}

/**
 * Applies the pending migrations in order and records each in `_hub_migrations`. Each migration runs in its own
 * transaction, with foreign keys off: drizzle-kit rebuilds a sqlite table with `PRAGMA foreign_keys=OFF` (a no-op
 * inside a transaction), and dropping the old table with them on would cascade into its children. A violation left
 * behind fails the migration. Throws on the first failure; what applied before it stays applied.
 */
export function applyMigrations(db: SqliteDriver, migrations: Migration[]): string[] {
  const applied = appliedMigrations(db)
  const pending = migrations.filter(migration => !applied.has(migration.name))
  if (!pending.length) return []
  db.exec('PRAGMA foreign_keys = OFF')
  const done: string[] = []
  try {
    for (const migration of pending) {
      try {
        transaction(db, () => {
          db.exec(migration.sql)
          const violations = db.values('PRAGMA foreign_key_check', [])
          if (violations.length) throw new Error(`it leaves ${violations.length} foreign key violation(s), first in table "${String(violations[0]![0])}"`)
          db.run('INSERT INTO _hub_migrations (name) VALUES (?)', [migration.name])
        })
      }
      catch (error) {
        throw new Error(`Migration "${migration.name}" failed: ${(error as Error).message}`, { cause: error })
      }
      done.push(migration.name)
    }
  }
  finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
  return done
}
