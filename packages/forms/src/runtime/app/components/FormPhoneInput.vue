<script setup lang="ts">
import type { PhoneConfig } from '../../../types'
import { composePhone, countryName, defaultPhoneCountry, parsePhone, phoneCountries } from '../../utils'

const props = defineProps<{
  config?: PhoneConfig
  locale: string
  placeholder?: string
  /** Name of the country selector for assistive technology. */
  countryLabel: string
}>()
/** The single merged value, e.g. `+4512345678`. */
const model = defineModel<string | undefined>()

const country = ref(parsePhone(model.value ?? '', props.config).country)
const national = ref(parsePhone(model.value ?? '', props.config, country.value).national)

const countries = computed(() => phoneCountries(props.config))
const items = computed(() => countries.value.map(({ code, dial, flag }) => ({
  value: code,
  label: `${flag} ${countryName(code, props.locale)} (+${dial})`,
  short: `${flag} +${dial}`,
})))
const current = computed(() => items.value.find(item => item.value === country.value))

// Keep country and number in step with a value set from outside (preset answers, "send another").
watch(model, (value) => {
  if ((value ?? '') === composePhone(country.value, national.value)) return
  const parsed = parsePhone(value ?? '', props.config, country.value)
  country.value = parsed.country
  national.value = parsed.national
})

// The offered countries can change while editing a form in the builder.
watch(() => props.config, () => {
  if (!countries.value.some(item => item.code === country.value)) country.value = defaultPhoneCountry(props.config)
}, { deep: true })

watch([country, national], () => {
  model.value = composePhone(country.value, national.value) || undefined
})
</script>

<template>
  <UFieldGroup class="w-full">
    <USelectMenu
      v-model="country"
      :items="items"
      value-key="value"
      :search-input="{ placeholder: countryLabel }"
      :aria-label="countryLabel"
      :ui="{ base: 'w-28 shrink-0', content: 'min-w-72' }"
    >
      <template #default>
        <span class="truncate">{{ current?.short }}</span>
      </template>
    </USelectMenu>
    <UInput
      v-model="national"
      type="tel"
      inputmode="tel"
      autocomplete="tel-national"
      :placeholder="placeholder"
      class="w-full"
    />
  </UFieldGroup>
</template>
