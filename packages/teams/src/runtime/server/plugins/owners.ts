import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { Column, SQL, Table } from 'drizzle-orm'
import type { Translated } from '../../../types'

type NamedTable = Table & { id: Column, name: Column }
type NameLookup = {
  select: (fields: Record<string, Column>) => {
    from: (table: Table) => { where: (condition: SQL) => { limit: (count: number) => Promise<Array<{ name: unknown }>> } }
  }
}

// Teams' own answers to `teams:owner:resolve`, always on:
// - `team`: the team's name, and whether it exists.
// - `operation`: the operation's name, read from the `operations` table when `@frigear-nu/operations` is installed (its
//   table is then in the schema). Teams does not import operations.
// Other owner types are left to the app's listeners.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('teams:owner:resolve', async (ctx) => {
    const tables: Record<string, NamedTable | undefined> = {
      team: schema.teams as unknown as NamedTable,
      operation: (schema as Record<string, unknown>).operations as NamedTable | undefined,
    }
    const table = Object.hasOwn(tables, ctx.owner.type) ? tables[ctx.owner.type] : undefined
    if (!table) return
    if (!ctx.owner.id) {
      ctx.exists = false
      return
    }
    const [row] = await (db as unknown as NameLookup).select({ name: table.name }).from(table).where(eq(table.id, ctx.owner.id)).limit(1)
    ctx.exists = !!row
    if (row) ctx.label = row.name as Translated
  })
})
