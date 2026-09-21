<script setup lang="ts">
import { fromCents, toCents } from '#shared/utils/money.ts'
import { useCurrencies } from '~/store/queries/system.ts'

type Currency = {
  name?: string
  code: string
  symbol: string
}

type MoneyValue = {
  currency: Currency['code']
  amount: number | null | undefined
}

const model = defineModel<MoneyValue>({
  default: () => ({ currency: 'EUR', amount: 0 }),
})

const amount = defineModel<number | null | undefined>('amount', {
  get: () => fromCents(model.value?.amount),
  set: newValue => model.value = { ...model.value, amount: toCents(newValue) },
})

const currencyCode = defineModel<string>('currency', {
  get: () => model.value?.currency || 'EUR',
  set: newValue => model.value = { ...model.value, currency: newValue },
})

const { data: currencies, status } = useCurrencies()

const code = computed(() => currencyCode.value || 'USD')
</script>

<template>
  <UFieldGroup class="w-full">
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
    >
      <span class="size-5 w-9 flex items-center text-lg">
        {{ code }}
      </span>

      <template #item-label="{ item }">
        {{ item.code }} ({{ item.symbol }})
      </template>
    </USelectMenu>

    <UInputNumber
      v-model="amount"
      class="w-full"
      placeholder="0.00"
      :step="1.0"
      :step-snapping="false"
      :style="{ '--dial-code-length': `${code.length + 1.5}ch` }"
      :ui="{
        base: 'ps-(--dial-code-length)',
      }"
      :format-options="{
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }"
    />
  </UFieldGroup>
</template>
