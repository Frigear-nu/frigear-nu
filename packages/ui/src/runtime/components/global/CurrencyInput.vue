<script setup lang="ts">
import { currencyOptions } from '../../shared/money'
import type { Currency } from '../../shared/money'

const currencyCode = defineModel<string>({ default: 'EUR' })
// Defaults to every ISO currency the runtime knows; pass `currencies` to offer a shorter list.
const props = defineProps<{ currencies?: Currency[] }>()

const nuxtApp = useNuxtApp() as { $i18n?: { locale?: { value?: string } } }
const options = computed(() => props.currencies ?? currencyOptions(nuxtApp.$i18n?.locale?.value))
const status = 'success'
const currency = computed(() => options.value.find(c => c.code === currencyCode.value))

function onOpen() {
  // ...
}
</script>

<template>
  <USelectMenu
    v-model="currencyCode"
    :items="options"
    value-key="code"
    :search-input="{
      placeholder: 'Search currency...',
      icon: 'i-lucide-search',
      loading: status === 'pending',
    }"
    :filter-fields="['name', 'code', 'symbol']"
    :content="{ align: 'start' }"
    :ui="{
      base: 'pe-8',
      content: 'w-48',
      placeholder: 'hidden',
      trailingIcon: 'size-4',
    }"
    trailing-icon="i-lucide-chevrons-up-down"
    @update:open="onOpen"
  >
    <span class="size-5 w-8 flex items-center text-md">
      {{ currency?.code || '💰' }}
    </span>

    <template #item-label="{ item }">
      {{ item.code }} ({{ item.symbol }})
    </template>
  </USelectMenu>
</template>
