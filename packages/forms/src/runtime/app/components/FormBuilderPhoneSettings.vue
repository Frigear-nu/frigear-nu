<script setup lang="ts">
import type { FormField } from '../../../types'
import { allPhoneCountries, countryName, defaultPhoneCountry, phoneCountries } from '../../utils'
import { useFormsLocale } from '../composables/useForms'
import { computed, useModuleT } from '#imports'

// Phone input settings of a selected `tel` field: a single input, or a country code picker with an allow-list.
const props = defineProps<{ field: FormField }>()
const emit = defineEmits<{ patch: [patch: Partial<FormField>] }>()

const t = useModuleT('forms')
const locale = useFormsLocale()

const modeItems = computed(() => [
  { value: 'simple', label: t('builder.phoneSimple', 'Single input') },
  { value: 'country', label: t('builder.phoneCountry', 'Country code + number') },
])
const countryItems = computed(() => allPhoneCountries.map(({ code, dial, flag }) => ({
  value: code,
  label: `${flag} ${countryName(code, locale.value)} (+${dial})`,
})))
const offeredCountries = computed(() => new Set(phoneCountries(props.field.phone).map(country => country.code)))

function patchPhone(patch: Partial<NonNullable<FormField['phone']>>) {
  const next = Object.fromEntries(Object.entries({ ...props.field.phone, ...patch }).filter(([, value]) => value !== undefined))
  // Drop a default country that the narrowed allow-list no longer offers.
  const countries = next.countries as string[] | undefined
  if (countries && next.defaultCountry && !countries.includes(next.defaultCountry as string)) delete next.defaultCountry
  emit('patch', { phone: Object.keys(next).length ? next : undefined })
}

function setMode(mode: 'simple' | 'country') {
  emit('patch', { phone: mode === 'country' ? { ...props.field.phone, mode } : undefined })
}
</script>

<template>
  <UFormField :label="t('builder.phoneMode', 'Phone input')">
    <USelect
      :model-value="field.phone?.mode ?? 'simple'"
      :items="modeItems"
      class="w-full"
      @update:model-value="setMode($event as 'simple' | 'country')"
    />
  </UFormField>
  <template v-if="field.phone?.mode === 'country'">
    <UFormField
      :label="t('builder.phoneCountries', 'Allowed countries')"
      :description="t('builder.phoneCountriesHint', 'Leave empty to allow all countries.')"
    >
      <USelectMenu
        :model-value="field.phone?.countries ?? []"
        :items="countryItems"
        value-key="value"
        multiple
        class="w-full"
        @update:model-value="patchPhone({ countries: ($event as string[]).length ? $event as string[] : undefined })"
      />
    </UFormField>
    <UFormField :label="t('builder.phoneDefaultCountry', 'Default country')">
      <USelectMenu
        :model-value="defaultPhoneCountry(field.phone)"
        :items="countryItems.filter(item => offeredCountries.has(item.value))"
        value-key="value"
        class="w-full"
        @update:model-value="patchPhone({ defaultCountry: $event as string })"
      />
    </UFormField>
  </template>
</template>
