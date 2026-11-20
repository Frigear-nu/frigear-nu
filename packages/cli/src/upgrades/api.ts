import { DOCS, type Migration } from '../upgrade/migrate.ts'

/**
 * auth 0.3.0 provides `$api` (and the auto-imported `useApi`) itself: an app plugin that also provides `api` makes every
 * SSR page answer 500 (`Cannot redefine property: $api`).
 */
export const authApi: Migration = {
  id: 'auth-api',
  package: '@frigear-nu/auth',
  since: '0.3.0',
  title: 'auth provides $api and useApi',
  docs: `${DOCS}/modules/identity/auth`,
  rules: [
    {
      pattern: /\bprovide\s*:\s*\{[^}]*\bapi\b|\bprovide\(\s*['"]api['"]/g,
      message: 'auth already provides `$api` (a `$fetch` that sends the session or access token): two plugins providing `api` fail every SSR page with `Cannot redefine property: $api`. Remove this plugin and use auth\'s `$api` / `useApi()`, or provide it under another name.',
      files: /(?<!\/server)\/plugins\//,
    },
    {
      pattern: /\bexport\s+(?:const|function|async\s+function)\s+useApi\b/g,
      message: 'auth auto-imports its own `useApi()`: this one shadows it (Nuxt warns about the duplicate import). Remove it, or rename it if it does something else.',
      files: /(?<!\/server)\/(?:composables|utils)\//,
    },
  ],
}
