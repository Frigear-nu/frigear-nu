<script setup lang="ts">
defineOptions({ name: 'EventsListPage' })

const t = useModuleT('events')
const { grouped } = await useEvents()
const links = useEventLinks()
const sections = computed(() => [
  { title: t('ongoing.title', 'Happening now'), events: grouped.value.ongoing },
  { title: t('upcoming.title', 'Upcoming'), events: grouped.value.upcoming },
  { title: t('past.title', 'Past events'), events: grouped.value.past },
].filter(section => section.events.length))

useSeoMeta({ title: () => t('title', 'Events') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('title', 'Events')"
        :description="t('listDescription', 'Find an event and get your ticket.')"
      />
      <UPageBody>
        <UEmpty
          v-if="!sections.length"
          icon="i-lucide-calendar"
          :title="t('empty', 'There are no events right now.')"
        />
        <section
          v-for="section in sections"
          :key="section.title"
          class="space-y-4"
        >
          <h2 class="text-highlighted text-lg font-semibold">
            {{ section.title }}
          </h2>
          <div class="grid gap-6 md:grid-cols-2">
            <EventCard
              v-for="item in section.events"
              :key="item.id"
              :event="item"
              :to="links.event(item.slug)"
            />
          </div>
        </section>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
