import type { DashboardLayout } from '../../../../src/types'

// Seeds this request's layout of `crew.home` from the `x-test-layout` header (JSON), standing in for a user's saved
// `dashboardLayouts` preference.
export default defineNuxtPlugin(() => {
  const header = useRequestHeaders(['x-test-layout'])['x-test-layout']
  if (!header) return
  const layouts = useState<Record<string, DashboardLayout>>('dashboard:layouts', () => ({}))
  layouts.value = { ...layouts.value, 'crew.home': JSON.parse(header) as DashboardLayout }
})
