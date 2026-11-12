import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { addPermission, addRoleRequirement } from '@frigear-nu/auth/utils'

// The fixture app's own permissions and role requirement, as a host or module registers them.
export default defineNuxtModule({
  meta: { name: 'fixture-access' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addPermission(nuxt,
      { name: 'admin:access', label: 'Open the admin' },
      { name: 'reports:read', label: 'Read reports' },
      { name: 'reports:write', label: 'Write reports' },
      { name: 'member-area:view', label: 'See the member area' },
    )
    addRoleRequirement(nuxt, { name: 'verified', path: resolver.resolve('../server/requirements/verified') })
  },
})
