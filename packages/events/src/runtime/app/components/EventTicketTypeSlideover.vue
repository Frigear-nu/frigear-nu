<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Translated } from '../../../types'
import { toCents, fromCents } from '@frigear-nu/ui/money'
import { DEFAULT_CURRENCY, eventsApi, ticketMdcData } from '../../utils'
import type { MembershipPlans, StaffTicketType } from '../utils/admin-event'

defineOptions({ name: 'EventTicketTypeSlideover' })

// Create/edit form of a ticket type, opened by `useEventCatalogActions().openTicketType(eventId, ticketType?)`:
// closes with the saved ticket type, or `false` when cancelled.
const props = defineProps<{
  /** The event a new ticket type is added to. */
  eventId: string
  /** The ticket type to edit; leave out to add one. */
  ticketType?: StaffTicketType
  /** Membership rules are only offered when @frigear-nu/subscriptions is installed (`enabled`). */
  membership?: MembershipPlans
}>()
const emit = defineEmits<{ close: [saved: { id: string } | false] }>()

const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
const { busy, run } = useAction()

type Membership = 'any' | string[] | null
type Rule = { mode: 'none' | 'any' | 'plans', plans: string[] }

const membershipEnabled = computed(() => props.membership?.enabled === true)
const plans = computed(() => props.membership?.plans ?? [])
const modes = computed(() => [
  { label: t('admin.ruleNone', 'Nobody'), value: 'none' },
  { label: t('admin.ruleAny', 'Any membership'), value: 'any' },
  { label: t('admin.rulePlans', 'Specific memberships'), value: 'plans' },
])
const toRule = (value: Membership | undefined): Rule => value === 'any' ? { mode: 'any', plans: [] } : Array.isArray(value) && value.length ? { mode: 'plans', plans: [...value] } : { mode: 'none', plans: [] }
const fromRule = (rule: Rule): Membership => rule.mode === 'any' ? 'any' : rule.mode === 'plans' && rule.plans.length ? [...rule.plans] : null

// Prices are stored in minor units (øre/cents) and edited in major units, in the ticket type's currency.
const currency = computed(() => props.ticketType?.currency ?? DEFAULT_CURRENCY)
const count = z.union([z.literal(''), z.null(), z.undefined(), z.coerce.number().int(t('admin.countInvalid', 'Enter a whole number of 0 or more.')).min(0, t('admin.countInvalid', 'Enter a whole number of 0 or more.'))])
  .transform(value => typeof value === 'number' ? value : null)

const schema = z.object({
  key: props.ticketType ? z.string().optional() : z.string().trim().min(1, t('admin.keyRequired', 'Enter a key.')).max(64),
  name: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.nameRequired', 'Enter a name.')),
  description: z.custom<Translated | undefined>().optional(),
  price: z.coerce.number().min(0, t('admin.priceInvalid', 'Enter a price of 0 or more.')),
  capacity: count,
  requires: z.custom<Rule>(),
  excludes: z.custom<Rule>(),
})
type Schema = z.output<typeof schema>

const state = reactive({
  key: props.ticketType?.key ?? '',
  name: props.ticketType?.name as Translated | undefined,
  description: (props.ticketType?.description ?? undefined) as Translated | undefined,
  price: (props.ticketType ? fromCents(props.ticketType.price, props.ticketType.currency) : 0) as number | string,
  capacity: (props.ticketType?.capacity ?? '') as number | string,
  requires: toRule(props.ticketType?.requiresMembership),
  excludes: toRule(props.ticketType?.excludesMembership),
})

const mdcData = computed(() => ticketMdcData({ ...state, price: toCents(Number(state.price) || 0, currency.value) ?? 0, currency: currency.value }, tr(state.name), locale.value))

async function save(event: FormSubmitEvent<Schema>) {
  const data = event.data
  const body = {
    name: data.name,
    description: data.description ?? null,
    price: toCents(data.price, currency.value) ?? 0,
    capacity: data.capacity,
    ...(membershipEnabled.value ? { requiresMembership: fromRule(data.requires), excludesMembership: fromRule(data.excludes) } : {}),
  }
  const saved = await run(
    () => props.ticketType
      ? $fetch<{ id: string }>(eventsApi.admin.ticketType(props.ticketType.id), { method: 'PATCH', body })
      : $fetch<{ id: string }>(eventsApi.admin.ticketTypes(props.eventId), { method: 'POST', body: { key: data.key, ...body } }),
    { success: t('admin.typeSaved', 'Ticket type saved.') },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="event-ticket-type-form"
    :title="ticketType ? t('admin.editType', 'Edit ticket type') : t('admin.addType', 'Add ticket type')"
    :submit-label="ticketType ? t('admin.saveType', 'Save ticket type') : t('admin.addType', 'Add ticket type')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="event-ticket-type-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.name', 'Name')"
        required
      >
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        name="description"
        :label="t('admin.description', 'Description')"
      >
        <TranslatedInput
          v-model="state.description"
          multiline
          mdc
          :mdc-data="mdcData"
          :rows="2"
        />
      </UFormField>
      <UFormField
        v-if="!ticketType"
        name="key"
        :label="t('admin.key', 'Key')"
        :description="t('admin.keyHelp', 'A short unique id, e.g. member.')"
        required
      >
        <UInput
          v-model="state.key"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="price"
        :label="t('admin.price', 'Price')"
      >
        <UInput
          v-model="state.price"
          type="number"
          min="0"
          step="0.01"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="capacity"
        :label="t('admin.capacity', 'Capacity')"
        :description="t('admin.capacityHelp', 'Leave empty for unlimited.')"
      >
        <UInput
          v-model="state.capacity"
          type="number"
          min="0"
          class="w-full"
        />
      </UFormField>

      <template v-if="membershipEnabled">
        <UFormField
          name="requires"
          :label="t('admin.requiresMembership', 'Only for members of')"
          :description="t('admin.requiresHelp', 'Visitors without a matching active membership cannot buy this ticket.')"
        >
          <USelect
            v-model="state.requires.mode"
            :items="modes"
            class="w-full"
          />
          <USelectMenu
            v-if="state.requires.mode === 'plans'"
            v-model="state.requires.plans"
            :items="plans"
            value-key="value"
            multiple
            class="mt-2 w-full"
          />
        </UFormField>
        <UFormField
          name="excludes"
          :label="t('admin.excludesMembership', 'Not for members of')"
          :description="t('admin.excludesHelp', 'Holders of these memberships cannot buy this ticket, so members and non-members can have separate prices.')"
        >
          <USelect
            v-model="state.excludes.mode"
            :items="modes"
            class="w-full"
          />
          <USelectMenu
            v-if="state.excludes.mode === 'plans'"
            v-model="state.excludes.plans"
            :items="plans"
            value-key="value"
            multiple
            class="mt-2 w-full"
          />
        </UFormField>
      </template>
    </UForm>
  </FormSlideover>
</template>
