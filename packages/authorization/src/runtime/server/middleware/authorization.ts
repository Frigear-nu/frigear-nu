import { defineEventHandler, createError, getRequestURL } from 'h3'
import { evaluateRule, resolveRule } from '../../utils'
import { abilities } from '#authorization/abilities'
import resolveServerUser from '#authorization/server-resolver'
import { useRuntimeConfig } from '#imports'

// Applies `routeRules[...].authorization` to API requests. Pages are gated by the app route middleware,
// which also runs during SSR.
export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/api/')) return

  const rule = resolveRule(useRuntimeConfig(event).public.authorization?.routes, pathname)
  if (!rule) return

  const response = await evaluateRule(rule, await resolveServerUser(event), abilities)
  if (!response.authorized) {
    throw createError({ statusCode: response.statusCode ?? 403, message: response.message })
  }
})
