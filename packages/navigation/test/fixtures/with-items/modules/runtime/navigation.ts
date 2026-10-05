import { defineNavigationFile } from '../../../../../src/runtime/utils/register'

export default defineNavigationFile((items) => {
  items.push({ title: 'Dashboard', to: '/', order: 1 })
  items.push({ title: 'Profile', to: '/profile', order: 2 })

  extendNavigationItem('account.menu', { title: 'Security', to: '/security' })
})
