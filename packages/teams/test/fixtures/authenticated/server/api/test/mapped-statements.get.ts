import { db } from '@nuxthub/db'

type Client = { execute: (...args: unknown[]) => Promise<unknown>, batch: (...args: unknown[]) => Promise<unknown> }

// Test-only: lists the members of `?teamId=` with the mapped ones (as `?include=mapped` does) and counts the statements
// the database ran meanwhile, to check that the mapped candidates are resolved in bulk.
export default defineEventHandler(async (event) => {
  const { teamId = '' } = getQuery(event) as { teamId?: string }
  const client = (db as unknown as { $client: Client }).$client
  const { execute, batch } = client
  let statements = 0
  client.execute = (...args) => {
    statements++
    return execute.apply(client, args)
  }
  client.batch = (...args) => {
    statements += Array.isArray(args[0]) ? args[0].length : 1
    return batch.apply(client, args)
  }
  try {
    const members = await teamMembers(event, teamId, { mapped: true })
    return { statements, mapped: members.filter(member => member.source === 'mapped').map(member => member.userId) }
  }
  finally {
    client.execute = execute
    client.batch = batch
  }
})
