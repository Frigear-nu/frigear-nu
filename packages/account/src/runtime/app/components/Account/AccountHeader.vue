<script setup lang="ts">
// The heading of an account page, rendered by the `account` layout. The title is the page's `title` meta, else the
// account menu item the route belongs to (so pages other modules add get their label), else "Account". A page hides
// it with `definePageMeta({ heading: false })`; the document title is set either way. `AccountHeaderRight` fills the
// actions, override it in the host app to show other details.
const t = useModuleT('account')
const route = useRoute()
const { current } = await useAccountNav()

const title = computed(() => {
  const meta = route.meta.title
  return (typeof meta === 'string' && meta) || current.value?.label || t('title', 'Account')
})
const description = computed(() => current.value?.description)

useHead({ title })
</script>

<template>
  <PageHeading
    v-if="route.meta.heading !== false"
    :title="title"
    :description="description"
  >
    <template #actions>
      <AccountHeaderRight />
    </template>
  </PageHeading>
</template>
