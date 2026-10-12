<script setup lang="ts">
const t = useModuleT('account')
const keys = { profile: 'profile', security: 'security', documents: 'documents', idCode: 'identificationCode' } as const
const route = useRoute()
const { user } = useUserSession()
const pages = useRuntimeConfig().public.account?.pages

// Which sub-page we are on, derived from the configured paths so custom paths keep working.
const section = computed(() => {
  const path = route.path.replace(/\/+$/, '') || '/'
  const match = (['profile', 'security', 'documents', 'idCode'] as const).find(key => pages?.[key] === path)
  return match
})

const title = computed(() => section.value ? t(`${keys[section.value]}.title`, 'Account') : t('title', 'Account'))
const description = computed(() => section.value ? t(`${keys[section.value]}.description`, '') || undefined : undefined)
</script>

<template>
  <UContainer>
    <UPageHeader
      :title="title"
      :description="description"
      :ui="{ wrapper: 'flex-row items-center justify-between gap-4', description: 'mt-2' }"
    >
      <UButton
        v-if="section && pages?.index"
        variant="link"
        icon="i-lucide-arrow-left"
        :to="pages.index"
        :label="t('backTo', 'Back to account')"
        class="-ml-3 mt-2"
      />

      <template #links>
        <div
          v-if="user"
          class="flex flex-col"
        >
          <div class="text-sm text-muted">
            {{ t('signedInAs', 'Signed in as') }}
          </div>
          <div class="text-primary">
            {{ user.email }}
          </div>
          <div class="mt-1 flex justify-end">
            <UBadge variant="soft">
              Frigear ID: <code>{{ user.id }}</code>
            </UBadge>
          </div>
        </div>
      </template>
    </UPageHeader>
  </UContainer>
</template>
