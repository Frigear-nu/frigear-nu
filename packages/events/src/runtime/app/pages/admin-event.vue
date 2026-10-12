<script setup lang="ts">
import type { Translated } from '../../../types'
import { formatPrice, translate } from '../../utils'

defineOptions({ name: 'EventsAdminEventPage' })

type AdminTicketType = {
  id: string
  key: string
  name: Translated
  price: number
  currency: string
  capacity: number | null
  saleStartsAt: string | null
  saleEndsAt: string | null
  requiresMembership: 'any' | string[] | null
  excludesMembership: 'any' | string[] | null
}

type AdminEvent = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  status: 'draft' | 'published' | 'archived'
  startsAt: string
  endsAt: string | null
  location: string | null
  ticketTypes: AdminTicketType[]
}

type Attendee = {
  id: string
  ticketTypeId: string
  status: string
  amount: number
  currency: string
  paymentId: string | null
  checkedInAt: string | null
  userName: string | null
  userEmail: string | null
}

const t = useModuleT('events')
const toast = useToast()
const route = useRoute()
const locale = useEventsLocale()
const pages = useRuntimeConfig().public.events?.pages
const id = computed(() => String(route.params.id))

const { data: event, refresh } = await useFetch<AdminEvent>(() => `/api/events/admin/events/${id.value}`)
const { data: attendees, refresh: refreshAttendees } = await useFetch<Attendee[]>(() => `/api/events/admin/events/${id.value}/tickets`, { default: () => [] })

// A translated text is edited in the current locale; the other locales are kept as they are.
const merge = (original: Translated | null | undefined, value: string): Translated =>
  original && typeof original === 'object' ? { ...original, [locale.value]: value } : value

const toLocalInput = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const form = reactive({ name: '', slug: '', description: '', status: 'draft', startsAt: '', endsAt: '', location: '' })
watch(event, (value) => {
  if (!value) return
  Object.assign(form, {
    name: translate(value.name, locale.value),
    slug: value.slug,
    description: translate(value.description, locale.value),
    status: value.status,
    startsAt: toLocalInput(value.startsAt),
    endsAt: toLocalInput(value.endsAt),
    location: value.location ?? '',
  })
}, { immediate: true })

const busy = ref(false)
async function run(action: () => Promise<unknown>, success?: string) {
  busy.value = true
  try {
    await action()
    if (success) toast.add({ title: success, color: 'success' })
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('admin.error', 'Something went wrong.'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const save = () => run(async () => {
  await $fetch(`/api/events/admin/events/${id.value}`, {
    method: 'PATCH',
    body: {
      name: merge(event.value?.name, form.name),
      slug: form.slug,
      description: form.description ? merge(event.value?.description, form.description) : null,
      status: form.status,
      startsAt: form.startsAt,
      endsAt: form.endsAt || null,
      location: form.location || null,
    },
  })
  await refresh()
}, t('admin.saved', 'Saved.'))

const statuses = ['draft', 'published', 'archived']

// --- ticket types -----------------------------------------------------------------------------
// Membership rules are only offered when @frigear-nu/subscriptions is installed; the plans come from it.
type Membership = 'any' | string[] | null
type Rule = { mode: 'none' | 'any' | 'plans', plans: string[] }

const { data: membershipOptions } = await useFetch<{ available: boolean, options: Array<{ value: string, label: string }> }>('/api/events/admin/membership-options', { default: () => ({ available: false, options: [] }) })
const membershipEnabled = computed(() => membershipOptions.value.available)
const plans = computed(() => membershipOptions.value.options.map(option => ({ label: option.label, value: option.value })))
const modes = computed(() => [
  { label: t('admin.ruleNone', 'Nobody'), value: 'none' },
  { label: t('admin.ruleAny', 'Any membership'), value: 'any' },
  { label: t('admin.rulePlans', 'Specific memberships'), value: 'plans' },
])
const toRule = (value: Membership | undefined): Rule => value === 'any' ? { mode: 'any', plans: [] } : Array.isArray(value) && value.length ? { mode: 'plans', plans: [...value] } : { mode: 'none', plans: [] }
const fromRule = (rule: Rule): Membership => rule.mode === 'any' ? 'any' : rule.mode === 'plans' && rule.plans.length ? [...rule.plans] : null
const planLabel = (key: string) => plans.value.find(plan => plan.value === key)?.label ?? key
const describeRule = (value: Membership | undefined) => value === 'any' ? t('admin.ruleAny', 'Any membership') : Array.isArray(value) ? value.map(planLabel).join(', ') : ''

const typeDialog = ref(false)
const editingType = ref<AdminTicketType | null>(null)
const type = reactive({ key: '', name: '', price: 0, capacity: '' as string | number, requires: toRule(null), excludes: toRule(null) })

function openType(ticketType?: AdminTicketType) {
  editingType.value = ticketType ?? null
  Object.assign(type, {
    key: ticketType?.key ?? '',
    name: ticketType ? translate(ticketType.name, locale.value) : '',
    price: ticketType ? ticketType.price / 100 : 0,
    capacity: ticketType?.capacity ?? '',
    requires: toRule(ticketType?.requiresMembership),
    excludes: toRule(ticketType?.excludesMembership),
  })
  typeDialog.value = true
}

const saveType = () => run(async () => {
  const body = {
    name: merge(editingType.value?.name, type.name),
    // Prices are stored in minor units (øre/cents).
    price: Math.round(Number(type.price) * 100),
    capacity: type.capacity === '' ? null : Number(type.capacity),
    ...(membershipEnabled.value ? { requiresMembership: fromRule(type.requires), excludesMembership: fromRule(type.excludes) } : {}),
  }
  if (editingType.value) {
    await $fetch(`/api/events/admin/ticket-types/${editingType.value.id}`, { method: 'PATCH', body })
  }
  else {
    await $fetch(`/api/events/admin/events/${id.value}/ticket-types`, { method: 'POST', body: { key: type.key, ...body } })
  }
  typeDialog.value = false
  await refresh()
}, t('admin.typeSaved', 'Ticket type saved.'))

const removeType = (ticketType: AdminTicketType) => {
  if (!confirm(t('admin.confirmRemoveType', 'Delete this ticket type?'))) return
  return run(async () => {
    await $fetch(`/api/events/admin/ticket-types/${ticketType.id}`, { method: 'DELETE' })
    await refresh()
  })
}

// --- attendees --------------------------------------------------------------------------------
const typeName = (ticketTypeId: string) => translate(event.value?.ticketTypes.find(item => item.id === ticketTypeId)?.name, locale.value)
const statusColor: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = { paid: 'success', pending: 'warning', cancelled: 'neutral', refunded: 'neutral', expired: 'neutral' }

const ticketAction = (ticket: Attendee, action: 'cancel' | 'refund') => {
  if (!confirm(action === 'refund' ? t('admin.confirmRefund', 'Refund this ticket?') : t('admin.confirmCancel', 'Cancel this ticket?'))) return
  return run(async () => {
    await $fetch(`/api/events/admin/tickets/${ticket.id}/${action}`, { method: 'POST' })
    await refreshAttendees()
  }, action === 'refund' ? t('admin.refunded', 'Refunded.') : t('admin.cancelled', 'Cancelled.'))
}

const attendeeColumns = [
  { accessorKey: 'userName', header: t('admin.attendee', 'Attendee') },
  { accessorKey: 'ticketTypeId', header: t('admin.ticketType', 'Ticket') },
  { accessorKey: 'status', header: t('admin.status', 'Status') },
  { accessorKey: 'checkedInAt', header: t('admin.checkedIn', 'Checked in') },
  { id: 'actions', header: '' },
]
</script>

<template>
  <div v-if="event">
    <AdminPageHeader
      :title="translate(event.name, locale)"
      :back="{ label: t('admin.title', 'Events'), to: pages?.admin || '/admin/events' }"
    >
      <template #links>
        <UButton
          v-if="event.status === 'published' && pages?.event"
          :to="pages.event.replace(':slug', encodeURIComponent(event.slug))"
          variant="outline"
          color="neutral"
          icon="i-lucide-external-link"
          :label="t('admin.viewPublic', 'View public page')"
        />
      </template>
    </AdminPageHeader>

    <UPageCard
      :title="t('admin.details', 'Details')"
      variant="subtle"
      class="mb-6"
    >
      <form
        class="flex flex-col gap-4"
        @submit.prevent="save"
      >
        <UFormField :label="t('admin.name', 'Name')">
          <UInput
            v-model="form.name"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField :label="t('admin.slug', 'URL name')">
          <UInput
            v-model="form.slug"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField :label="t('admin.description', 'Description')">
          <UTextarea
            v-model="form.description"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('admin.status', 'Status')">
          <USelect
            v-model="form.status"
            :items="statuses"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('admin.starts', 'Starts')">
          <UInput
            v-model="form.startsAt"
            type="datetime-local"
            class="w-full"
            required
          />
        </UFormField>
        <UFormField :label="t('admin.ends', 'Ends')">
          <UInput
            v-model="form.endsAt"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('admin.location', 'Location')">
          <UInput
            v-model="form.location"
            class="w-full"
          />
        </UFormField>
        <div>
          <UButton
            type="submit"
            :loading="busy"
            :label="t('admin.save', 'Save')"
          />
        </div>
      </form>
    </UPageCard>

    <UPageCard
      :title="t('admin.ticketTypes', 'Ticket types')"
      variant="subtle"
      class="mb-6"
    >
      <ul
        v-if="event.ticketTypes.length"
        class="divide-default divide-y"
      >
        <li
          v-for="ticketType in event.ticketTypes"
          :key="ticketType.id"
          class="flex items-center justify-between gap-4 py-2 text-sm"
        >
          <span class="min-w-0">
            <span class="font-medium">{{ translate(ticketType.name, locale) }}</span>
            <span class="text-muted"> · {{ formatPrice(ticketType.price, ticketType.currency, locale) }}<template v-if="ticketType.capacity !== null"> · {{ t('admin.capacity', 'capacity') }} {{ ticketType.capacity }}</template></span>
            <span
              v-if="ticketType.requiresMembership"
              class="mt-1 flex flex-wrap gap-1"
            >
              <UBadge
                variant="subtle"
                color="success"
                :label="`${t('admin.requires', 'Requires')}: ${describeRule(ticketType.requiresMembership)}`"
              />
            </span>
            <span
              v-if="ticketType.excludesMembership"
              class="mt-1 flex flex-wrap gap-1"
            >
              <UBadge
                variant="subtle"
                color="warning"
                :label="`${t('admin.notFor', 'Not for')}: ${describeRule(ticketType.excludesMembership)}`"
              />
            </span>
          </span>
          <span class="flex shrink-0 gap-1">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('admin.edit', 'Edit')"
              @click="openType(ticketType)"
            />
            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="xs"
              :aria-label="t('admin.remove', 'Delete')"
              @click="removeType(ticketType)"
            />
          </span>
        </li>
      </ul>
      <p
        v-else
        class="text-muted text-sm"
      >
        {{ t('admin.noTypes', 'No ticket types yet: nobody can buy a ticket.') }}
      </p>
      <template #footer>
        <UButton
          icon="i-lucide-plus"
          variant="outline"
          color="neutral"
          size="xs"
          :label="t('admin.addType', 'Add ticket type')"
          @click="openType()"
        />
      </template>
    </UPageCard>

    <UPageCard
      :title="t('admin.attendees', 'Attendees')"
      variant="subtle"
    >
      <UTable
        v-if="attendees.length"
        :data="attendees"
        :columns="attendeeColumns"
      >
        <template #userName-cell="{ row }">
          <span class="font-medium">{{ row.original.userName }}</span>
          <span class="text-muted"> · {{ row.original.userEmail }}</span>
        </template>
        <template #ticketTypeId-cell="{ row }">
          {{ typeName(row.original.ticketTypeId) }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            variant="subtle"
            :color="statusColor[row.original.status] ?? 'neutral'"
            :label="row.original.status"
          />
        </template>
        <template #checkedInAt-cell="{ row }">
          {{ row.original.checkedInAt ? '✓' : '–' }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              v-if="row.original.status === 'paid' && row.original.paymentId"
              size="xs"
              variant="outline"
              color="neutral"
              :label="t('admin.refund', 'Refund')"
              @click="ticketAction(row.original, 'refund')"
            />
            <UButton
              v-if="row.original.status === 'paid' || row.original.status === 'pending'"
              size="xs"
              variant="ghost"
              color="error"
              :label="t('admin.cancel', 'Cancel')"
              @click="ticketAction(row.original, 'cancel')"
            />
          </div>
        </template>
      </UTable>
      <p
        v-else
        class="text-muted text-sm"
      >
        {{ t('admin.noAttendees', 'No tickets yet.') }}
      </p>
    </UPageCard>

    <UModal
      v-model:open="typeDialog"
      :title="editingType ? t('admin.editType', 'Edit ticket type') : t('admin.addType', 'Add ticket type')"
    >
      <template #body>
        <form
          class="flex flex-col gap-4"
          @submit.prevent="saveType"
        >
          <UFormField :label="t('admin.name', 'Name')">
            <UInput
              v-model="type.name"
              class="w-full"
              required
            />
          </UFormField>
          <UFormField
            v-if="!editingType"
            :label="t('admin.key', 'Key')"
            :help="t('admin.keyHelp', 'A short unique id, e.g. member.')"
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
            :help="t('admin.capacityHelp', 'Leave empty for unlimited.')"
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
              :help="t('admin.requiresHelp', 'Visitors without a matching active membership cannot buy this ticket.')"
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
              :help="t('admin.excludesHelp', 'Holders of these memberships cannot buy this ticket, so members and non-members can have separate prices.')"
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

          <div class="flex justify-end gap-2">
            <UButton
              variant="subtle"
              :label="t('admin.cancel', 'Cancel')"
              @click="typeDialog = false"
            />
            <UButton
              type="submit"
              :loading="busy"
              :label="t('admin.save', 'Save')"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
  <UEmpty
    v-else
    :title="t('notFound', 'Event not found')"
  />
</template>
