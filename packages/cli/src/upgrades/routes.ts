import { relative } from 'node:path'
import { DOCS, items, option, readNuxtConfigs, type Migration } from '../upgrade/migrate.ts'

const UPGRADING = `${DOCS}/get-started/upgrading`

/** auth 0.1.4 moved the caller's own resources under `/api/auth/me` and logout to `POST /api/auth/logout`. */
export const authRoutes: Migration = {
  id: 'auth-routes',
  package: '@frigear-nu/auth',
  since: '0.1.4',
  title: 'Auth API routes moved under /api/auth',
  docs: `${UPGRADING}#breaking-changes-by-release`,
  rules: [
    {
      pattern: /\/api\/auth\/tokens\b/g,
      replace: '/api/auth/me/tokens',
      message: '`/api/auth/tokens` is `/api/auth/me/tokens` (create answers 201, revoke 204). `authApi.me.tokens` from `@frigear-nu/auth/api` names it.',
    },
    {
      pattern: /\/api\/auth\/webauthn\/credentials\b/g,
      replace: '/api/auth/me/passkeys',
      message: '`/api/auth/webauthn/credentials` is `/api/auth/me/passkeys` (delete answers 204).',
    },
    {
      pattern: /\/api\/_bootstrap\b/g,
      replace: '/api/auth/bootstrap',
      message: '`/api/_bootstrap` is `/api/auth/bootstrap`.',
    },
    {
      pattern: /(['"`])\/auth\/logout\b/g,
      replace: '$1/api/auth/logout',
      message: 'Logout is `POST /api/auth/logout` now (204): a link or `navigateTo` to it must become `$fetch(authApi.logout, { method: \'POST\' })`, and a menu item needs `method: \'post\'`.',
    },
  ],
}

/** users 1.1.4 made the self-service routes REST: `PATCH /api/users/me`, `PUT /api/users/me/{email,password}`. */
export const usersRoutes: Migration = {
  id: 'users-routes',
  package: '@frigear-nu/users',
  since: '1.1.4',
  title: 'Users self-service routes are REST',
  docs: `${UPGRADING}#breaking-changes-by-release`,
  rules: [
    {
      pattern: /\/api\/users\/me\/profile\b/g,
      replace: '/api/users/me',
      message: 'The profile update is `PATCH /api/users/me` (was `POST …/me/profile`): change the method too. `usersApi.me` from `@frigear-nu/users/api` names it.',
    },
    {
      pattern: /\/api\/users\/me\/change-email\b/g,
      replace: '/api/users/me/email',
      message: 'The email change is `PUT /api/users/me/email` (was `POST …/me/change-email`): change the method too.',
    },
    {
      pattern: /\/api\/users\/me\/change-password\b/g,
      replace: '/api/users/me/password',
      message: 'The password change is `PUT /api/users/me/password` (was `POST …/me/change-password`): change the method too.',
    },
  ],
}

/**
 * events 0.6.0: with the signed-in hub of `@frigear-nu/dashboard`, `pages.tickets: true` is `/dashboard/tickets` (in the
 * hub's layout and `dashboard` menu) instead of `/account/tickets`, which redirects there. Crew, shifts and help-center
 * made the same move (`/dashboard/crew`, `/dashboard/help`) before their first release, so only events needs this.
 */
export const eventsTicketsPage: Migration = {
  id: 'events-tickets-page',
  package: '@frigear-nu/events',
  since: '0.6.0',
  title: 'The tickets page moved to /dashboard/tickets',
  docs: `${DOCS}/modules/features/events`,
  rules: [
    {
      pattern: /(['"`])\/account\/tickets\b/g,
      message: 'With `@frigear-nu/dashboard` installed (its hub on), the tickets page is `/dashboard/tickets`; `/account/tickets` only redirects there. Link with `useEventLinks().tickets()` instead of the path, which follows `events.settings.pages.tickets`.',
    },
  ],
  async project({ root, files }) {
    const manual: string[] = []
    for (const { file, options } of await readNuxtConfigs(files)) {
      if (option(options, 'events.settings.pages.tickets') !== true) continue
      const modules = items(option(options, 'modules'))
      if (!modules.includes('@frigear-nu/dashboard')) continue
      manual.push(`${relative(root, file)}: \`events.settings.pages.tickets: true\` is \`/dashboard/tickets\` now, listed in the hub's \`dashboard\` menu instead of the account menu. Set \`tickets: '/account/tickets'\` to keep it in the account.`)
    }
    return { manual }
  },
}

/**
 * oauth-server 0.9.0: with the signed-in hub of `@frigear-nu/dashboard`, `pages.applications: true` is
 * `/dashboard/apps` (in the hub's layout and `dashboard` menu) instead of `/account/applications`, which redirects there.
 */
export const oauthServerApplicationsPage: Migration = {
  id: 'oauth-server-applications-page',
  package: '@frigear-nu/oauth-server',
  since: '0.9.0',
  title: 'The applications page moved to /dashboard/apps',
  docs: `${DOCS}/modules/identity/oauth-server`,
  rules: [
    {
      pattern: /(['"`])\/account\/applications\b/g,
      message: 'With `@frigear-nu/dashboard` installed (its hub on), the applications page is `/dashboard/apps`; `/account/applications` only redirects there. Link with `useRuntimeConfig().public.oauthServer.pages.applications` instead of the path, which follows `oauthServer.settings.pages.applications`.',
    },
  ],
  async project({ root, files }) {
    const manual: string[] = []
    for (const { file, options } of await readNuxtConfigs(files)) {
      if (option(options, 'oauthServer.settings.pages.applications') !== true) continue
      const modules = items(option(options, 'modules'))
      if (!modules.includes('@frigear-nu/dashboard')) continue
      manual.push(`${relative(root, file)}: \`oauthServer.settings.pages.applications: true\` is \`/dashboard/apps\` now, listed in the hub's \`dashboard\` menu instead of the account menu. Set \`applications: '/account/applications'\` to keep it in the account.`)
    }
    return { manual }
  },
}
