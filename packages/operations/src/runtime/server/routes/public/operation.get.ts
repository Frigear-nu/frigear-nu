import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'
import type { OperationDto } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

// One operation by its URL name. Public ones for everyone; any other only for those who take part in it and for staff
// (the policy of `operations:read`), and everybody else gets the same 404 as for an unknown name.
export default defineEventHandler(async (event): Promise<OperationDto> => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  const row = await findOperationBySlug(slug)
  if (!row) throw notFound('Operation not found.')
  if (row.public) return toOperationDto(row)

  const principal = await allows(event, operationsAccess.permissions.read) ? await getAuth(event) : null
  if (!principal || !(await allows(event, operationsAccess.permissions.read, row))) throw notFound('Operation not found.')
  return toOperationDto(row)
})
