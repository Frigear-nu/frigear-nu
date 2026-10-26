import { evaluateRule, loginRedirect, normalizeAuthorizeMeta, resolveRule } from '../../utils'
import { abilities } from '#build/authorization/abilities.mjs'
import resolveClientUser from '#build/authorization/client-resolver.mjs'
import { abortNavigation, createError, defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#imports'

// Runs for every navigation (SSR included). `definePageMeta({ authorize })` replaces the rule from
// `routeRules[path].authorization`.
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig().public.authorization
  const meta = to.meta.authorize
  const rule = meta ? normalizeAuthorizeMeta(meta) : resolveRule(config?.routes, to.path)
  if (!rule) return

  const user = await resolveClientUser()
  const response = await evaluateRule(rule, user, abilities)
  if (response.authorized) return

  // Guests go to the sign-in page, which sends them back here (`?redirect=`) once signed in.
  if (response.statusCode === 401 && config?.redirectTo) {
    const target = loginRedirect(config.redirectTo, to.fullPath)
    return navigateTo(target, { external: typeof target === 'string' && /^https?:\/\//.test(target) })
  }
  return abortNavigation(createError({ statusCode: response.statusCode ?? 403, message: response.message }))
})
