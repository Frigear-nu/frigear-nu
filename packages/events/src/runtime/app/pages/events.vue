<script setup lang="ts">
const t = useModuleT('events')
const { grouped, status } = useEvents()
const pages = useRuntimeConfig().public.events?.pages
const eventTo = (slug: string) => (pages?.event || '/events/:slug').replace(':slug', encodeURIComponent(slug))
const sections = computed(() => [
  { title: t('ongoing.title', 'Happening now'), events: grouped.value.ongoing },
  { title: t('upcoming.title', 'Upcoming'), events: grouped.value.upcoming },
  { title: t('past.title', 'Past events'), events: grouped.value.past },
].filter(section => section.events.length))

defineOptions({ name: 'EventsListPage' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      :title="t('title', 'Events')"
      :ui="{ title: 'text-3xl sm:text-4xl' }"
      class="mb-8"
    />
    <p
      v-if="status === 'success' && !sections.length"
      class="text-muted"
    >
      {{ t('empty', 'There are no events right now.') }}
    </p>
    <section
      v-for="section in sections"
      :key="section.title"
      class="mb-10"
    >
      <h2 class="mb-3 text-lg font-medium">
        {{ section.title }}
      </h2>
      <div class="grid gap-4 md:grid-cols-2">
        <EventCard
          v-for="item in section.events"
          :key="item.id"
          :event="item"
          :to="eventTo(item.slug)"
        />
      </div>
    </section>
  </UContainer>
</template>
