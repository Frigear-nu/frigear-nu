<script setup lang="ts">
// The scanner's camera. On a device the native scanner of @capacitor/barcode-scanner: a full-screen camera that reads one
// QR code and closes, opened with the button (again for the next code). In a browser (`pnpm dev`) the camera stream of
// @frigear-nu/shifts' ShiftQrScanner (`vue-qrcode-reader`), which keeps reading while the page shows each result.
// Emits `detect` with each code read; the page ignores repeats and pauses while it checks one (`paused`).
const props = defineProps<{ paused?: boolean }>()
const emit = defineEmits<{ detect: [code: string] }>()

const { t } = useI18n()
const { isNative } = useCapacitor()
const showError = useErrorToast()
const scanning = ref(false)

// The plugin's error codes (`OS-PLUG-BARC-0006`, `0007`): the user closed the scanner, or denied the camera.
const errorCode = (error: unknown) => (error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '')

async function scan() {
  if (scanning.value || props.paused) return
  scanning.value = true
  try {
    const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner')
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      scanInstructions: t('app.wallet.scan.instructions'),
      cancelButtonAccessibilityLabel: t('app.wallet.scan.cancel'),
      torchButtonOnAccessibilityLabel: t('app.wallet.scan.torchOff'),
      torchButtonOffAccessibilityLabel: t('app.wallet.scan.torchOn'),
    })
    const code = result.ScanResult?.trim()
    if (code) emit('detect', code)
  }
  catch (error) {
    const code = errorCode(error)
    if (code.endsWith('0006')) return
    showError(error, code.endsWith('0007') ? t('app.wallet.scan.noPermission') : t('app.wallet.scan.cameraFailed'))
  }
  finally {
    scanning.value = false
  }
}

defineExpose({ scan })
</script>

<template>
  <UButton
    v-if="isNative"
    :label="t('app.wallet.scan.scanCode')"
    icon="i-lucide-scan-line"
    size="xl"
    block
    :loading="scanning || paused"
    data-scan-native
    @click="scan"
  />
  <ShiftQrScanner
    v-else
    :paused="paused"
    @detect="code => emit('detect', code)"
  />
</template>
