// Build-time utils, safe to import from another module's `setup()` (no `@nuxt/kit` import).
export { extendDashboard, getDashboardItems } from './dashboard'
export { dashboardArea, resolveDashboardRegistry } from '../shared/registry'
export {
  applyLayout,
  emptyLayout,
  filterByPlatform,
  hideItem,
  isOnPlatform,
  moveItem,
  normalizeLayout,
  orderItems,
  resetLayout,
  setItemSettings,
  showItem,
  toggleCollapsed,
} from '../shared/layout'
export type {
  DashboardItem,
  DashboardItemCondition,
  DashboardLayout,
  DashboardPlatform,
  DashboardRegistryEntry,
} from '../../types'
