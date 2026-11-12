import { noContent } from '@frigear-nu/module-kit/server'
import { secretParams } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await authorize(event, 'forms:credentials')
  const { id, key } = await getValidatedRouterParams(event, secretParams.parse)
  const form = await findFormById(id)
  await deleteFormSecret(form.id, key)
  return noContent(event)
})
