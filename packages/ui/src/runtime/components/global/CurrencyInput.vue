<script setup lang="ts">
import { useCurrencies } from '~/store/queries/system'

const currencyCode = defineModel<string>({ default: 'EUR' })

const { data: currencies, status } = useCurrencies()
const currency = computed(() => currencies.value?.find(c => c.code === currencyCode.value))

function onOpen() {
  // ...
}
</script>

<template>
  <USelectMenu
    v-model="currencyCode"
    :items="currencies"
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
