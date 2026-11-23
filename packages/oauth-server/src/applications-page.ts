import { isPathUnder, joinPagePath, resolvePagePath } from '@frigear-nu/module-kit/utils'

/** Where the user's applications were before the signed-in hub, and still are without it. */
export const ACCOUNT_APPLICATIONS_PATH = '/account/applications'

export interface ApplicationsPage {
  /** The page's path, `undefined` without the page. */
  path: string | undefined
  /** The menu it is listed in: the hub's `dashboard` menu when the page lives below the hub, else `account`. */
  menu: 'account' | 'dashboard'
  /** The old address to redirect to `path`: only when `true` put the page in the hub. */
  redirectFrom: string | undefined
}

/**
 * Where `settings.pages.applications` puts the user's applications: `true` is `<hub>/apps` when the signed-in hub of
 * `@frigear-nu/dashboard` is on (`hub` is its path, from `resolveDashboardHubPath`), else `/account/applications`; a
 * string is that path, listed in the hub's menu when it is below the hub.
 */
export function resolveApplicationsPage(setting: string | boolean | undefined, hub: string | undefined): ApplicationsPage {
  const path = resolvePagePath(setting, hub ? joinPagePath(hub, 'apps') : ACCOUNT_APPLICATIONS_PATH)
  return {
    path,
    menu: path && hub && isPathUnder(path, hub) ? 'dashboard' : 'account',
    redirectFrom: setting === true && path && path !== ACCOUNT_APPLICATIONS_PATH ? ACCOUNT_APPLICATIONS_PATH : undefined,
  }
}
