<script setup lang="ts">
const t = useModuleT('events')
const { grouped } = await useEvents()
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
  <UContainer class="py-8 sm:py-12">
    <div class="mb-10 space-y-2 text-center">
      <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-5xl">
        {{ t('title', 'Events') }}
      </h1>
    </div>
    <p
      v-if="!sections.length"
      class="text-center text-muted"
    >
      {{ t('empty', 'There are no events right now.') }}
    </p>
    <section
      v-for="section in sections"
      :key="section.title"
      class="mb-12"
    >
      <h2 class="mb-4 text-xl font-semibold tracking-tight text-highlighted">
        {{ section.title }}
      </h2>
      <div class="grid gap-6 md:grid-cols-2">
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
