import { defineMenuSource } from '../../../../../src/runtime/utils/menu'

export default defineMenuSource((items) => {
  items.push({ label: 'Profile', to: '/profile', order: 2 })

  extendMenuItem('dashboard.more', { label: 'Security', to: '/security' })
})
