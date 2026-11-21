<script setup lang="ts">
import { defineAsyncComponent, ref, useModuleT } from '#imports'

defineOptions({ name: 'ShiftQrScanner' })

// The camera of the check-in scanner (`vue-qrcode-reader`, loaded in the browser only). Emits `detect` with the code
// of each QR code read, and pauses while the page handles it (`paused`). Without a camera (or permission) it says so;
// the page always offers manual entry too.
defineProps<{ paused?: boolean }>()
const emit = defineEmits<{ detect: [code: string] }>()

const t = useModuleT('shifts')
const QrcodeStream = defineAsyncComponent(() => import('vue-qrcode-reader').then(module => module.QrcodeStream))
const failure = ref<string | null>(null)

function onDetect(codes: Array<{ rawValue: string }>) {
  const code = codes[0]?.rawValue?.trim()
  if (code) emit('detect', code)
}

function onError(error: Error) {
  failure.value = error.name === 'NotAllowedError'
    ? t('scanner.noPermission', 'The camera is not allowed. Allow it in the browser, or type the code.')
    : error.name === 'NotFoundError' || error.name === 'OverconstrainedError'
      ? t('scanner.noCamera', 'No camera found. Type the code instead.')
      : t('scanner.cameraFailed', 'The camera could not start. Type the code instead.')
}
</script>

<template>
  <ClientOnly>
    <UAlert
      v-if="failure"
      color="warning"
      variant="subtle"
      icon="i-lucide-camera-off"
      :title="failure"
    />
    <div
      v-else
      class="border-default aspect-square w-full overflow-hidden rounded-lg border"
    >
      <QrcodeStream
        :paused="paused"
        :formats="['qr_code']"
        @detect="onDetect"
        @error="onError"
      />
    </div>
    <template #fallback>
      <USkeleton class="aspect-square w-full" />
    </template>
  </ClientOnly>
</template>
