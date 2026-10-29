import { db, schema } from '@nuxthub/db'
import { count, or } from 'drizzle-orm'
import { likeContains, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import { toApplication, toAdminApplicationDto } from '../../../utils/oauth-applications'

const querySchema = pageQuery({ sort: ['createdAt', 'name', 'priority'] })

// The applications, one page at a time; `q` searches the name and the client id.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const query = await getValidatedQuery(event, querySchema.parse)

  const table = schema.oauthApplications
  const where = query.q ? or(likeContains(table.name, query.q), likeContains(table.id, query.q)) : undefined
  const orderBy = orderByQuery({ createdAt: table.createdAt, name: table.name, priority: table.priority }, query, { tiebreaker: table.id })
  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(table).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(table).where(where),
  ])

  const grants = await countActiveGrants(rows.map(row => row.id))
  return paginate({
    total: totals?.total ?? 0,
    query,
    items: rows.map(row => toAdminApplicationDto(toApplication(row), grants[row.id] ?? 0)),
  })
})
