import { beforeAll, describe, expect, it, vi } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// The store against a real (embedded) Postgres, with the users table from `schema.postgresql.ts`, a table with a
// foreign key to `users.id` and a table without one that `rekeyUserAuthData` keeps in step.
vi.mock('@nuxthub/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { integer, pgTable } = await import('drizzle-orm/pg-core')
  const { users } = await import('../src/runtime/db/schema.postgresql')
  const posts = pgTable('posts', { id: integer().primaryKey(), authorId: integer().notNull().references(() => users.id) })
  const tokens = pgTable('tokens', { id: integer().primaryKey(), userId: integer().notNull() })
  const schema = { users, posts, tokens }
  return { db: drizzle({ client: new PGlite(), schema, casing: 'snake_case' }), schema }
})

type Executor = Pick<typeof db, 'update'>
vi.stubGlobal('rekeyUserAuthData', (from: number, to: number, executor: Executor = db) => [
  executor.update(schema.tokens).set({ userId: to }).where(eq(schema.tokens.userId, from)),
])

const { default: store } = await import('../src/runtime/server/user-store')

const userIds = async () => (await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).orderBy(asc(schema.users.id)))

beforeAll(async () => {
  for (const statement of [`
    create table users (
      id serial primary key,
      name text not null,
      email text not null unique,
      avatar text,
      accepted_terms_at bigint,
      created_at timestamptz not null,
      updated_at timestamptz not null
    )`,
  'create table posts (id integer primary key, author_id integer not null references users(id))',
  'create table tokens (id integer primary key, user_id integer not null)',
  ]) await db.execute(statement)
  await db.insert(schema.users).values([
    { name: 'Ada', email: 'ada@example.com', acceptedTermsAt: Date.now(), updatedAt: new Date() },
    { name: 'Bob', email: 'bob@example.com', updatedAt: new Date() },
  ])
  await db.insert(schema.posts).values([{ id: 1, authorId: 1 }, { id: 2, authorId: 2 }])
  await db.insert(schema.tokens).values([{ id: 1, userId: 1 }, { id: 2, userId: 2 }])
})

describe('user store changeId (postgresql)', () => {
  it('moves the user and everything referencing them to the new id', async () => {
    await store.changeId!(1, 10)

    expect(await userIds()).toEqual([{ id: 2, email: 'bob@example.com' }, { id: 10, email: 'ada@example.com' }])
    expect(await db.select().from(schema.posts).where(eq(schema.posts.id, 1))).toEqual([{ id: 1, authorId: 10 }])
    expect(await db.select().from(schema.tokens).where(eq(schema.tokens.id, 1))).toEqual([{ id: 1, userId: 10 }])
  })

  it('keeps the id sequence past the highest id', async () => {
    const [user] = await db.insert(schema.users).values({ name: 'Cleo', email: 'cleo@example.com', updatedAt: new Date() }).returning()
    expect(user!.id).toBe(11)
  })

  it('moves the holder of the target id aside first', async () => {
    await store.changeId!(2, 10)

    expect(await userIds()).toEqual([
      { id: 10, email: 'bob@example.com' },
      { id: 11, email: 'cleo@example.com' },
      { id: 12, email: 'ada@example.com' },
    ])
    expect(await db.select().from(schema.posts).orderBy(asc(schema.posts.id))).toEqual([{ id: 1, authorId: 12 }, { id: 2, authorId: 10 }])
    expect(await db.select().from(schema.tokens).orderBy(asc(schema.tokens.id))).toEqual([{ id: 1, userId: 12 }, { id: 2, userId: 10 }])
  })
})
