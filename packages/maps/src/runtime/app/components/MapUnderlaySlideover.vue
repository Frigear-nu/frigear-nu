<script setup lang="ts">
import type { AdminMapDto } from '../../../types'
import { mapsApi } from '../../utils/api'
import { UNDERLAY_TYPES } from '../../utils/image'
import { $fetch, computed, ref, useAction, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'MapUnderlaySlideover' })

// Uploads a floor plan image under a plane map; closes with the updated map or `false`. The browser measures the image
// and the server checks the measure against the file.
const props = defineProps<{ map: AdminMapDto }>()
const emit = defineEmits<{ close: [saved: AdminMapDto | false] }>()

const t = useModuleT('maps')
const { busy, run } = useAction()
const maxBytes = Number(useRuntimeConfig().public.maps?.maxUnderlayBytes) || 10 * 1024 * 1024
const file = ref<File | null>(null)
const size = ref<{ width: number, height: number } | null>(null)
const problem = ref<string | null>(null)
const preview = ref<string | null>(null)
const canSave = computed(() => !!file.value && !!size.value && !problem.value)

async function pick(value: File | File[] | null | undefined) {
  const picked = Array.isArray(value) ? value[0] : value
  file.value = picked ?? null
  size.value = null
  problem.value = null
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = null
  if (!picked) return
  if (!(UNDERLAY_TYPES as readonly string[]).includes(picked.type)) {
    problem.value = t('admin.underlayType', 'Choose a PNG, JPEG or WebP image.')
    return
  }
  if (picked.size > maxBytes) {
    problem.value = t('admin.underlayTooLarge', 'The image is larger than {size}.', { size: `${Math.round(maxBytes / 1024 / 1024)} MB` })
    return
  }
  preview.value = URL.createObjectURL(picked)
  const image = new Image()
  image.src = preview.value
  await image.decode().catch(() => undefined)
  if (!image.naturalWidth || !image.naturalHeight) {
    problem.value = t('admin.underlayUnreadable', 'The image could not be read.')
    return
  }
  size.value = { width: image.naturalWidth, height: image.naturalHeight }
}

async function save() {
  if (!file.value || !size.value) return
  const body = new FormData()
  body.append('file', file.value)
  body.append('width', String(size.value.width))
  body.append('height', String(size.value.height))
  const saved = await run(
    () => $fetch<AdminMapDto>(mapsApi.admin.underlay(props.map.id), { method: 'POST', body }),
    { success: t('admin.underlaySaved', 'Floor plan uploaded') },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="map-underlay-form"
    :title="t('admin.underlayUploadTitle', 'Upload floor plan')"
    :description="t('admin.underlayDescription', 'The image is placed under the map, one plan unit per pixel. Drawn features keep their positions.')"
    :submit-label="t('admin.underlayAction', 'Upload floor plan')"
    :loading="busy"
    :disabled="!canSave"
    @close="emit('close', false)"
  >
    <form
      id="map-underlay-form"
      class="flex flex-col gap-4"
      @submit.prevent="save"
    >
      <UFormField
        name="file"
        :label="t('admin.underlayFile', 'Image')"
        :description="t('admin.underlayHelp', 'PNG, JPEG or WebP, at most {size}.', { size: `${Math.round(maxBytes / 1024 / 1024)} MB` })"
        :error="problem ?? undefined"
        required
      >
        <UFileUpload
          accept="image/png,image/jpeg,image/webp"
          class="min-h-40 w-full"
          :label="t('admin.underlayDrop', 'Drop an image here')"
          @update:model-value="pick"
        />
      </UFormField>
      <p
        v-if="size && file"
        class="text-sm text-muted"
      >
        {{ t('admin.underlaySize', '{width} × {height} pixels, {bytes}', { width: size.width, height: size.height, bytes: `${Math.round(file.size / 1024)} kB` }) }}
      </p>
    </form>
  </FormSlideover>
</template>
