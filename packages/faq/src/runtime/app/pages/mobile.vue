<script setup lang="ts">
import { computed, resolveComponent, toFaqCardProps, useFaq, useFaqSearch, useFaqTranslate, useModuleT, useSeoMeta } from '#imports'

defineOptions({ name: 'FaqMobilePage' })

// The FAQ tab of the mobile app (`faq.settings.mobileTab: true` with `@frigear-nu/mobile`): every group the signed-in
// person may read as cards, with a search over the questions and answers above them.
// MDC comes from the host app (Nuxt Content); resolves to a plain string name when absent.
const hasMdc = typeof resolveComponent('MDC') !== 'string'
const t = useModuleT('faq')
const tr = useFaqTranslate()
useSeoMeta({ title: () => t('mobile.title', 'FAQ') })

const { groups, status } = useFaq()
const { q, results, status: searching } = useFaqSearch()
const cards = computed(() => groups.value.map(toFaqCardProps))
const searched = computed(() => q.value.trim().length >= 2)
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <UInput
      v-model="q"
      icon="i-lucide-search"
      :loading="searching === 'pending'"
      :placeholder="t('mobile.search', 'Search the FAQ')"
      :aria-label="t('mobile.search', 'Search the FAQ')"
      class="w-full"
    />

    <template v-if="searched">
      <UEmpty
        v-if="searching !== 'pending' && !results.length"
        variant="naked"
        icon="i-lucide-search"
        :title="t('mobile.noResults', 'Nothing matches your search')"
      />
      <UPageCard
        v-for="result in results"
        :key="result.item.id"
        :title="tr(result.item.question)"
        :description="tr(result.group.title)"
      >
        <MDC
          v-if="hasMdc"
          :value="tr(result.item.answer)"
          unwrap
        />
        <p
          v-else
          class="text-muted whitespace-pre-line text-sm"
        >
          {{ tr(result.item.answer) }}
        </p>
      </UPageCard>
    </template>
    <template v-else>
      <template v-if="status === 'pending' && !cards.length">
        <USkeleton
          v-for="n in 2"
          :key="n"
          class="h-40"
        />
      </template>
      <UEmpty
        v-else-if="!cards.length"
        variant="naked"
        icon="i-lucide-message-circle-question-mark"
        :title="t('mobile.empty', 'No questions yet')"
      />
      <template v-else>
        <FaqCard
          v-for="(card, index) in cards"
          :key="index"
          v-bind="card"
        />
      </template>
    </template>
  </div>
</template>
