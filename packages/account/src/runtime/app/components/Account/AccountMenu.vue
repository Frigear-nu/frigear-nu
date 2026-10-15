<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MenuItem } from '@frigear-nu/menu'

/**
 * The signed-in user's menu: who is signed in, the `account.dropdown` menu (account, admin, sign out), and the
 * colour mode under Appearance. The entry for the area you are in is left out. `block` renders it as a full-width
 * row for a sidebar footer (the admin shell), `collapsed` shrinks that row to the avatar.
 */
const props = defineProps<{ block?: boolean, collapsed?: boolean }>()

const t = useModuleT('account')
const { user } = useUserSession()
const route = useRoute()
const colorMode = useColorMode()
const { localize, strip } = useLocaleLink()

// `@frigear-nu/menu` is optional: without it only the user and Appearance are listed.
const dropdown = typeof useMenu === 'function' ? useMenu('account.dropdown').data : ref<MenuItem[]>([])

type SessionUser = { id?: string | number, name?: string | null, email?: string | null, avatar?: string | null, role?: string | null }
const sessionUser = computed(() => user.value as SessionUser | null)
const displayName = computed(() => sessionUser.value?.name || sessionUser.value?.email || String(sessionUser.value?.id ?? t('title', 'Account')))
const avatar = computed(() => ({ src: sessionUser.value?.avatar || undefined, alt: displayName.value }))
const role = computed(() => sessionUser.value?.role || undefined)
const roleLabel = computed(() => role.value && role.value !== 'user' ? role.value.charAt(0).toUpperCase() + role.value.slice(1) : undefined)

// Whether the route is the item's page or below it: no link to the area you are already in.
const isHere = (to: string) => {
  const target = strip(to)
  const current = strip(route.path)
  return current === target || (target !== '/' && current.startsWith(`${target}/`))
}

const toItem = (item: MenuItem): DropdownMenuItem => ({
  label: item.label,
  icon: item.icon,
  to: item.to && !item.external ? localize(item.to) : item.to,
  external: item.external,
  replace: item.external,
})

const appearance = (label: string, value: 'light' | 'dark' | 'system', icon: string): DropdownMenuItem => ({
  label,
  icon,
  type: 'checkbox',
  checked: colorMode.preference === value,
  onUpdateChecked: () => {
    colorMode.preference = value
  },
})

const items = computed<DropdownMenuItem[][]>(() => {
  // Items carrying `meta.roles` (e.g. the admin entry) are only for users holding one of those roles.
  const visible = (dropdown.value ?? []).filter((item) => {
    const roles = item.meta?.roles as string[] | undefined
    if (roles?.length && !(role.value && roles.includes(role.value))) return false
    return !item.to || item.external || !isHere(item.to)
  })
  // Sign out (order 99 and up) goes last, below Appearance.
  const last = (item: MenuItem) => (item.order ?? 0) >= 99

  return [
    sessionUser.value ? [{ type: 'label', label: displayName.value, slot: 'account' }] : [],
    visible.filter(item => !last(item)).map(toItem),
    [{
      label: t('appearance.label', 'Appearance'),
      icon: colorMode.preference === 'dark' ? 'i-lucide-moon' : colorMode.preference === 'light' ? 'i-lucide-sun' : 'i-lucide-monitor',
      children: [
        appearance(t('appearance.light', 'Light'), 'light', 'i-lucide-sun'),
        appearance(t('appearance.dark', 'Dark'), 'dark', 'i-lucide-moon'),
        appearance(t('appearance.system', 'System'), 'system', 'i-lucide-monitor'),
      ],
    }],
    visible.filter(last).map(toItem),
  ].filter(group => group.length) as DropdownMenuItem[][]
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: props.block ? 'start' : 'end', side: props.block ? 'top' : 'bottom', collisionPadding: 12 }"
    :ui="{ content: props.block && !props.collapsed ? 'w-(--reka-dropdown-menu-trigger-width) min-w-56' : 'w-56' }"
  >
    <UButton
      v-if="props.block"
      :label="props.collapsed ? undefined : displayName"
      :avatar="avatar"
      :trailing-icon="props.collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      :square="props.collapsed"
      :block="!props.collapsed"
      :aria-label="t('accountMenu', 'Account menu')"
      color="neutral"
      variant="ghost"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed ms-auto', label: 'truncate' }"
    />
    <UButton
      v-else
      :avatar="avatar"
      :aria-label="t('accountMenu', 'Account menu')"
      color="neutral"
      variant="ghost"
      square
      class="data-[state=open]:bg-elevated"
    />

    <template #account-label>
      <UUser
        :name="displayName"
        :avatar="avatar"
        size="sm"
        :ui="{ name: 'truncate', description: 'truncate' }"
      >
        <template
          v-if="roleLabel || (sessionUser?.name && sessionUser?.email)"
          #description
        >
          <span class="flex min-w-0 items-center gap-1.5">
            <UBadge
              v-if="roleLabel"
              size="xs"
              variant="subtle"
              :label="roleLabel"
            />
            <span
              v-if="sessionUser?.name && sessionUser?.email"
              class="truncate"
            >{{ sessionUser.email }}</span>
          </span>
        </template>
      </UUser>
    </template>
  </UDropdownMenu>
</template>
