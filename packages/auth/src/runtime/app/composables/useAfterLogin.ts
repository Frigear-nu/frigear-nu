/**
 * Where to send the user once signed in: the `?redirect=` of the current page when it is a same-origin absolute path
 * (never `//host` or full URLs), else `authentication.settings.afterLogin`.
 */
export const useAfterLogin = () => {
  const route = useRoute()
  const fallback = useRuntimeConfig().public.authentication?.afterLogin || '/'
  const requested = computed(() => {
    const target = route.query.redirect
    return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : undefined
  })
  const target = computed(() => requested.value ?? fallback)
  // Targets like `/oauth/authorize?...` are server routes, so they need a full page navigation.
  const go = () => navigateTo(target.value, { external: target.value !== '/' })
  return { target, requested, go }
}
