// Test only: the route rules the build ended up with (crew's `guardPages` on its home page).
export default defineEventHandler(() => {
  const config = useRuntimeConfig() as { nitro?: { routeRules?: Record<string, unknown> } }
  return config.nitro?.routeRules ?? {}
})
