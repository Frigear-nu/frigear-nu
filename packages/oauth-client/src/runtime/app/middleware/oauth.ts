import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig } from '#imports'
import { isPublicPath } from '../../utils'
import { useOAuthState } from '../utils/state'

// Global. With `protect: 'all'` every page needs a signed-in user except the public ones; with `protect: 'none'`
// only pages with `definePageMeta({ oauth: true })`. Tokens live in the browser, so it only decides on the client.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  const config = useRuntimeConfig().public.oauthClient
  const required = to.meta.oauth ?? config.protect === 'all'
  if (!required) return
  if (isPublicPath(to.path, [...config.publicPaths, config.redirect.login, config.callbackPath])) return
  if (useOAuthState().status.value === 'signed-in') return
  return navigateTo({ path: config.redirect.login, query: { redirect: to.fullPath } })
})
