<script setup lang="ts">
import { renderMarkdown, withMdcData } from '../../markdown'
import { computed, ref, resolveComponent, useUiT } from '#imports'

const props = defineProps<{
  placeholder?: string
  rows?: number
  required?: boolean
  disabled?: boolean
  /** Show the Write / Preview toggle. */
  preview?: boolean
  /** Render with MDC (Nuxt Content components like `::callout`) when the host app provides it. */
  mdc?: boolean
  /** Variables for `{{ name }}` in MDC previews. */
  mdcData?: Record<string, unknown>
}>()
const model = defineModel<string>()

const t = useUiT('markdown')
const previewing = ref(false)
// `resolveComponent` returns the bare name when the host has no MDC; fall back to the safe renderer.
const MdcComponent = resolveComponent('MDC')
const useMdc = computed(() => props.mdc && typeof MdcComponent !== 'string')
const html = computed(() => renderMarkdown(model.value ?? ''))
</script>

<template>
  <div class="min-w-0 space-y-1">
    <div
      v-if="props.preview"
      class="flex justify-end gap-1"
    >
      <UButton
        size="xs"
        color="neutral"
        :variant="previewing ? 'ghost' : 'subtle'"
        :label="t('write', 'Write')"
        @click="previewing = false"
      />
      <UButton
        size="xs"
        color="neutral"
        :variant="previewing ? 'subtle' : 'ghost'"
        icon="i-lucide-eye"
        :label="t('preview', 'Preview')"
        @click="previewing = true"
      />
    </div>
    <!-- eslint-disable vue/no-v-html -- renderMarkdown escapes all input -->
    <div
      v-if="props.preview && previewing"
      class="prose prose-sm min-h-16 max-w-none rounded-md border border-default p-2 text-muted"
      :style="{ minHeight: `${(props.rows ?? 4) * 1.5}rem` }"
    >
      <span
        v-if="!model?.trim()"
        class="italic"
      >{{ t('empty', 'Nothing to preview') }}</span>
      <component
        :is="MdcComponent"
        v-else-if="useMdc"
        :value="withMdcData(model, mdcData)"
      />
      <div
        v-else
        v-html="html"
      />
    </div>
    <UTextarea
      v-else
      v-model="model"
      :placeholder="placeholder"
      :rows="rows"
      :required="required"
      :disabled="disabled"
      class="w-full"
    />
    <!-- eslint-enable vue/no-v-html -->
  </div>
</template>
