import { UNDERLAY_TYPES } from '../../../../../src/runtime/utils'
import type { UnderlayType } from '../../../../../src/runtime/utils'

// Serves an underlay the playground stored. A module serves only the pathname it saved on its own record.
export default defineEventHandler((event) => {
  const pathname = decodeURIComponent(getRouterParam(event, 'pathname') ?? '')
  const extension = pathname.split('.').pop()
  const contentType = UNDERLAY_TYPES.find(type => type.endsWith(extension === 'jpg' ? 'jpeg' : extension ?? '')) as UnderlayType | undefined
  return serveMapUnderlay(event, contentType ? { pathname, contentType } : null, { cache: 'public' })
})
