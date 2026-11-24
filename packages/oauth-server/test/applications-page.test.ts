import { describe, expect, it } from 'vitest'
import { ACCOUNT_APPLICATIONS_PATH, resolveApplicationsPage } from '../src/applications-page'
import { oauthDashboardItems } from '../src/runtime/dashboard'

// The fixture has no `@frigear-nu/dashboard`, so where the page lands with the hub is checked here, without a build.
describe('resolveApplicationsPage (settings.pages.applications)', () => {
  it('is off unless turned on', () => {
    expect(resolveApplicationsPage(undefined, '/dashboard')).toEqual({ path: undefined, menu: 'account', redirectFrom: undefined })
    expect(resolveApplicationsPage(false, undefined).path).toBeUndefined()
  })

  it('stays in the account without the hub', () => {
    expect(resolveApplicationsPage(true, undefined)).toEqual({ path: ACCOUNT_APPLICATIONS_PATH, menu: 'account', redirectFrom: undefined })
  })

  it('moves `true` into the hub, listed in its menu, and redirects the old address', () => {
    expect(resolveApplicationsPage(true, '/dashboard')).toEqual({ path: '/dashboard/apps', menu: 'dashboard', redirectFrom: ACCOUNT_APPLICATIONS_PATH })
    expect(resolveApplicationsPage(true, '/me')).toMatchObject({ path: '/me/apps', menu: 'dashboard' })
  })

  it('keeps an explicit path, in the hub menu only when it is below the hub, and never redirects', () => {
    expect(resolveApplicationsPage('/account/applications', '/dashboard')).toEqual({ path: '/account/applications', menu: 'account', redirectFrom: undefined })
    expect(resolveApplicationsPage('/dashboard/my-apps', '/dashboard')).toEqual({ path: '/dashboard/my-apps', menu: 'dashboard', redirectFrom: undefined })
    expect(resolveApplicationsPage('/apps', undefined)).toEqual({ path: '/apps', menu: 'account', redirectFrom: undefined })
  })
})

describe('oauthDashboardItems', () => {
  it('adds "Your apps" first, across the grid, on the web, for every signed-in user (oauth:read is implicit), only once they have apps', () => {
    const [item, ...rest] = oauthDashboardItems(path => `/abs/${path}`)
    expect(rest).toEqual([])
    expect(item).toMatchObject({
      id: 'oauth-server.apps',
      component: '/abs/./runtime/app/dashboard/OAuthAppsWidget.vue',
      titleKey: 'oauthServer.dashboard.apps',
      order: 5,
      span: 4,
      platforms: ['web'],
      optional: true,
      permission: 'oauth:read',
    })
  })
})
