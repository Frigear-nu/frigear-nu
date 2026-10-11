<script setup lang="ts">
defineOptions({ name: 'AdminLayout' })

const t = useModuleT('admin')
const route = useRoute()
const { data: items } = await useMenu('admin.nav')

const links = computed(() => (items.value ?? []).map(item => ({
  label: item.label,
  description: item.description,
  icon: item.icon,
  to: item.to,
  external: item.external,
  active: !!item.to && (route.path === item.to || route.path.startsWith(`${item.to}/`)),
})))
</script>

<template>
  <UContainer class="py-6">
    <div class="grid gap-6 md:grid-cols-[14rem_1fr]">
      <aside>
        <p class="text-muted mb-2 text-xs font-medium uppercase">
          {{ t('title', 'Administration') }}
        </p>
        <UNavigationMenu
          orientation="vertical"
          :items="links"
          :aria-label="t('nav.label', 'Admin navigation')"
        />
      </aside>
      <main class="min-w-0">
        <slot />
      </main>
    </div>
  </UContainer>
</template>
