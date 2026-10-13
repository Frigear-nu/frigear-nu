/** Where the sign-in and registration pages live (`authentication.settings.pages`), with the default login path. */
export const useAuthPages = () => {
  const pages = useRuntimeConfig().public.authentication?.pages
  return { login: pages?.login || '/login', register: pages?.register }
}
