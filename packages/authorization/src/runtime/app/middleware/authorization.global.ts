import { evaluateRule, normalizeAuthorizeMeta, resolveRule } from '../../utils'
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

  if (response.statusCode === 401 && config?.redirectTo) {
    return navigateTo(config.redirectTo)
  }
  return abortNavigation(createError({ statusCode: response.statusCode ?? 403, message: response.message }))
})
