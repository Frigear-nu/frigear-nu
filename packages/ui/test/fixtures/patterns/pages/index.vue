<script setup lang="ts">
defineOptions({ name: 'PatternsPage' })

const tabs = [
  { label: 'Overview', to: '/', icon: 'i-lucide-info' },
  { label: 'Other', to: '/other' },
]
const menu = [[{ label: 'Open' }], [{ label: 'Delete event', color: 'error' as const }]]
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      title="Spring meetup"
      description="Patterns fixture"
      :breadcrumb="[{ label: 'Events', to: '/events' }, { label: 'Spring meetup' }]"
    >
      <template #actions>
        <RowMenu
          :items="menu"
          subject="Spring meetup"
        />
      </template>
    </PageHeading>
    <PageTabs :items="tabs" />
    <PageSectionSwitcher
      :items="[{ label: 'Overview', to: '/', icon: 'i-lucide-info', active: true }, { label: 'Other', to: '/other' }]"
      label="Event sections"
    />
    <SectionCard title="Key facts">
      <DescriptionList :items="[{ label: 'Venue', value: 'Copenhagen' }, { label: 'Capacity', value: null }]" />
    </SectionCard>
    <RowMenu :items="menu" />
  </div>
</template>
