import { DOCS, type Migration } from '../upgrade/migrate.ts'

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
