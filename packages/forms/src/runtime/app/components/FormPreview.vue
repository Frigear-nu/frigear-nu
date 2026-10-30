<script setup lang="ts">
import type { FormDefinition } from '../../../types'
import { PREVIEW_WIDTHS, previewScale } from '../../utils'
import type { PreviewDevice } from '../../utils'
import { computed, onBeforeUnmount, onMounted, ref, useCopyToClipboard, useFormsPaths, useModuleT, useTemplateRef, watch } from '#imports'

const props = defineProps<{
  slug: string
  name?: string
  /** `undefined` when the definition is invalid. */
  definition?: Omit<FormDefinition, 'delivery'>
  /** Bump to remount the renderer (e.g. after saving). */
  contentKey?: string | number
}>()

const t = useModuleT('forms')
const { copy: copyText } = useCopyToClipboard()
const paths = useFormsPaths()
const path = computed(() => paths('form', { slug: props.slug }))

const STORAGE_KEY = 'forms:preview-device'
const device = ref<PreviewDevice>('mobile')
onMounted(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'mobile' || stored === 'desktop') device.value = stored
  }
  catch { /* storage unavailable */ }
})
watch(device, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  }
  catch { /* storage unavailable */ }
})

const devices = computed(() => [
  { value: 'mobile' as const, label: t('preview.mobile', 'Mobile'), icon: 'i-lucide-smartphone' },
  { value: 'desktop' as const, label: t('preview.desktop', 'Desktop'), icon: 'i-lucide-monitor' },
])

const width = computed(() => PREVIEW_WIDTHS[device.value])
const renderKey = computed(() => `${props.contentKey ?? ''}-${props.definition ? JSON.stringify(props.definition).length : 'x'}`)

// Inline frame: render at the real width, then scale down to the available column.
const resetKey = ref(0)
const hostRef = useTemplateRef<HTMLElement>('hostRef')
const innerRef = useTemplateRef<HTMLElement>('innerRef')
const available = ref(0)
const innerHeight = ref(0)
const scale = computed(() => previewScale(available.value, width.value))

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(() => {
    available.value = hostRef.value?.clientWidth ?? 0
    innerHeight.value = innerRef.value?.offsetHeight ?? 0
  })
  if (hostRef.value) observer.observe(hostRef.value)
  if (innerRef.value) observer.observe(innerRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

// "Try it" modal: same renderer, but the end result is shown as JSON.
const open = ref(false)
const modalKey = ref(0)
const result = ref<Record<string, unknown> | null>(null)
const json = computed(() => JSON.stringify(result.value, null, 2))

function tryAgain() {
  result.value = null
  modalKey.value++
}
watch(open, (value) => {
  if (value) tryAgain()
})

const copy = () => copyText(json.value, t('preview.copied', 'Copied to clipboard.'))
</script>

<template>
  <div class="min-w-0 space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <UFieldGroup :aria-label="t('preview.device', 'Device')">
        <UButton
          v-for="item in devices"
          :key="item.value"
          size="xs"
          color="neutral"
          :variant="device === item.value ? 'solid' : 'outline'"
          :icon="item.icon"
          :label="item.label"
          :aria-pressed="device === item.value"
          @click="device = item.value"
        />
      </UFieldGroup>
      <div class="flex items-center gap-1">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-rotate-ccw"
          :label="t('preview.reset', 'Reset')"
          @click="resetKey++"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-maximize-2"
          :label="t('preview.tryIt', 'Try it')"
          :disabled="!definition"
          @click="open = true"
        />
      </div>
    </div>

    <div class="rounded-lg bg-elevated/50 p-3">
      <div
        :class="[
          'mx-auto overflow-hidden bg-default shadow-sm ring-1 ring-default',
          device === 'mobile' ? 'rounded-[1.75rem] border-[5px] border-inverted/80' : 'rounded-lg',
        ]"
        :style="{ width: `${Math.round(width * scale) + (device === 'mobile' ? 10 : 0)}px`, maxWidth: '100%' }"
      >
        <div
          v-if="device === 'desktop'"
          class="flex items-center gap-1.5 border-b border-default bg-elevated px-2 py-1.5"
        >
          <span class="size-2 rounded-full bg-error/70" />
          <span class="size-2 rounded-full bg-warning/70" />
          <span class="size-2 rounded-full bg-success/70" />
          <span class="ml-2 min-w-0 flex-1 truncate rounded bg-default px-2 py-0.5 text-[10px] text-muted">{{ path }}</span>
        </div>
        <div
          v-else
          class="mx-auto mt-1.5 h-1 w-10 rounded-full bg-inverted/20"
        />
        <div
          ref="hostRef"
          class="max-h-[calc(100vh-14rem)] overflow-y-auto overflow-x-hidden"
        >
          <div :style="{ height: `${innerHeight * scale}px` }">
            <div
              ref="innerRef"
              :style="{ width: `${width}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }"
            >
              <UContainer class="max-w-2xl py-10">
                <h1
                  v-if="name"
                  class="mb-6 text-3xl font-bold"
                >
                  {{ name }}
                </h1>
                <FormRenderer
                  v-if="definition"
                  :key="`${renderKey}-${resetKey}`"
                  :form="{ slug, definition }"
                  preview
                />
                <p
                  v-else
                  class="text-muted"
                >
                  {{ t('admin.previewUnavailable', 'Fix the definition to see a preview.') }}
                </p>
              </UContainer>
            </div>
          </div>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="open"
      :title="t('preview.tryIt', 'Try it')"
      :ui="{ content: 'max-w-5xl' }"
    >
      <template #actions>
        <UFieldGroup :aria-label="t('preview.device', 'Device')">
          <UButton
            v-for="item in devices"
            :key="item.value"
            size="xs"
            color="neutral"
            :variant="device === item.value ? 'solid' : 'outline'"
            :icon="item.icon"
            :label="item.label"
            @click="device = item.value"
          />
        </UFieldGroup>
      </template>
      <template #body>
        <div
          class="mx-auto max-w-full rounded-lg border border-default"
          :style="{ width: `${width}px` }"
        >
          <UContainer class="max-w-2xl py-8">
            <div
              v-if="result"
              class="space-y-3"
            >
              <h2 class="text-lg font-semibold">
                {{ t('preview.result', 'Result') }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('preview.resultHint', 'This is what would be sent. Nothing was submitted.') }}
              </p>
              <pre
                data-testid="preview-result"
                class="max-h-96 overflow-auto rounded-md bg-elevated p-3 text-xs"
              >{{ json }}</pre>
              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-copy"
                  :label="t('preview.copy', 'Copy')"
                  @click="copy"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-rotate-ccw"
                  :label="t('preview.tryAgain', 'Try again')"
                  @click="tryAgain"
                />
                <UButton
                  :label="t('preview.close', 'Close')"
                  @click="open = false"
                />
              </div>
            </div>
            <FormRenderer
              v-else-if="definition"
              :key="`${renderKey}-${modalKey}`"
              :form="{ slug, definition }"
              preview
              @previewed="result = $event"
            />
          </UContainer>
        </div>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-rotate-ccw"
          :label="t('preview.reset', 'Reset')"
          @click="tryAgain"
        />
      </template>
    </UModal>
  </div>
</template>
