<script setup lang="ts">
const { grouped, status } = useEvents()
const pages = useRuntimeConfig().public.events?.pages
const eventTo = (slug: string) => (pages?.event || '/events/:slug').replace(':slug', encodeURIComponent(slug))
const sections = computed(() => [
  { title: 'Happening now', events: grouped.value.ongoing },
  { title: 'Upcoming', events: grouped.value.upcoming },
  { title: 'Past events', events: grouped.value.past },
].filter(section => section.events.length))

defineOptions({ name: 'EventsListPage' })
</script>

<template>
  <UContainer class="py-10">
    <h1 class="mb-6 text-2xl font-semibold">
      Events
    </h1>
    <p
      v-if="status === 'success' && !sections.length"
      class="text-muted"
    >
      There are no events right now.
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
