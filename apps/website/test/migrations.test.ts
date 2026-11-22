import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

// The committed sqlite migrations, applied in order to an in-memory database, the way D1 gets them.
const dir = fileURLToPath(new URL('../server/db/migrations/sqlite/', import.meta.url))
const statements = async (file: string) => (await readFile(`${dir}${file}`, 'utf8')).split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)
const migrationsBefore = async (tag: string) => (await readdir(dir)).filter(file => file.endsWith('.sql') && file < tag).sort()

describe('0027_users_locale_without_default', () => {
  it('keeps every user, clears the old default language and keeps ids from being reused', async () => {
    const client = createClient({ url: ':memory:' })
    for (const file of await migrationsBefore('0027_')) {
      for (const sql of await statements(file)) await client.execute(sql)
    }
    const now = Date.now()
    for (const [name, email] of [['Ada', 'ada@example.com'], ['Bo', 'bo@example.com'], ['Cy', 'cy@example.com']]) {
      await client.execute({ sql: 'INSERT INTO users (name, email, created_at, updated_at, stripe_customer_id, preferences) VALUES (?, ?, ?, ?, ?, ?)', args: [name!, email!, now, now, `cus_${name}`, '{"colorMode":"dark"}'] })
    }
    // The newest user is deleted: a new user must not get its id.
    await client.execute('DELETE FROM users WHERE id = 3')
    const before = (await client.execute('SELECT * FROM users ORDER BY id')).rows.map(row => ({ ...row }))
    expect(before.map(row => row.locale)).toEqual(['da', 'da'])

    for (const sql of await statements('0027_users_locale_without_default.sql')) await client.execute(sql)

    const after = (await client.execute('SELECT * FROM users ORDER BY id')).rows.map(row => ({ ...row }))
    expect(after).toEqual(before.map(row => ({ ...row, locale: null })))
    const columns = (await client.execute('PRAGMA table_info(users)')).rows
    expect(columns.find(column => column.name === 'locale')).toMatchObject({ dflt_value: null, notnull: 0 })
    const indexes = (await client.execute('PRAGMA index_list(users)')).rows.map(row => row.name)
    expect(indexes).toContain('users_email_unique')
    const tables = (await client.execute('SELECT name FROM sqlite_master WHERE type = \'table\'')).rows.map(row => row.name)
    expect(tables).not.toContain('__new_users')

    await client.execute({ sql: 'INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)', args: ['Di', 'di@example.com', now, now] })
    const [created] = (await client.execute('SELECT id, locale FROM users WHERE email = \'di@example.com\'')).rows
    expect({ ...created }).toEqual({ id: 4, locale: null })
    await expect(client.execute({ sql: 'INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)', args: ['Ada', 'ada@example.com', now, now] })).rejects.toThrow()
    client.close()
  })

  it('applies to an empty users table', async () => {
    const client = createClient({ url: ':memory:' })
    for (const file of await migrationsBefore('0028_')) {
      for (const sql of await statements(file)) await client.execute(sql)
    }
    expect((await client.execute('SELECT count(*) AS n FROM users')).rows[0]!.n).toBe(0)
    client.close()
  })
})

describe('0029_inbox_message_sender_permanent_tombstones', () => {
  it('files every stored inbound message under the contact of its thread, and leaves replies without one', async () => {
    const client = createClient({ url: ':memory:' })
    for (const file of await migrationsBefore('0029_')) {
      for (const sql of await statements(file)) await client.execute(sql)
    }
    const now = Math.floor(Date.now() / 1000)
    await client.execute({ sql: 'INSERT INTO inbox_mailboxes (id, key, owner_type, name, grants, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['ibx_1', 'support', 'platform', '"Support"', '[]', now, now] })
    await client.execute({ sql: 'INSERT INTO inbox_contacts (id, channel, external_id, created_at) VALUES (?, ?, ?, ?)', args: ['icn_1', 'email', 'kari@example.org', now] })
    await client.execute({ sql: 'INSERT INTO inbox_threads (id, mailbox_id, contact_id, channel, status, last_message_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: ['ibt_1', 'ibx_1', 'icn_1', 'email', 'open', now, now, now] })
    for (const [id, direction] of [['ibm_1', 'in'], ['ibm_2', 'out']] as const) {
      await client.execute({ sql: 'INSERT INTO inbox_messages (id, thread_id, direction, body, attachments, created_at_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id, 'ibt_1', direction, 'Hello', '[]', Date.now(), now] })
    }
    for (const sql of await statements('0029_inbox_message_sender_permanent_tombstones.sql')) await client.execute(sql)

    const rows = (await client.execute('SELECT id, contact_id, authenticated FROM inbox_messages ORDER BY id')).rows
    expect(rows.map(row => [row.id, row.contact_id, row.authenticated])).toEqual([['ibm_1', 'icn_1', 0], ['ibm_2', null, 0]])
    await client.execute({ sql: 'INSERT INTO inbox_tombstones (key, created_at) VALUES (?, ?)', args: ['k', now] })
    expect((await client.execute('SELECT permanent, contact_id FROM inbox_tombstones')).rows.map(row => [row.permanent, row.contact_id])).toEqual([[0, null]])
    client.close()
  })
})
