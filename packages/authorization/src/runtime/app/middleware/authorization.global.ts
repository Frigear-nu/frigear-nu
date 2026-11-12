import { evaluateRule, loginRedirect, normalizeAuthorizeMeta, resolveRule } from '../../utils'
import { useAuthorization } from '../composables/useAuthorization'
import { abortNavigation, createError, defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#imports'

// Runs for every navigation (SSR included). `definePageMeta({ authorize })` replaces the rule from `routeRules`;
// `authorize: false` opens the page. A `guest` rule is for signed-out visitors only; otherwise a signed-in visitor needs its `permission`.
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig().public.authorization
  const meta = to.meta.authorize
  const rule = meta !== undefined ? normalizeAuthorizeMeta(meta) : resolveRule(config?.routes, to.path, config?.exempt)
  if (!rule) return

  const authorization = useAuthorization()
  const access = await authorization.ensure()
  const response = evaluateRule(rule, !!access, permission => authorization.can(permission))
  if (response.authorized) return

  // Guests go to the sign-in page, which sends them back here (`?redirect=`) once signed in.
  if (response.statusCode === 401 && config?.redirectTo) {
    const target = loginRedirect(config.redirectTo, to.fullPath)
    return navigateTo(target, { external: typeof target === 'string' && /^https?:\/\//.test(target) })
  }
  return abortNavigation(createError({ statusCode: response.statusCode ?? 403, message: response.message }))
})
