<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { refDebounced } from '@vueuse/core'
import { toZonedInput, warningColor, zonedInputToIso } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import { SHIFT_ASSIGNMENT_STATUS_LABELS } from '../../utils/status'
import type { ShiftAssigneeDto, ShiftAssignResultDto, ShiftCandidateDto, ShiftRoleDto, ShiftWarning, ShiftWithAssigneesDto } from '../../../types'
import { $fetch, computed, errorMessage, reactive, ref, SHIFTS_NO_FEATURE, useAction, useConfirmDialog, useLazyFetch, useModuleT, useShiftsFormat, useShiftsTranslate, useShiftsVenueFeatures, useToast } from '#imports'

defineOptions({ name: 'ShiftSlideover' })

// One shift for staff: its time, capacity and role, who works it, and assigning people with the guards they would break.
// Opened by `useShiftsActions()`; closes with `true` when something changed, else `false`.
const props = defineProps<{ shift: ShiftWithAssigneesDto, roles: ShiftRoleDto[], minPerShift?: number | null }>()
const emit = defineEmits<{ close: [changed: boolean] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const toast = useToast()
const confirm = useConfirmDialog()
const { busy, run } = useAction()
const timeZone = format.timeZone

const current = ref<ShiftWithAssigneesDto>(props.shift)
const changed = ref(false)
const assignees = computed(() => current.value.assignees)
const active = computed(() => assignees.value.filter(item => item.status === 'assigned' || item.status === 'attended'))

// --- Editing the shift ------------------------------------------------------------------------------------------------
const NONE = '__none__'
const schema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  capacity: z.number().int().min(0).nullable(),
  shiftRoleId: z.string(),
  featureId: z.string(),
}).refine(value => value.endsAt > value.startsAt, { message: t('admin.endsAfterStart', 'A shift must end after it starts.'), path: ['endsAt'] })
type State = z.output<typeof schema>
const state = reactive<State>({
  startsAt: toZonedInput(props.shift.startsAt, timeZone),
  endsAt: toZonedInput(props.shift.endsAt, timeZone),
  capacity: props.shift.capacity,
  shiftRoleId: props.shift.shiftRoleId ?? NONE,
  featureId: props.shift.location?.featureId ?? SHIFTS_NO_FEATURE,
})
// Where on the operation's venue layout the shift is (the on-duty layer draws it there).
const venue = useShiftsVenueFeatures(() => props.shift.operationId)
const roleOptions = computed(() => [
  { label: t('admin.noRole', 'No role'), value: NONE },
  ...props.roles.filter(role => role.teamId === props.shift.teamId).map(role => ({ label: tr(role.name), value: role.id })),
])

async function save(event: FormSubmitEvent<State>) {
  const body = {
    startsAt: zonedInputToIso(event.data.startsAt, timeZone),
    endsAt: zonedInputToIso(event.data.endsAt, timeZone),
    capacity: event.data.capacity,
    shiftRoleId: event.data.shiftRoleId === NONE ? null : event.data.shiftRoleId,
    location: shiftLocation(event.data.featureId),
  }
  const saved = await run(
    () => $fetch(shiftsApi.admin.shift(current.value.id), { method: 'PATCH', body }),
    { success: t('admin.shiftSaved', 'Saved the shift') },
  )
  if (saved) emit('close', true)
}

/** The shift's location with the picked feature: its name is kept, a cleared feature is dropped. */
function shiftLocation(featureId: string) {
  const location = { ...props.shift.location }
  if (featureId === SHIFTS_NO_FEATURE) delete location.featureId
  else location.featureId = featureId
  return Object.keys(location).length ? location : null
}

// --- Who works it -----------------------------------------------------------------------------------------------------
const statusLabel = (status: ShiftAssigneeDto['status']) => t(`statuses.${status}`, SHIFT_ASSIGNMENT_STATUS_LABELS[status])
const nameOf = (person: { name: string | null, userId: number }) => person.name ?? `#${person.userId}`

function replaceAssignee(updated: ShiftAssigneeDto) {
  const list = current.value.assignees.filter(item => item.id !== updated.id)
  if (updated.status !== 'cancelled') list.push(updated)
  current.value = { ...current.value, assignees: list, filled: list.filter(item => item.status === 'assigned' || item.status === 'attended').length }
  changed.value = true
}

async function mark(assignee: ShiftAssigneeDto, to: 'attended' | 'no_show') {
  const updated = await run(
    () => $fetch<ShiftAssigneeDto>(to === 'attended' ? shiftsApi.attended(assignee.id) : shiftsApi.noShow(assignee.id), { method: 'POST' }),
    { success: t('admin.marked', 'Marked {name} {status}', { name: nameOf(assignee.person), status: statusLabel(to).toLowerCase() }) },
  )
  if (updated) replaceAssignee(updated)
}

async function cancelAssignment(assignee: ShiftAssigneeDto) {
  const name = nameOf(assignee.person)
  const confirmed = await confirm({
    title: t('admin.cancelAssignmentTitle', 'Take {name} off this shift?', { name }),
    description: t('admin.cancelAssignmentDescription', 'Their place is freed and an open swap of it is cancelled.'),
    confirmText: t('admin.cancelAssignment', 'Remove from shift'),
    destructive: true,
  })
  if (!confirmed) return
  const done = await run(
    () => $fetch(shiftsApi.admin.assignment(assignee.id), { method: 'DELETE' }).then(() => true),
    { success: t('admin.assignmentCancelled', 'Took {name} off the shift', { name }) },
  )
  if (done) replaceAssignee({ ...assignee, status: 'cancelled' })
}

function assigneeMenu(assignee: ShiftAssigneeDto): DropdownMenuItem[][] {
  const marks: DropdownMenuItem[] = []
  if (assignee.status !== 'attended') marks.push({ label: t('admin.markAttended', 'Mark attended'), icon: 'i-lucide-check', onSelect: () => mark(assignee, 'attended') })
  if (assignee.status !== 'no_show') marks.push({ label: t('admin.markNoShow', 'Mark no-show'), icon: 'i-lucide-user-x', onSelect: () => mark(assignee, 'no_show') })
  const destructive: DropdownMenuItem[] = assignee.status !== 'attended'
    ? [{ label: t('admin.cancelAssignment', 'Remove from shift'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => cancelAssignment(assignee) }]
    : []
  return [marks, destructive].filter(group => group.length)
}

// --- Assigning --------------------------------------------------------------------------------------------------------
const search = ref('')
const query = refDebounced(search, 250)
const { data: candidates, status: candidatesStatus, refresh: refreshCandidates } = useLazyFetch<ShiftCandidateDto[]>(() => shiftsApi.admin.candidates(current.value.id), {
  // The role picked below: eligibility and warnings follow it.
  query: computed(() => ({ q: query.value || undefined, shiftRoleId: state.shiftRoleId === NONE ? undefined : state.shiftRoleId })),
  key: `shifts:candidates:${props.shift.id}`,
  default: () => [],
})
const lastWarnings = ref<{ name: string, warnings: ShiftWarning[] } | null>(null)
const warningText = (warning: ShiftWarning) => t(`warnings.${warning.code}`, warning.message)

async function assign(candidate: ShiftCandidateDto, force = false) {
  const name = nameOf(candidate)
  try {
    const result = await $fetch<ShiftAssignResultDto>(shiftsApi.admin.assignments(current.value.id), { method: 'POST', body: { userId: candidate.userId, force, shiftRoleId: state.shiftRoleId === NONE ? undefined : state.shiftRoleId } })
    replaceAssignee(result.assignment)
    lastWarnings.value = result.warnings.length ? { name, warnings: result.warnings } : null
    toast.add({ title: t('admin.assigned', 'Assigned {name}', { name }), color: result.warnings.length ? 'warning' : 'success', icon: 'i-lucide-check' })
    await refreshCandidates()
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } }).data?.data?.code
    if (code === 'shift_full' && !force) {
      const confirmed = await confirm({
        title: t('admin.fullTitle', 'The shift is full'),
        description: t('admin.fullDescription', 'Assign {name} over the capacity anyway?', { name }),
        confirmText: t('admin.assignAnyway', 'Assign anyway'),
      })
      if (confirmed) await assign(candidate, true)
      return
    }
    toast.add({ title: t('admin.assignFailed', 'Could not assign {name}', { name }), description: errorMessage(error, ''), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

const capacityLabel = computed(() => current.value.effectiveCapacity === null
  ? t('admin.filledUnlimited', '{filled} on it, no limit', { filled: current.value.filled })
  : t('admin.filledOf', '{filled} of {capacity}', { filled: current.value.filled, capacity: current.value.effectiveCapacity }))
</script>

<template>
  <FormSlideover
    form-id="shift-form"
    :title="`${tr(current.teamName)} · ${format.range(current.startsAt, current.endsAt)}`"
    :description="capacityLabel"
    :submit-label="t('admin.saveShift', 'Save shift')"
    :loading="busy"
    @close="emit('close', changed)"
  >
    <div class="flex flex-col gap-6">
      <UAlert
        v-if="minPerShift && active.length < minPerShift"
        color="warning"
        variant="subtle"
        icon="i-lucide-users"
        :title="t('admin.shortStaffed', 'Short of people: {count} of at least {min}', { count: active.length, min: minPerShift })"
      />

      <section class="flex flex-col gap-2">
        <h3 class="text-highlighted text-sm font-semibold">
          {{ t('admin.onShift', 'On this shift') }}
        </h3>
        <p
          v-if="!assignees.length"
          class="text-muted text-sm"
        >
          {{ t('admin.nobodyYet', 'Nobody yet.') }}
        </p>
        <ul
          v-else
          class="divide-default divide-y"
        >
          <li
            v-for="assignee in assignees"
            :key="assignee.id"
            class="flex items-center justify-between gap-2 py-2"
          >
            <TableIdentity
              :title="nameOf(assignee.person)"
              :description="assignee.person.phone || assignee.person.email || null"
              :avatar="{ src: assignee.person.avatar ?? undefined, alt: nameOf(assignee.person) }"
            />
            <div class="flex items-center gap-2">
              <StatusBadge
                :status="assignee.status"
                :label="statusLabel(assignee.status)"
                :colors="{ assigned: 'info', attended: 'success', no_show: 'error' }"
              />
              <RowMenu
                :items="assigneeMenu(assignee)"
                :subject="nameOf(assignee.person)"
              />
            </div>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="text-highlighted text-sm font-semibold">
          {{ t('admin.assignPerson', 'Assign a person') }}
        </h3>
        <UAlert
          v-if="lastWarnings"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('admin.assignedWithWarnings', '{name} is assigned, but:', { name: lastWarnings.name })"
        >
          <template #description>
            <ul class="list-disc ps-4">
              <li
                v-for="warning in lastWarnings.warnings"
                :key="`${warning.code}${warning.shiftId ?? ''}`"
              >
                {{ warningText(warning) }}
              </li>
            </ul>
          </template>
        </UAlert>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('admin.searchPeople', 'Search the team by name')"
          class="w-full"
        />
        <USkeleton
          v-if="candidatesStatus === 'pending' && !candidates.length"
          class="h-16 w-full"
        />
        <p
          v-else-if="!candidates.length"
          class="text-muted text-sm"
        >
          {{ t('admin.noCandidates', 'Nobody on the team matches. People need an approved place or a role added in Teams.') }}
        </p>
        <ul
          v-else
          class="divide-default divide-y"
        >
          <li
            v-for="candidate in candidates"
            :key="candidate.userId"
            class="flex items-start justify-between gap-2 py-2"
          >
            <div class="flex min-w-0 flex-col gap-1">
              <TableIdentity
                :title="nameOf(candidate)"
                :description="candidate.role"
                :avatar="{ src: candidate.avatar ?? undefined, alt: nameOf(candidate) }"
              />
              <div
                v-if="candidate.warnings.length || candidate.reason"
                class="flex flex-wrap gap-1"
              >
                <UBadge
                  v-if="candidate.reason"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  :label="candidate.reason === 'assigned' ? t('admin.alreadyOn', 'On the shift') : t('admin.roleTooLow', 'Role too low')"
                />
                <UBadge
                  v-for="warning in candidate.warnings"
                  :key="`${warning.code}${warning.shiftId ?? ''}`"
                  :color="warningColor(warning)"
                  variant="subtle"
                  size="sm"
                  :label="warningText(warning)"
                />
              </div>
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="!candidate.eligible"
              :label="t('admin.assignAction', 'Assign {name}', { name: candidate.name ?? '' })"
              @click="assign(candidate)"
            />
          </li>
        </ul>
      </section>

      <USeparator />

      <UForm
        id="shift-form"
        :schema="schema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="save"
      >
        <h3 class="text-highlighted text-sm font-semibold">
          {{ t('admin.shiftDetails', 'Shift details') }}
        </h3>
        <div class="grid grid-cols-2 gap-4">
          <UFormField
            name="startsAt"
            :label="t('admin.startsAt', 'Starts')"
            :description="timeZone"
          >
            <UInput
              v-model="state.startsAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="endsAt"
            :label="t('admin.endsAt', 'Ends')"
          >
            <UInput
              v-model="state.endsAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="capacity"
            :label="t('admin.capacity', 'Capacity')"
            :description="t('admin.capacityHelp', 'Empty uses the schedule\'s maximum.')"
          >
            <UInputNumber
              v-model="state.capacity"
              :min="0"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="shiftRoleId"
            :label="t('admin.shiftRole', 'Shift role')"
          >
            <USelect
              v-model="state.shiftRoleId"
              :items="roleOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="featureId"
            class="col-span-2"
            :label="t('admin.venueFeature', 'Place on the venue layout')"
            :description="t('admin.venueFeatureHelp', 'Where the shift is worked: the on-duty map draws it there.')"
          >
            <USelect
              v-model="state.featureId"
              :items="venue.items.value"
              :loading="venue.status.value === 'pending'"
              class="w-full"
            />
          </UFormField>
        </div>
      </UForm>
    </div>
  </FormSlideover>
</template>
