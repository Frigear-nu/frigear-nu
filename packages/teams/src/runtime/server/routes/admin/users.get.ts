import { db, schema } from '@nuxthub/db'
import { asc, or } from 'drizzle-orm'
import { likeContains } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { TeamUserLookupDto } from '../../../../types'

// Finds users to add as members (at most 20). Staff only. With `teams:pii` it matches the name or the email and
// answers with the emails; without it, it matches the name only, so the search cannot be used to probe addresses.
export default defineEventHandler(async (event): Promise<TeamUserLookupDto[]> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { q } = await getValidatedQuery(event, teamUserLookupQuery.parse)
  const pii = await allows(event, teamsAccess.permissions.pii)
  const rows = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, avatar: schema.users.avatar })
    .from(schema.users)
    .where(pii ? or(likeContains(schema.users.name, q), likeContains(schema.users.email, q)) : likeContains(schema.users.name, q))
    .orderBy(asc(schema.users.name))
    .limit(20)
  return rows.map(row => ({
    id: Number(row.id),
    name: row.name ?? null,
    avatar: row.avatar ?? null,
    ...(pii ? { email: row.email ?? null } : {}),
  }))
})
