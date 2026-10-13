import type { H3Event } from 'h3'

/** Where the sign-in page lives (`authentication.settings.pages.login`), `/login` when the host did not set one. */
export function getLoginPath(event?: H3Event) {
  return useRuntimeConfig(event).public.authentication?.pages?.login || '/login'
}
