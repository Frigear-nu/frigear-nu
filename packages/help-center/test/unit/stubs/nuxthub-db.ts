import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../../src/runtime/server/db/schema.sqlite'

// `@nuxthub/db` for unit tests of the database helpers: an in-memory SQLite with the module's tables. `boundParams`
// records how many values each statement binds, so a test can hold a query to Cloudflare D1's limit of 100.
export const boundParams: number[] = []
export const client = createClient({ url: ':memory:' })
export const db = drizzle(client, { schema, logger: { logQuery: (_query: string, params: unknown[]) => void boundParams.push(params.length) } })
export { schema }
