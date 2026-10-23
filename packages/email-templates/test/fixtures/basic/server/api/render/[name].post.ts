import type { EmailTemplateName } from '../../../../../../src/runtime/types'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') as EmailTemplateName
  return renderEmailTemplate(name, await readBody(event))
})
