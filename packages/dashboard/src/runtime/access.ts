import { defineAccess } from '@frigear-nu/auth/access'

// What the dashboard module adds to access control, registered in `module.ts` (`registerAccess`) when Preferences and
// Auth are installed (the layouts are a `managed` preference).
export const dashboardAccess = defineAccess('dashboard', {
  permissions: {
    // Self-service: every signed-in user holds it, and may delegate it to an API token or an OAuth access token. The
    // routes only ever act on the caller (`/api/dashboard/me/...`), so no policy is needed.
    layouts: {
      label: 'Your dashboard layouts',
      description: 'See and change the order, hidden and collapsed items of your dashboards.',
      implicit: true,
    },
  },
})
