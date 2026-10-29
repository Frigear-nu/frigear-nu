import { created } from '@frigear-nu/module-kit/server'
import type { FormAdminDto } from '../../../../types'
import { formInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event): Promise<FormAdminDto> => {
  await formsStaff.require(event)
  const input = await readValidatedBody(event, formInput.parse)
  return created(event, toAdminForm(await createForm(input)))
})
