<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Translated } from '../../../types'
import type { StaffAddonGroup } from '../utils/admin-event'

defineOptions({ name: 'EventAddonGroupSlideover' })

// Create/edit form of an add-on group (e.g. "Food"). Groups belong to a ticket type; buyers choose from them when
// buying that ticket. Opened by `useEventCatalogActions().openGroup(ticketType, group?)`: closes with the saved group,
// or `false` when cancelled.
const props = defineProps<{
  /** The ticket type a new group is added to. */
  ticketTypeId: string
  /** The group to edit; leave out to add one. */
  group?: StaffAddonGroup
}>()
const emit = defineEmits<{ close: [saved: { id: string } | false] }>()

const t = useModuleT('events')
const tr = useEventsTranslate()
const { busy, run } = useAction()

const schema = z.object({
  title: z.custom<Translated | undefined>().refine(value => !!tr(value).trim(), t('admin.groupTitleRequired', 'Enter a title.')),
  required: z.boolean(),
  multiple: z.boolean(),
})
type Schema = z.output<typeof schema>

const state = reactive({
  title: props.group?.title as Translated | undefined,
  required: props.group?.required ?? false,
  multiple: props.group?.multiple ?? false,
})

async function save(event: FormSubmitEvent<Schema>) {
  const body = event.data
  const saved = await run(
    () => props.group
      ? $fetch<{ id: string }>(`/api/events/admin/addon-groups/${props.group.id}`, { method: 'PATCH', body })
      : $fetch<{ id: string }>(`/api/events/admin/ticket-types/${props.ticketTypeId}/addon-groups`, { method: 'POST', body }),
    { success: t('admin.groupSaved', 'Add-on group saved.') },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="event-addon-group-form"
    :title="group ? t('admin.editGroup', 'Edit add-on group') : t('admin.addGroup', 'Add add-on group')"
    :submit-label="group ? t('admin.saveGroup', 'Save add-on group') : t('admin.addGroup', 'Add add-on group')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="event-addon-group-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="title"
        :label="t('admin.groupTitle', 'Title')"
        :description="t('admin.groupTitleHelp', 'Shown above the choices, e.g. Food.')"
        required
      >
        <TranslatedInput v-model="state.title" />
      </UFormField>
      <UCheckbox
        v-model="state.required"
        :label="t('admin.groupRequiredLabel', 'Buyers must choose at least one')"
      />
      <UCheckbox
        v-model="state.multiple"
        :label="t('admin.groupMultipleLabel', 'Buyers can choose several')"
      />
    </UForm>
  </FormSlideover>
</template>
