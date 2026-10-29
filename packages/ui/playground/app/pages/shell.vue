<script setup lang="ts">
definePageMeta({ layout: 'shell' })
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      title="Overview"
      description="A page inside AppShell: the navbar shows the area and section, the page renders the only h1."
    />
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Members"
        value="128"
        icon="i-lucide-users"
      />
      <StatCard
        label="Events"
        value="6"
        icon="i-lucide-calendar"
      />
    </div>
    <SectionCard
      title="About the shell"
      description="Collapse the sidebar, resize it, or narrow the window to open it as a slideover."
    >
      <p class="text-sm text-muted">
        Pass <code>wide</code> (or <code>definePageMeta({ wide: true })</code>) for a full-width body.
      </p>
    </SectionCard>
  </div>
</template>
