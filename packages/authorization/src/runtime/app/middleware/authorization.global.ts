import { evaluateRules, matchingRules, normalizeAuthorizeMeta } from '../../utils'
import { abilities } from '#build/authorization/abilities.mjs'
import resolveClientUser from '#build/authorization/client-resolver.mjs'
import { abortNavigation, createError, defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#imports'

// Runs for every navigation (SSR included). `definePageMeta({ authorize })` replaces the
// `authorization.routes` rules that match the same path.
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig().public.authorization
  const meta = to.meta.authorize
  const rules = meta ? [normalizeAuthorizeMeta(meta)] : matchingRules(config?.routes, to.path)
  if (!rules.length) return

  const user = await resolveClientUser()
  const response = await evaluateRules(rules, user, abilities)
  if (response.authorized) return

  if (response.statusCode === 401 && config?.redirectTo) {
    return navigateTo(config.redirectTo)
  }
  return abortNavigation(createError({ statusCode: response.statusCode ?? 403, message: response.message }))
})
