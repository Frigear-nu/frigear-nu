<script setup lang="ts">
import type { HelpChecklistDto } from '../../../types'
import { computed, useHelpCenterPaths, useHelpCenterTranslate, useModuleT } from '#imports'

defineOptions({ name: 'HelpCenterChecklistCard' })

// One onboarding checklist with the viewer's progress: the articles to read, which are read, and a link to each.
const props = defineProps<{ checklist: HelpChecklistDto }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const paths = useHelpCenterPaths()

const total = computed(() => props.checklist.requiredCount)
const percent = computed(() => total.value ? Math.round((props.checklist.requiredReadCount / total.value) * 100) : 100)
</script>

<template>
  <SectionCard
    :title="tr(checklist.name)"
    icon="i-lucide-list-checks"
    :description="checklist.completed
      ? t('checklist.done', 'You have read everything on this list')
      : t('checklist.progress', '{read} of {total} required articles read', { read: checklist.requiredReadCount, total })"
  >
    <div
      class="flex flex-col gap-4"
      data-test="help-center-checklist"
    >
      <UProgress
        :model-value="percent"
        :max="100"
        size="sm"
        :color="checklist.completed ? 'success' : 'primary'"
        :aria-label="tr(checklist.name)"
      />
      <ul class="flex flex-col divide-y divide-default">
        <li
          v-for="item in checklist.items"
          :key="item.articleId"
        >
          <NuxtLink
            :to="paths.signedIn.article(item.article.categorySlug, item.article.slug)"
            class="hover:bg-elevated -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5"
            :data-read="item.read ? 'true' : 'false'"
          >
            <UIcon
              :name="item.read ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              class="size-5 shrink-0"
              :class="item.read ? 'text-success' : 'text-muted'"
            />
            <span class="text-default min-w-0 flex-1 truncate text-sm">{{ tr(item.article.title) }}</span>
            <UBadge
              v-if="!item.required"
              variant="subtle"
              color="neutral"
              :label="t('checklist.optional', 'Optional')"
            />
          </NuxtLink>
        </li>
      </ul>
    </div>
  </SectionCard>
</template>
