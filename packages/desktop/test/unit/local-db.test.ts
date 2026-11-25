import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { applyMigrations, appliedMigrations, CONNECTION_PRAGMAS, createSqliteProxy, selectMigrations, type SqliteDriver } from '../../src/runtime/shared/local-db'
import { applySecrets, loadOrCreateSecrets } from '../../src/runtime/shared/local-secrets'
import { localDataDir, prepareLocalServer } from '../../src/runtime/server/local/bootstrap'

// The server runs these on bun:sqlite; the same driver shape on node:sqlite here.
function nodeDriver(file = ':memory:'): SqliteDriver & { db: DatabaseSync } {
  const db = new DatabaseSync(file)
  return {
    db,
    exec: sql => db.exec(sql),
    values: (sql, params) => {
      const statement = db.prepare(sql)
      statement.setReturnArrays(true)
      return statement.all(...params as never[]) as unknown as unknown[][]
    },
    run: (sql, params) => {
      db.prepare(sql).run(...params as never[])
    },
  }
}

const users = sqliteTable('users', { id: integer().primaryKey({ autoIncrement: true }), email: text().notNull().unique() })

describe('sqlite-proxy over the driver', () => {
  it('queries, and runs a batch in one transaction', async () => {
    const driver = nodeDriver()
    driver.exec(CONNECTION_PRAGMAS)
    driver.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE)')
    const proxy = createSqliteProxy(() => driver)
    const db = drizzle(proxy.query, proxy.batch, { schema: { users } })

    await db.insert(users).values({ email: 'a@example.com' })
    expect(await db.select().from(users)).toEqual([{ id: 1, email: 'a@example.com' }])
    expect(await db.select().from(users).where(eq(users.email, 'a@example.com')).get()).toEqual({ id: 1, email: 'a@example.com' })
    expect(await db.select().from(users).where(eq(users.email, 'none')).get()).toBeUndefined()

    await db.batch([db.insert(users).values({ email: 'b@example.com' }), db.update(users).set({ email: 'c@example.com' }).where(eq(users.id, 1))])
    expect((await db.select().from(users)).map(user => user.email)).toEqual(['c@example.com', 'b@example.com'])

    // The second insert fails (unique): the first is rolled back with it.
    await expect(db.batch([db.insert(users).values({ email: 'd@example.com' }), db.insert(users).values({ email: 'b@example.com' })])).rejects.toThrow(/UNIQUE/)
    expect((await db.select().from(users)).map(user => user.email)).toEqual(['c@example.com', 'b@example.com'])
    expect(await db.all(sql`SELECT count(*) AS n FROM users`)).toEqual([[2]])
  })
})

describe('migrations', () => {
  const init = { name: '0000_init', sql: 'CREATE TABLE `parents` (`id` integer PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE `children` (`id` integer PRIMARY KEY, `parent_id` integer NOT NULL REFERENCES `parents`(`id`) ON DELETE CASCADE);' }
  // drizzle-kit's sqlite table rebuild: with foreign keys on, dropping `parents` would delete every child.
  const rebuild = {
    name: '0001_rebuild',
    sql: `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_parents\` (\`id\` integer PRIMARY KEY, \`name\` text DEFAULT '' NOT NULL);--> statement-breakpoint
INSERT INTO \`__new_parents\`("id") SELECT "id" FROM \`parents\`;--> statement-breakpoint
DROP TABLE \`parents\`;--> statement-breakpoint
ALTER TABLE \`__new_parents\` RENAME TO \`parents\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;`,
  }

  it('selects the sqlite files the way NuxtHub names them', () => {
    expect(selectMigrations([
      'sqlite:0001_b.sql', 'postgresql:0001_b.sql', 'sqlite:0000_a.sql', 'meta:_journal.json', '0002_c.sql', '0003_d.sqlite.sql', '0003_d.sql', '0000_a.sql',
    ])).toEqual([
      { key: 'sqlite:0000_a.sql', name: '0000_a' },
      { key: 'sqlite:0001_b.sql', name: '0001_b' },
      { key: '0002_c.sql', name: '0002_c' },
      { key: '0003_d.sqlite.sql', name: '0003_d' },
    ])
    expect(selectMigrations(['sqlite/0000_a.sql'])).toEqual([{ key: 'sqlite:0000_a.sql', name: '0000_a' }])
  })

  it('applies pending migrations once and records them in _hub_migrations', () => {
    const driver = nodeDriver()
    expect(applyMigrations(driver, [init])).toEqual(['0000_init'])
    driver.exec('PRAGMA foreign_keys = ON; INSERT INTO parents (id) VALUES (1); INSERT INTO children (id, parent_id) VALUES (1, 1);')
    expect(applyMigrations(driver, [init, rebuild])).toEqual(['0001_rebuild'])
    expect(applyMigrations(driver, [init, rebuild])).toEqual([])
    expect([...appliedMigrations(driver)]).toEqual(['0000_init', '0001_rebuild'])
    // The rebuild kept the children, and foreign keys are back on.
    expect(driver.values('SELECT count(*) FROM children', [])).toEqual([[1]])
    expect(driver.values('PRAGMA foreign_keys', [])).toEqual([[1]])
    expect(driver.values('SELECT name, applied_at IS NOT NULL FROM _hub_migrations ORDER BY id', [])).toEqual([['0000_init', 1], ['0001_rebuild', 1]])
  })

  it('rolls a failing migration back and stops there', () => {
    const driver = nodeDriver()
    const broken = { name: '0001_broken', sql: 'CREATE TABLE half (id integer);\nINSERT INTO nowhere VALUES (1);' }
    expect(() => applyMigrations(driver, [init, broken, { name: '0002_never', sql: 'CREATE TABLE never (id integer);' }])).toThrow(/Migration "0001_broken" failed: no such table: nowhere/)
    expect([...appliedMigrations(driver)]).toEqual(['0000_init'])
    expect(driver.values('SELECT name FROM sqlite_master WHERE name IN (\'half\', \'never\')', [])).toEqual([])
    expect(driver.values('PRAGMA foreign_keys', [])).toEqual([[1]])
  })

  it('refuses a migration that leaves foreign key violations', () => {
    const driver = nodeDriver()
    applyMigrations(driver, [init])
    expect(() => applyMigrations(driver, [init, { name: '0001_orphan', sql: 'INSERT INTO children (id, parent_id) VALUES (1, 99);' }])).toThrow(/foreign key violation/)
    expect(driver.values('SELECT count(*) FROM children', [])).toEqual([[0]])
  })
})

describe('local server bootstrap', () => {
  let dir: string
  const saved = { ...process.env }
  const cwd = process.cwd()
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigear-desktop-data-'))
  })
  afterEach(() => {
    process.chdir(cwd)
    for (const key of ['DATA_DIR', 'HOST', 'NITRO_HOST', 'PORT', 'NITRO_PORT', 'NUXT_APP_SECRET'] as const) {
      if (saved[key] === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = saved[key]
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('generates the secrets once, with mode 0600, and keeps env vars that are set', () => {
    const file = join(dir, 'nested/secrets.json')
    const first = loadOrCreateSecrets(file, ['NUXT_APP_SECRET', 'NUXT_OAUTH_SERVER_PRIVATE_KEY'])
    expect(first.NUXT_APP_SECRET).toMatch(/^[\w+/]{43}=$/)
    expect(first.NUXT_OAUTH_SERVER_PRIVATE_KEY).toMatch(/^-----BEGIN PRIVATE KEY-----/)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    // A secret an older version generated (NUXT_AUTH_TOKENS_KEY) is kept and still applied, though nothing asks for it.
    writeFileSync(file, `${JSON.stringify({ ...first, NUXT_AUTH_TOKENS_KEY: 'old-tokens-key' })}\n`, { mode: 0o600 })
    const again = loadOrCreateSecrets(file, ['NUXT_APP_SECRET'])
    expect(again.NUXT_APP_SECRET).toBe(first.NUXT_APP_SECRET)
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual(['NUXT_APP_SECRET', 'NUXT_OAUTH_SERVER_PRIVATE_KEY', 'NUXT_AUTH_TOKENS_KEY'])
    const env: Record<string, string | undefined> = { NUXT_APP_SECRET: 'mine' }
    expect(applySecrets(env, again)).toEqual(['NUXT_OAUTH_SERVER_PRIVATE_KEY', 'NUXT_AUTH_TOKENS_KEY'])
    expect(env.NUXT_AUTH_TOKENS_KEY).toBe('old-tokens-key')
    expect(env.NUXT_APP_SECRET).toBe('mine')
    writeFileSync(file, '{oops')
    expect(() => loadOrCreateSecrets(file, ['NUXT_APP_SECRET'])).toThrow(/not valid JSON.*signs every user out/)
  })

  it('prepares the env: data folder, loopback host, port and secrets', () => {
    process.env.DATA_DIR = join(dir, 'data')
    process.env.HOST = '0.0.0.0'
    delete process.env.PORT
    delete process.env.NITRO_PORT
    delete process.env.NUXT_APP_SECRET
    prepareLocalServer({ port: 0, secrets: ['NUXT_APP_SECRET'] })
    expect(process.cwd()).toBe(realpathSync(join(dir, 'data')))
    expect(process.env).toMatchObject({ HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', PORT: '0' })
    expect(process.env.NUXT_APP_SECRET).toBeTruthy()
    expect(JSON.parse(readFileSync(join(dir, 'data/secrets.json'), 'utf8')).NUXT_APP_SECRET).toBe(process.env.NUXT_APP_SECRET)
    expect(localDataDir({})).toBe(join(process.cwd(), '.data', 'desktop'))
  })
})
