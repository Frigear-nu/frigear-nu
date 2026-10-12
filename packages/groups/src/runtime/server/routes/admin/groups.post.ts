import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { newId } from '../../../utils'
import { groupInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireGroupsManager(event)
  const input = await readValidatedBody(event, groupInput.parse)

  const [existing] = await db.select({ id: schema.userGroups.id }).from(schema.userGroups).where(eq(schema.userGroups.slug, input.slug)).limit(1)
  if (existing) throw createError({ statusCode: 409, statusMessage: 'A group with this slug already exists.' })

  const [row] = await db.insert(schema.userGroups).values({
    id: newId('grp'),
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    icon: input.icon ?? null,
  }).returning()
  setResponseStatus(event, 201)
  return toGroupDto(row!, 0)
})
