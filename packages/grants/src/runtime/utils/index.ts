// Build-time and framework-free helpers, safe to import from a Nuxt module's own `setup()`, tests and app code.
export { extendGrants, registeredGrantKinds } from './extend'
export * from './core'
export type { GrantFieldMeta, GrantKindRegistration } from '../../types'
