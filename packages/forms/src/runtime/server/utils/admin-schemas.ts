import { z } from 'zod'
import { formDefinitionSchema } from '../../utils'

// `admin` is reserved: `/api/forms/admin/*` is the admin API.
const slug = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes.')
  .refine(value => value !== 'admin', 'This slug is reserved.')

const statusSchema = z.enum(['draft', 'published', 'archived'])

export const formInput = z.object({
  slug,
  name: z.string().min(1).max(200),
  status: statusSchema.default('draft'),
  definition: formDefinitionSchema,
})

// `status` is re-declared without a default: a default would reset it on every partial update.
export const formPatch = formInput.partial().extend({ status: statusSchema.optional() })

export const importInput = z.object({
  forms: z.array(formInput.extend({ status: statusSchema.optional() })).min(1).max(50),
})
