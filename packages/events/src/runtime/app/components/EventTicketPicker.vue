<script setup lang="ts">
import type { TicketTypeDto } from '../../../types'
import { withMdcData } from '@frigear-nu/ui/markdown'
import { DEFAULT_CURRENCY, ticketMdcData } from '../../utils'
import { computed, ref, resolveComponent, useEventsTranslate, useFormat, useModuleT, watch } from '#imports'

const props = defineProps<{
  ticketTypes: TicketTypeDto[]
  loggedIn: boolean
  loading?: boolean
}>()
const emit = defineEmits<{ purchase: [ticketTypeId: string, addonIds: string[]] }>()

const t = useModuleT('events')
const format = useFormat()
// MDC comes from the host app (Nuxt Content); resolves to a plain string name when absent.
const hasMdc = typeof resolveComponent('MDC') !== 'string'
const tr = useEventsTranslate()
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
  if (type.saleState === 'sold_out') return t('picker.soldOut', 'Sold out')
  if (type.saleState === 'not_started') return t('picker.notStarted', 'Sales not started')
  if (type.saleState === 'ended') return t('picker.ended', 'Sales ended')
  if (type.blocked === 'membership_required') return t('picker.membersOnly', 'Members only')
  if (type.blocked === 'membership_excluded') return t('picker.notForMembers', 'Not for members')
  if (type.blocked === 'limit_reached') return t('picker.booked', 'Already booked')
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
    <p
      v-if="!ticketTypes.length"
      class="text-sm text-muted"
    >
      {{ t('picker.noTickets', 'No tickets are available for this event.') }}
    </p>
    <button
      v-for="type in ticketTypes"
      :key="type.id"
      type="button"
      class="rounded-xl border p-4 text-left transition hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
      :class="selectedId === type.id ? 'border-primary ring-1 ring-primary' : 'border-default'"
      :disabled="!isAvailable(type)"
      @click="selectedId = type.id"
    >
      <div class="flex items-center gap-2">
        <span class="font-medium">{{ tr(type.name) }}</span>
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
          {{ type.remaining }} {{ t('picker.left', 'left') }}
        </UBadge>
        <span
          v-if="!type.hidePrice"
          class="ml-auto font-bold text-primary"
        >{{ type.price === 0 ? t('picker.free', 'Free') : format.money(type.price, type.currency) }}</span>
      </div>
      <div
        v-if="type.description"
        class="mt-1 text-sm text-muted"
      >
        <MDC
          v-if="hasMdc"
          :value="withMdcData(tr(type.description), ticketMdcData(type, tr(type.name), format.locale.value))"
          class="prose prose-sm max-w-none text-muted"
        />
        <template v-else>
          {{ tr(type.description) }}
        </template>
      </div>
    </button>

    <fieldset
      v-for="group in selected?.addonGroups ?? []"
      :key="group.id"
      class="flex flex-col gap-2"
    >
      <legend class="mb-1 font-medium">
        {{ tr(group.title) }}<span
          v-if="group.required"
          class="text-error"
        > *</span>
      </legend>
      <button
        v-for="addon in group.addons"
        :key="addon.id"
        type="button"
        class="flex items-center gap-2 rounded-lg border p-3 text-left disabled:opacity-60"
        :class="chosen[group.id]?.includes(addon.id) ? 'border-primary ring-1 ring-primary' : 'border-default'"
        :disabled="addon.soldOut"
        @click="toggle(group.id, addon.id, group.multiple)"
      >
        <span>{{ tr(addon.label) }}</span>
        <UBadge
          v-if="addon.soldOut"
          color="neutral"
          variant="subtle"
        >
          {{ t('picker.soldOut', 'Sold out') }}
        </UBadge>
        <span class="ml-auto text-sm">{{ addon.price === 0 ? t('picker.included', 'Included') : `+ ${format.money(addon.price, selected!.currency)}` }}</span>
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
      {{ total === 0 ? t('picker.getFree', 'Get free ticket') : `${t('picker.buy', 'Buy ticket')} · ${format.money(total, selected?.currency ?? DEFAULT_CURRENCY)}` }}
    </UButton>
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      :title="t('picker.signIn', 'Sign in to get a ticket.')"
    />
  </div>
</template>
