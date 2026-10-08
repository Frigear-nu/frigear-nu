<script setup lang="ts">
import type { TicketTypeDto } from '../../../types'
import { formatPrice, translate } from '../../utils'

const props = defineProps<{
  ticketTypes: TicketTypeDto[]
  loggedIn: boolean
  loading?: boolean
}>()
const emit = defineEmits<{ purchase: [ticketTypeId: string, addonIds: string[]] }>()

const locale = useEventsLocale()
const selectedId = ref<string>()
// Group id -> chosen addon ids.
const chosen = ref<Record<string, string[]>>({})

const selected = computed(() => props.ticketTypes.find(type => type.id === selectedId.value))
watch(() => props.ticketTypes, (types) => {
  if (!selectedId.value || !types.some(type => type.id === selectedId.value)) {
    selectedId.value = (types.find(type => type.isDefault && isAvailable(type)) ?? types.find(isAvailable))?.id
  }
}, { immediate: true })
watch(selectedId, () => {
  chosen.value = {}
})

function isAvailable(type: TicketTypeDto) {
  return type.saleState === 'open' && !type.blocked
}

const reason = (type: TicketTypeDto) => {
  if (type.saleState === 'sold_out') return 'Sold out'
  if (type.saleState === 'not_started') return 'Sales not started'
  if (type.saleState === 'ended') return 'Sales ended'
  if (type.blocked === 'membership_required') return 'Members only'
  if (type.blocked === 'limit_reached') return 'Already booked'
  return null
}

const addonIds = computed(() => Object.values(chosen.value).flat())
const missingRequired = computed(() => selected.value?.addonGroups.some(group => group.required && !(chosen.value[group.id]?.length)) ?? false)
const total = computed(() => (selected.value?.price ?? 0) + (selected.value?.addonGroups ?? []).flatMap(group => group.addons).filter(addon => addonIds.value.includes(addon.id)).reduce((sum, addon) => sum + addon.price, 0))

function toggle(groupId: string, addonId: string, multiple: boolean) {
  const current = chosen.value[groupId] ?? []
  chosen.value = {
    ...chosen.value,
    [groupId]: multiple
      ? (current.includes(addonId) ? current.filter(id => id !== addonId) : [...current, addonId])
      : [addonId],
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <button
      v-for="type in ticketTypes"
      :key="type.id"
      type="button"
      class="rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
      :class="selectedId === type.id ? 'border-primary ring-1 ring-primary' : 'border-default'"
      :disabled="!isAvailable(type)"
      @click="selectedId = type.id"
    >
      <div class="flex items-center gap-2">
        <span class="font-medium">{{ translate(type.name, locale) }}</span>
        <UBadge
          v-if="reason(type)"
          color="neutral"
          variant="subtle"
        >
          {{ reason(type) }}
        </UBadge>
        <UBadge
          v-else-if="type.remaining !== null && type.remaining <= 10"
          color="warning"
          variant="subtle"
        >
          {{ type.remaining }} left
        </UBadge>
        <span
          v-if="!type.hidePrice"
          class="ml-auto"
        >{{ type.price === 0 ? 'Free' : formatPrice(type.price, type.currency, locale) }}</span>
      </div>
      <p
        v-if="type.description"
        class="mt-1 text-sm text-muted"
      >
        {{ translate(type.description, locale) }}
      </p>
    </button>

    <fieldset
      v-for="group in selected?.addonGroups ?? []"
      :key="group.id"
      class="flex flex-col gap-2"
    >
      <legend class="mb-1 font-medium">
        {{ translate(group.title, locale) }}<span
          v-if="group.required"
          class="text-error"
        > *</span>
      </legend>
      <button
        v-for="addon in group.addons"
        :key="addon.id"
        type="button"
        class="flex items-center gap-2 rounded-md border p-3 text-left disabled:opacity-60"
        :class="chosen[group.id]?.includes(addon.id) ? 'border-primary ring-1 ring-primary' : 'border-default'"
        :disabled="addon.soldOut"
        @click="toggle(group.id, addon.id, group.multiple)"
      >
        <span>{{ translate(addon.label, locale) }}</span>
        <UBadge
          v-if="addon.soldOut"
          color="neutral"
          variant="subtle"
        >
          Sold out
        </UBadge>
        <span class="ml-auto text-sm">{{ addon.price === 0 ? 'Included' : `+ ${formatPrice(addon.price, selected!.currency, locale)}` }}</span>
      </button>
    </fieldset>

    <UButton
      v-if="loggedIn"
      size="lg"
      block
      :loading="loading"
      :disabled="!selected || !isAvailable(selected) || missingRequired"
      @click="emit('purchase', selected!.id, addonIds)"
    >
      {{ total === 0 ? 'Get free ticket' : `Buy ticket · ${formatPrice(total, selected?.currency ?? 'DKK', locale)}` }}
    </UButton>
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      title="Sign in to get a ticket."
    />
  </div>
</template>
