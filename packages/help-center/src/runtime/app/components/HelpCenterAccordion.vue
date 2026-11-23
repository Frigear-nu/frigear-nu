<script setup lang="ts">
import type { HelpArticleDto } from '../../../types'
import { reactive, useHelpCenterTranslate, watch } from '#imports'

defineOptions({ name: 'HelpCenterAccordion' })

// The articles of an accordion category as questions whose text opens in place, with the article's icon and the buttons
// under it. `public` renders embedded FAQ components as anonymous visitors read them (see `HelpCenterArticleBody`).
// `open` names an article (by slug) to show open, such as the FAQ question a search result links to; each question has
// the id `faq-q-<slug>`.
const props = defineProps<{ articles: HelpArticleDto[], public?: boolean, open?: string }>()

const opened = reactive<Record<string, boolean>>({})
watch(() => props.open, (slug) => {
  if (slug) opened[slug] = true
}, { immediate: true })

const tr = useHelpCenterTranslate()
</script>

<template>
  <div
    class="flex flex-col gap-2"
    data-test="help-center-accordion"
  >
    <UCollapsible
      v-for="article in articles"
      :id="`faq-q-${article.slug}`"
      :key="article.id"
      v-model:open="opened[article.slug]"
      :unmount-on-hide="false"
      class="flex w-full flex-col gap-2"
    >
      <UButton
        block
        :icon="article.icon ?? undefined"
        class="group justify-between"
        trailing-icon="i-lucide-chevron-down"
        variant="subtle"
        color="neutral"
        :label="tr(article.title)"
        :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
      />
      <template #content>
        <div class="flex flex-col gap-4 px-1 pb-2">
          <HelpCenterArticleBody
            :body="tr(article.body)"
            :public="public"
          />
          <div
            v-if="article.links.length"
            class="flex flex-wrap gap-2"
          >
            <UButton
              v-for="(link, index) in article.links"
              :key="index"
              :label="link.label"
              :to="link.to"
              :icon="link.icon"
              variant="subtle"
              color="neutral"
              size="sm"
            />
          </div>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
