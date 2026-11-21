import { db, schema } from '@nuxthub/db'
import { asc, or } from 'drizzle-orm'
import { likeContains } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { TeamUserLookupDto } from '../../../../types'

// Finds users to add as members, by name or email (at most 20). Staff only; the emails are in the answer only for
// `teams:pii`, though the search matches them either way.
export default defineEventHandler(async (event): Promise<TeamUserLookupDto[]> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { q } = await getValidatedQuery(event, teamUserLookupQuery.parse)
  const pii = await allows(event, teamsAccess.permissions.pii)
  const rows = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, avatar: schema.users.avatar })
    .from(schema.users)
    .where(or(likeContains(schema.users.name, q), likeContains(schema.users.email, q)))
    .orderBy(asc(schema.users.name))
    .limit(20)
  return rows.map(row => ({
    id: Number(row.id),
    name: row.name ?? null,
    avatar: row.avatar ?? null,
    ...(pii ? { email: row.email ?? null } : {}),
  }))
})
