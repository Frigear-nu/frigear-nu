<script setup lang="ts">
import type { Translated } from '../../../types'
import { toCents, fromCents } from '@frigear-nu/ui/money'
import { DEFAULT_CURRENCY, ticketMdcData } from '../../utils'
import type { StaffTicketType } from '../utils/admin-event'

defineOptions({ name: 'EventAdminTicketTypeDialog' })

// Create/edit dialog for a ticket type. Open it with `open()` (new) or `open(ticketType)` (edit).
const props = defineProps<{
  eventId: string
  /** Membership rules are only offered when @frigear-nu/subscriptions is installed. */
  membershipEnabled: boolean
  plans: Array<{ label: string, value: string }>
}>()
const emit = defineEmits<{ refresh: [] }>()

const t = useModuleT('events')
const locale = useEventsLocale()
const tr = useEventsTranslate()
const { busy, run } = useAction()

type Membership = 'any' | string[] | null
type Rule = { mode: 'none' | 'any' | 'plans', plans: string[] }

const modes = computed(() => [
  { label: t('admin.ruleNone', 'Nobody'), value: 'none' },
  { label: t('admin.ruleAny', 'Any membership'), value: 'any' },
  { label: t('admin.rulePlans', 'Specific memberships'), value: 'plans' },
])
const toRule = (value: Membership | undefined): Rule => value === 'any' ? { mode: 'any', plans: [] } : Array.isArray(value) && value.length ? { mode: 'plans', plans: [...value] } : { mode: 'none', plans: [] }
const fromRule = (rule: Rule): Membership => rule.mode === 'any' ? 'any' : rule.mode === 'plans' && rule.plans.length ? [...rule.plans] : null

const dialog = ref(false)
const editingType = ref<StaffTicketType | null>(null)
const type = reactive({ key: '', name: undefined as Translated | undefined, description: undefined as Translated | undefined, price: 0, capacity: '' as string | number, requires: toRule(null), excludes: toRule(null) })

function open(ticketType?: StaffTicketType) {
  editingType.value = ticketType ?? null
  Object.assign(type, {
    key: ticketType?.key ?? '',
    name: ticketType?.name,
    description: ticketType?.description ?? undefined,
    price: ticketType ? fromCents(ticketType.price, ticketType.currency) : 0,
    capacity: ticketType?.capacity ?? '',
    requires: toRule(ticketType?.requiresMembership),
    excludes: toRule(ticketType?.excludesMembership),
  })
  dialog.value = true
}

defineExpose({ open })

const save = () => run(async () => {
  const body = {
    name: type.name,
    description: type.description ?? null,
    // Prices are stored in minor units (øre/cents).
    price: toCents(Number(type.price), editingType.value?.currency ?? DEFAULT_CURRENCY),
    capacity: type.capacity === '' ? null : Number(type.capacity),
    ...(props.membershipEnabled ? { requiresMembership: fromRule(type.requires), excludesMembership: fromRule(type.excludes) } : {}),
  }
  if (editingType.value) {
    await $fetch(`/api/events/admin/ticket-types/${editingType.value.id}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/events/admin/events/${props.eventId}/ticket-types`, { method: 'POST', body: { key: type.key, ...body } })
  }
  dialog.value = false
  emit('refresh')
}, { success: t('admin.typeSaved', 'Ticket type saved.') })
</script>

<template>
  <UModal
    v-model:open="dialog"
    :title="editingType ? t('admin.editType', 'Edit ticket type') : t('admin.addType', 'Add ticket type')"
  >
    <template #body>
      <form
        id="admin-ticket-type-form"
        class="flex flex-col gap-4"
        @submit.prevent="save"
      >
        <UFormField :label="t('admin.name', 'Name')">
          <TranslatedInput
            v-model="type.name"
            required
          />
        </UFormField>
        <UFormField :label="t('admin.description', 'Description')">
          <TranslatedInput
            v-model="type.description"
            multiline
            mdc
            :mdc-data="ticketMdcData({ ...type, price: toCents(Number(type.price), editingType?.currency ?? DEFAULT_CURRENCY), currency: editingType?.currency ?? DEFAULT_CURRENCY }, tr(type.name), locale)"
            :rows="2"
          />
        </UFormField>
        <UFormField
          v-if="!editingType"
          :label="t('admin.key', 'Key')"
          :description="t('admin.keyHelp', 'A short unique id, e.g. member.')"
        >
          <UInput
            v-model="type.key"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField :label="t('admin.price', 'Price')">
          <UInput
            v-model="type.price"
            type="number"
            min="0"
            step="0.01"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('admin.capacity', 'Capacity')"
          :description="t('admin.capacityHelp', 'Leave empty for unlimited.')"
        >
          <UInput
            v-model="type.capacity"
            type="number"
            min="0"
            class="w-full"
          />
        </UFormField>

        <template v-if="membershipEnabled">
          <UFormField
            :label="t('admin.requiresMembership', 'Only for members of')"
            :description="t('admin.requiresHelp', 'Visitors without a matching active membership cannot buy this ticket.')"
          >
            <USelect
              v-model="type.requires.mode"
              :items="modes"
              class="w-full"
            />
            <USelectMenu
              v-if="type.requires.mode === 'plans'"
              v-model="type.requires.plans"
              :items="plans"
              value-key="value"
              multiple
              class="mt-2 w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.excludesMembership', 'Not for members of')"
            :description="t('admin.excludesHelp', 'Holders of these memberships cannot buy this ticket, so members and non-members can have separate prices.')"
          >
            <USelect
              v-model="type.excludes.mode"
              :items="modes"
              class="w-full"
            />
            <USelectMenu
              v-if="type.excludes.mode === 'plans'"
              v-model="type.excludes.plans"
              :items="plans"
              value-key="value"
              multiple
              class="mt-2 w-full"
            />
          </UFormField>
        </template>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          variant="outline"
          color="neutral"
          :label="t('admin.cancel', 'Cancel')"
          @click="dialog = false"
        />
        <UButton
          type="submit"
          form="admin-ticket-type-form"
          :loading="busy"
          :disabled="!tr(type.name)"
          :label="t('admin.save', 'Save')"
        />
      </div>
    </template>
  </UModal>
</template>
