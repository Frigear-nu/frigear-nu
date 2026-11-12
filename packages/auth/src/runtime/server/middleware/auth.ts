import { apiError, badRequest } from '@frigear-nu/module-kit/server'
import { exempt, rules } from '#auth/route-rules'
import { normalizeRequestPath, resolveAccessRouteRule } from '../../utils/route-rules'
import { resolveBearer, requireAuth, getAuth } from '../utils/auth'
import { authorize } from '../utils/access'

// Resolves bearer credentials early so `event.context.auth` is set for every handler, including other modules'
// middleware. Cookie sessions are resolved lazily by `getAuth`. Then enforces the access route rules of `/api/**`
// (`permission`, `authenticated`, `guest`), so they hold (fail closed) with or without `@frigear-nu/authorization`.
// Auth's anonymous entry points (`/api/auth/**`, `/api/_auth/**`) are exempt from less specific rules.
export default defineEventHandler(async (event) => {
  await resolveBearer(event)
  // Match the path the router dispatches on (`event.path`, percent-decoded by h3), never the raw URL, and refuse paths
  // a rule cannot be trusted to match (`%2F`, `\`, dot segments) under `/api`. `event.path` is already relative to
  // `app.baseURL`: Nitro mounts middleware at `<baseURL>/` and h3 strips that prefix, so it is not stripped again here
  // (that would let `/<base>/<base>/api/...` match as `/api/...`).
  const pathname = normalizeRequestPath(event.path)
  if (pathname === null) {
    if (/(?:^|\/)api(?:[/\\]|%2f|%5c|$)/i.test(event.path.split('?', 1)[0] ?? '')) throw badRequest('Invalid request path.')
    return
  }
  if (!pathname.startsWith('/api/')) return
  const rule = resolveAccessRouteRule(rules, pathname, exempt)
  if (!rule) return
  if (rule.guest) {
    if (await getAuth(event)) throw apiError(403, 'guest_only', 'Only for signed-out users.')
    return
  }
  if (typeof rule.permission === 'string') {
    await authorize(event, rule.permission)
    return
  }
  if (rule.authenticated) await requireAuth(event)
})
