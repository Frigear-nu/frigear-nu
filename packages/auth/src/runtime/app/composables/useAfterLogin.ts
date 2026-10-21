import { isAppPage } from '../utils/after-login'

/**
 * Where to send the user once signed in: the `?redirect=` of the current page when it is a same-origin absolute path
 * (never `//host` or full URLs), else `authentication.settings.afterLogin`.
 */
export const useAfterLogin = () => {
  const route = useRoute()
  const router = useRouter()
  const fallback = useRuntimeConfig().public.authentication?.afterLogin || '/'
  const requested = computed(() => {
    const target = route.query.redirect
    return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : undefined
  })
  const target = computed(() => requested.value ?? fallback)
  // App pages navigate client-side (a full page load flashes the unstyled page). Targets like `/oauth/authorize?...`
  // are server routes, so they need a full page navigation.
  const go = () => navigateTo(target.value, { external: !isAppPage(router.resolve(target.value).matched) })
  return { target, requested, go }
}
