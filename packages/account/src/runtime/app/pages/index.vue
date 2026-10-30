<script setup lang="ts">
import { computed, resolveComponent, useAccountNav, useLocaleLink, useModuleT, useRuntimeConfig, useUserSession } from '#imports'

defineOptions({ name: 'AccountIndexPage' })

const t = useModuleT('account')
const { user } = useUserSession()
const { localize } = useLocaleLink()
const { items } = await useAccountNav()
const index = useRuntimeConfig().public.account?.pages?.index

// `@frigear-nu/widget` is optional: the widget area only renders when it is installed.
const WidgetArea = resolveComponent('WidgetArea')
const widgetArea = typeof WidgetArea === 'string' ? undefined : WidgetArea

const shortcuts = computed(() => items.value.filter(item => item.to !== index))

const profile = computed(() => {
  const value = user.value as { name?: string | null, email?: string | null, avatar?: string | null } | null
  const name = value?.name || value?.email || t('title', 'Account')
  return { name, email: value?.email ?? undefined, avatar: { src: value?.avatar || undefined, alt: name } }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <AccountHeader />

    <SectionCard>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <UUser
          :name="profile.name"
          :description="profile.email"
          :avatar="profile.avatar"
          size="lg"
          :ui="{ name: 'truncate', description: 'truncate' }"
        />
        <AccountIdentity />
      </div>
    </SectionCard>

    <component
      :is="widgetArea"
      v-if="widgetArea"
      name="account.overview"
      :context="{ user }"
      grid-class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    />

    <ListCard
      :title="t('overview.shortcuts', 'Your account')"
      :is-empty="!shortcuts.length"
      :empty="t('overview.empty', 'Nothing here yet.')"
    >
      <li
        v-for="item in shortcuts"
        :key="item.id"
      >
        <NuxtLink
          :to="item.external ? item.to : localize(item.to)"
          :external="item.external"
          class="group flex items-center gap-3"
        >
          <UIcon
            v-if="item.icon"
            :name="item.icon"
            class="size-5 shrink-0 text-muted"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-highlighted group-hover:text-primary">{{ item.label }}</span>
            <span
              v-if="item.description"
              class="block truncate text-muted"
            >{{ item.description }}</span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-dimmed"
          />
        </NuxtLink>
      </li>
    </ListCard>
  </div>
</template>
