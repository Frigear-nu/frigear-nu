import { filterMenuItems } from '../../../../src/runtime/utils/menu'

// Stands in for `@frigear-nu/authorization`: the permissions come from the `x-test-permissions` header and
// `menus:filter` drops items whose `permission` is not among them. `access:version` is the counter the real plugin bumps.
export default defineNuxtPlugin((nuxtApp) => {
  const header = useRequestHeaders(['x-test-permissions'])['x-test-permissions']
  const permissions = useState<string[]>('test:permissions', () => header ? header.split(',') : [])
  nuxtApp.hook('menus:filter', (ctx) => {
    ctx.items = filterMenuItems(ctx.items, item => !item.permission || permissions.value.includes(item.permission))
  })
})
