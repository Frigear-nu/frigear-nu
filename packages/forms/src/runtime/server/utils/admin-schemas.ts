import { z } from 'zod'
import { idParams } from '@frigear-nu/module-kit/server'
import { formDefinitionSchema } from '../../utils'
import { isFormSecretKey } from './secrets'

// `admin` stays reserved: it used to be the admin API prefix (`/api/forms/admin/*`), so a form named `admin`
// would be reachable at URLs old clients still call.
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

/** Router params of the public routes (`/api/forms/:slug`). */
export const slugParams = idParams('slug')

/** Router params of `/api/admin/forms/:id/secrets/:key`; an unknown key is a 400. */
export const secretParams = idParams().extend({ key: z.string().refine(isFormSecretKey, 'Unknown secret key.') })
