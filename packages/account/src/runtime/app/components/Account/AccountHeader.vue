<script setup lang="ts">
// The heading of an account page, rendered by the page itself as the first child of its root: a `PageHeading` filled
// from the account navigation. The title is the page's `title` meta, else the account menu item the route belongs to
// (the longest matching path, so `/account/membership/success` still reads "Membership"), else "Account"; the
// description comes from the same item. `#actions` is passed through to the heading. It also sets the document title,
// which wins over the shell's default (the active nav label) when a page's `title` meta differs from it.
defineSlots<{ actions?: () => unknown }>()

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
    :title="title"
    :description="description"
  >
    <template
      v-if="$slots.actions"
      #actions
    >
      <slot name="actions" />
    </template>
  </PageHeading>
</template>
