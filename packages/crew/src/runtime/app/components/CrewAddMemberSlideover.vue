<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { UserPickerCreateInitial, UserPickerOption } from '@frigear-nu/users/api'
import { operationsApi } from '@frigear-nu/operations/api'
import { teamsApi } from '@frigear-nu/teams/api'
import type { CrewLadder, CrewTeamOption, StaffCrewMember } from '../utils/admin-crew'
import { crewRoleOptions } from '../utils/admin-crew'
import { crewApi } from '../../utils/api'
import { CREW_STATUS_LABELS, isCrewStatus } from '../../utils/status'
import { $fetch, computed, reactive, ref, useCrewTranslate, useErrorToast, useFetch, useModuleT, useToast, watch } from '#imports'

defineOptions({ name: 'CrewAddMemberSlideover' })

// Adds a person to an operation's crew, approved at once: the shared `UserPicker` of `@frigear-nu/users` on crew's own
// user search (`crew:manage`, emails with `crew:pii`), with "Create user" for someone without an account, and a team and
// role of the operation. `userId` preselects a person; `prefill` is what a host knows of someone without an account (an
// inbox contact), offered as "Create user". A person who is in the crew already (applied, waiting list, approved) is
// shown here, not added. Opened by `useCrewActions().add()`; closes with the added member, or `false`.
// Without `operationId` (the inbox's "Add to crew") the form starts with an operation (planning or active; the list
// needs `operations:manage`) and loads its teams. `inboxThreadId` records the addition on that thread's audit trail.
const props = defineProps<{
  operationId?: string
  teams?: CrewTeamOption[]
  ladders?: CrewLadder[]
  inboxThreadId?: string
  userId?: number
  selected?: UserPickerOption[]
  prefill?: UserPickerCreateInitial
}>()
const emit = defineEmits<{ close: [added: StaffCrewMember | false] }>()

const t = useModuleT('crew')
const tr = useCrewTranslate()
const toast = useToast()
const showError = useErrorToast()
const busy = ref(false)

const picker = ref<{ openCreate: (initial?: UserPickerCreateInitial) => Promise<UserPickerOption | null>, canCreate: boolean } | null>(null)
// The person picked (or created) in the picker, for the toast and the "in the crew already" message.
const picked = ref<UserPickerOption | null>(props.selected?.find(user => user.id === props.userId) ?? null)
// The status of a person who is in the crew already (the 409 of the route).
const already = ref<{ status: string, name: string } | null>(null)

type State = { operationId: string, userId: number | undefined, teamId: string, role: string }
const state = reactive<State>({ operationId: props.operationId ?? '', userId: props.userId, teamId: props.teams?.[0]?.id ?? '', role: '' })

// The operation to choose from, and its teams and the ladders, when the host did not give them.
const chooseOperation = !props.operationId
const { data: operations, status: operationsStatus } = await useFetch<{ items: Array<{ id: string, name: Record<string, string> | string, status: string }> }>(operationsApi.admin.operations, {
  query: { pageSize: 100, sort: 'startsAt', order: 'desc' },
  immediate: chooseOperation,
  server: false,
  lazy: true,
  default: () => ({ items: [] }),
})
const operationOptions = computed(() => (operations.value?.items ?? [])
  .filter(operation => operation.status === 'planning' || operation.status === 'active')
  .map(operation => ({ label: tr(operation.name), value: operation.id })))
const { data: fetchedTeams } = await useFetch<{ items: CrewTeamOption[] }>(teamsApi.admin.teams, {
  query: computed(() => ({ ownerType: 'operation', ownerId: state.operationId || undefined, pageSize: 100, sort: 'sort', order: 'asc' })),
  immediate: !props.teams && !!state.operationId,
  watch: false,
  server: false,
  lazy: true,
  default: () => ({ items: [] }),
})
const { data: fetchedLadders } = await useFetch<CrewLadder[]>(teamsApi.admin.ladders, { immediate: !props.ladders, server: false, lazy: true, default: () => [] })
const teamList = computed(() => props.teams ?? fetchedTeams.value?.items ?? [])
const ladderList = computed(() => props.ladders ?? fetchedLadders.value ?? [])
watch(() => state.operationId, async (operationId) => {
  if (props.teams || !operationId) return
  fetchedTeams.value = await $fetch<{ items: CrewTeamOption[] }>(teamsApi.admin.teams, { query: { ownerType: 'operation', ownerId: operationId, pageSize: 100, sort: 'sort', order: 'asc' } })
  state.teamId = teamList.value[0]?.id ?? ''
  already.value = null
})

// An operation without teams gets its default "Crew" team from the server, with the lowest role.
const schema = computed(() => z.object({
  operationId: z.string().min(1, t('admin.operationRequired', 'Choose an operation.')),
  userId: z.number({ error: t('admin.userRequired', 'Choose a person.') }).int().positive(),
  teamId: teamList.value.length ? z.string().min(1, t('admin.teamRequired', 'Choose a team.')) : z.string(),
  role: teamList.value.length ? z.string().min(1, t('admin.roleRequired', 'Choose a role.')) : z.string(),
}))

const teamOptions = computed(() => teamList.value.map(team => ({ label: tr(team.name), value: team.id })))
const kind = computed(() => teamList.value.find(team => team.id === state.teamId)?.kind)
const roleOptions = computed(() => crewRoleOptions(ladderList.value, kind.value, tr))
// Start from the lowest role of the team's ladder.
watch([() => state.teamId, roleOptions], () => {
  if (!roleOptions.value.some(option => option.value === state.role)) state.role = roleOptions.value.at(-1)?.value ?? ''
}, { immediate: true })
watch(() => state.userId, () => {
  already.value = null
})

const nameOf = (userId: number) => (picked.value?.id === userId ? (picked.value.name || picked.value.email) : null) ?? `#${userId}`
// Offered when the host knows someone without an account and nobody is picked yet.
const offerCreate = computed(() => !!props.prefill && !state.userId && !!picker.value?.canCreate)
const prefillName = computed(() => props.prefill?.name || props.prefill?.email || props.prefill?.phone || '')

async function createFromPrefill() {
  await picker.value?.openCreate(props.prefill)
}

type ConflictError = { statusCode?: number, data?: { data?: { status?: unknown } } }

async function save(event: FormSubmitEvent<State>) {
  const { operationId, userId, teamId, role } = event.data
  if (!userId) return
  const name = nameOf(userId)
  already.value = null
  busy.value = true
  try {
    const body = { userId, ...(teamId ? { teamId } : {}), ...(teamId && role ? { role } : {}), ...(props.inboxThreadId ? { inboxThreadId: props.inboxThreadId } : {}) }
    const added = await $fetch<StaffCrewMember>(crewApi.admin.addMember(operationId), { method: 'POST', body })
    toast.add({ title: t('admin.memberAdded', 'Added {name} to the crew', { name: added.name ?? name }), color: 'success', icon: 'i-lucide-check' })
    emit('close', added)
  }
  catch (e) {
    const error = e as ConflictError
    const status = error.statusCode === 409 ? error.data?.data?.status : undefined
    if (error.statusCode === 409 && (isCrewStatus(status) || status === null)) {
      already.value = { status: isCrewStatus(status) ? status : 'team', name }
    }
    else {
      showError(e, t('admin.addMemberFailed', 'The person could not be added'))
    }
  }
  finally {
    busy.value = false
  }
}

const alreadyText = computed(() => {
  if (!already.value) return ''
  const { status, name } = already.value
  if (status === 'team') return t('admin.alreadyOnTeam', '{name} is on a team of this operation already.', { name })
  const label = t(`admin.statuses.${status}`, CREW_STATUS_LABELS[status as keyof typeof CREW_STATUS_LABELS] ?? status)
  return t('admin.alreadyInCrew', '{name} is in this crew already ({status}). Find them in the list to change their status.', { name, status: label })
})
</script>

<template>
  <FormSlideover
    form-id="crew-add-member-form"
    :title="t('admin.addMember', 'Add crew member')"
    :description="t('admin.addMemberDescription', 'The person joins the crew approved, and is told by email or push.')"
    :submit-label="t('admin.addMemberAction', 'Add crew member')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="crew-add-member-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UAlert
        v-if="already"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t('admin.alreadyTitle', 'Already in the crew')"
        :description="alreadyText"
        data-crew-already
      />
      <UAlert
        v-if="offerCreate"
        color="neutral"
        variant="subtle"
        icon="i-lucide-user-plus"
        :title="t('admin.noAccountTitle', 'No account yet')"
        :description="t('admin.noAccountDescription', '{name} has no account. Create one to add them.', { name: prefillName })"
        :actions="[{ label: t('admin.createUserAction', 'Create user'), icon: 'i-lucide-user-plus', onClick: createFromPrefill }]"
      />
      <UFormField
        v-if="chooseOperation"
        name="operationId"
        :label="t('admin.operation', 'Operation')"
        required
      >
        <USelectMenu
          v-model="state.operationId"
          :items="operationOptions"
          value-key="value"
          :loading="operationsStatus === 'pending'"
          :placeholder="t('admin.chooseOperation', 'Choose an operation')"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="userId"
        :label="t('admin.person', 'Person')"
        :description="t('admin.personHelp', 'Search by name, or by email where you may see emails.')"
        required
      >
        <UserPicker
          ref="picker"
          v-model="state.userId"
          :endpoint="crewApi.admin.users"
          :selected="selected"
          :placeholder="t('admin.searchPeople', 'Search people')"
          @picked="(user: UserPickerOption) => picked = user"
        />
      </UFormField>
      <UFormField
        v-if="teamList.length"
        name="teamId"
        :label="t('admin.team', 'Team')"
        required
      >
        <USelect
          v-model="state.teamId"
          :items="teamOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        v-if="teamList.length"
        name="role"
        :label="t('admin.role', 'Role')"
        required
      >
        <USelect
          v-model="state.role"
          :items="roleOptions"
          class="w-full"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
