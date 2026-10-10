import { defineEventHandler, createError, getRequestURL } from 'h3'
import { evaluateRules, matchingRules } from '../../utils'
import { abilities } from '#authorization/abilities'
import resolveServerUser from '#authorization/server-resolver'
import { useRuntimeConfig } from '#imports'

// Applies `authorization.routes` to API requests. Pages are gated by the app route middleware,
// which also runs during SSR.
export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/api/')) return

  const rules = matchingRules(useRuntimeConfig(event).public.authorization?.routes, pathname)
  if (!rules.length) return

  const response = await evaluateRules(rules, await resolveServerUser(event), abilities)
  if (!response.authorized) {
    throw createError({ statusCode: response.statusCode ?? 403, message: response.message })
  }
})
