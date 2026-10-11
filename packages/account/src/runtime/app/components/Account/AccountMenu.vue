<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { computedAsync } from '@vueuse/core'

const { user } = useUserSession()
const { data: dropdownItems } = useMenu('account.dropdown')

const getFirstLetter = (name: string | number) => {
  return String(typeof name === 'string' ? name.charAt(0)?.toUpperCase() : name)
}

const items = computedAsync<DropdownMenuItem[][]>(async (): Promise<DropdownMenuItem[][]> => {
  const items: DropdownMenuItem[][] = []
  // Push the top part...
  if (user.value) {
    items.push([
      {
        type: 'label',
        label: `${user.value.email || user.value.name || user.value.id}`,
        avatar: {
          text: getFirstLetter(user.value.email || user.value.name || user.value.id),
        },
        slot: 'label' as const,
      },
    ])
  }

  // Items carrying `meta.roles` (e.g. the admin entry) are only for users holding one of those roles.
  const role = (user.value as { role?: string } | null)?.role
  const visible = (dropdownItems.value ?? []).filter((item) => {
    const roles = item.meta?.roles as string[] | undefined
    return !roles?.length || (!!role && roles.includes(role))
  })

  items.push(visible.map(item => ({
    label: item.label,
    to: item.to,
    icon: item.icon,
    external: item.external,
    replace: item.external,
  }) as DropdownMenuItem))

  return items
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start' }"
    :ui="{ content: 'w-48' }"
  >
    <template #default>
      <UButton
        aria-label="Account Menu"
        color="neutral"
        variant="ghost"
        icon="i-lucide-user"
      />
    </template>
    <template #label="bindItem">
      <LazyUUser
        v-bind="bindItem.item as { avatar?: never }"
      >
        <template #name>
          <!--          <UBadge -->
          <!--            v-if="user && !userHasRole(user, 'user')" -->
          <!--            size="xs" -->
          <!--            variant="subtle" -->
          <!--          > -->
          <!--            {{ upperFirst(user.role) }} -->
          <!--          </UBadge> -->
          <div>{{ (bindItem.item as { label?: string })?.label }}</div>
        </template>
      </LazyUUser>
    </template>
  </UDropdownMenu>
</template>
