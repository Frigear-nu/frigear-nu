// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).

const BASE = '/api/dashboard'

/** The dashboard API (with `@frigear-nu/preferences` and `@frigear-nu/auth` installed). */
export const dashboardApi = {
  me: {
    /**
     * `GET` the caller's layouts (`{ layouts: { [dashboard]: DashboardLayout } }`); `PATCH { layouts: { [dashboard]:
     * DashboardLayout | null } }` replaces (or with `null` removes) the layouts it names, keeps the others, and answers
     * like the `GET`. `dashboard:layouts`: a session, or a token given it. Only ever the caller's own.
     */
    layouts: `${BASE}/me/layouts`,
  },
} as const
