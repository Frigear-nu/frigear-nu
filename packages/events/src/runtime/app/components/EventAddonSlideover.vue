<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Translated } from '../../../types'
import { fromCents, toCents } from '@frigear-nu/ui/money'
import type { StaffAddon } from '../utils/admin-event'

defineOptions({ name: 'EventAddonSlideover' })

// Create/edit form of an add-on choice (e.g. "Vegan"). Opened by
// `useEventCatalogActions().openAddon(ticketType, group, addon?)`: closes with the saved choice, or `false` when
// cancelled. Add-ons are priced in the currency of the ticket type they belong to.
const props = defineProps<{
  /** The add-on group a new choice is added to. */
  groupId: string
  /** The currency of the ticket type the group belongs to. */
  currency: string
  /** The choice to edit; leave out to add one. */
  addon?: StaffAddon
}>()
const emit = defineEmits<{ close: [saved: { id: string } | false] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAction()

const schema = z.object({
  label: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.nameRequired', 'Enter a name.')),
  description: z.custom<Translated | undefined>().optional(),
  price: z.coerce.number().min(0, t('admin.priceInvalid', 'Enter a price of 0 or more.')),
  capacity: z.union([z.literal(''), z.null(), z.undefined(), z.coerce.number().int(t('admin.countInvalid', 'Enter a whole number of 0 or more.')).min(0, t('admin.countInvalid', 'Enter a whole number of 0 or more.'))])
    .transform(value => typeof value === 'number' ? value : null),
})
type Schema = z.output<typeof schema>

const state = reactive({
  label: props.addon?.label as Translated | undefined,
  description: (props.addon?.description ?? undefined) as Translated | undefined,
  price: (props.addon ? fromCents(props.addon.price, props.currency) : 0) as number | string,
  capacity: (props.addon?.capacity ?? '') as number | string,
})

async function save(event: FormSubmitEvent<Schema>) {
  const data = event.data
  const body = {
    label: data.label,
    description: data.description ?? null,
    // Prices are stored in minor units (øre/cents).
    price: toCents(data.price, props.currency) ?? 0,
    capacity: data.capacity,
  }
  const saved = await run(
    () => props.addon
      ? $fetch<{ id: string }>(`/api/events/admin/addons/${props.addon.id}`, { method: 'PATCH', body })
      : $fetch<{ id: string }>(`/api/events/admin/addon-groups/${props.groupId}/addons`, { method: 'POST', body }),
    { success: t('admin.addonSaved', 'Add-on saved.') },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="event-addon-form"
    :title="addon ? t('admin.editAddon', 'Edit choice') : t('admin.addAddon', 'Add choice')"
    :submit-label="addon ? t('admin.saveAddon', 'Save choice') : t('admin.addAddon', 'Add choice')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="event-addon-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="label"
        :label="t('admin.name', 'Name')"
        required
      >
        <TranslatedInput v-model="state.label" />
      </UFormField>
      <UFormField
        name="description"
        :label="t('admin.description', 'Description')"
      >
        <TranslatedInput
          v-model="state.description"
          multiline
          :rows="2"
        />
      </UFormField>
      <UFormField
        name="price"
        :label="t('admin.price', 'Price')"
        :description="t('admin.addonPriceHelp', 'Added to the ticket price. 0 means included.')"
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
    </UForm>
  </FormSlideover>
</template>
