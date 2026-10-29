import { idParams } from '@frigear-nu/module-kit/server'
import type { FormAdminDto } from '../../../../types'
import { formPatch } from '../../utils/admin-schemas'

export default defineEventHandler(async (event): Promise<FormAdminDto> => {
  await formsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, formPatch.parse)
  return toAdminForm(await patchForm(id, input))
})
