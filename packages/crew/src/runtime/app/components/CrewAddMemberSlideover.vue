<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { UserPickerCreateInitial, UserPickerOption } from '@frigear-nu/users/api'
import type { CrewLadder, CrewTeamOption, StaffCrewMember } from '../utils/admin-crew'
import { crewRoleOptions } from '../utils/admin-crew'
import { crewApi } from '../../utils/api'
import { CREW_STATUS_LABELS, isCrewStatus } from '../../utils/status'
import { $fetch, computed, reactive, ref, useCrewTranslate, useErrorToast, useModuleT, useToast, watch } from '#imports'

defineOptions({ name: 'CrewAddMemberSlideover' })

// Adds a person to an operation's crew, approved at once: the shared `UserPicker` of `@frigear-nu/users` on crew's own
// user search (`crew:manage`, emails with `crew:pii`), with "Create user" for someone without an account, and a team and
// role of the operation. `userId` preselects a person; `prefill` is what a host knows of someone without an account (an
// inbox contact), offered as "Create user". A person who is in the crew already (applied, waiting list, approved) is
// shown here, not added. Opened by `useCrewActions().add()`; closes with the added member, or `false`.
const props = defineProps<{
  operationId: string
  teams: CrewTeamOption[]
  ladders: CrewLadder[]
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

const schema = z.object({
  userId: z.number({ error: t('admin.userRequired', 'Choose a person.') }).int().positive(),
  // An operation without teams gets its default "Crew" team from the server, with the lowest role.
  teamId: props.teams.length ? z.string().min(1, t('admin.teamRequired', 'Choose a team.')) : z.string(),
  role: props.teams.length ? z.string().min(1, t('admin.roleRequired', 'Choose a role.')) : z.string(),
})
type State = { userId: number | undefined, teamId: string, role: string }
const state = reactive<State>({ userId: props.userId, teamId: props.teams[0]?.id ?? '', role: '' })

const teamOptions = computed(() => props.teams.map(team => ({ label: tr(team.name), value: team.id })))
const kind = computed(() => props.teams.find(team => team.id === state.teamId)?.kind)
const roleOptions = computed(() => crewRoleOptions(props.ladders, kind.value, tr))
// Start from the lowest role of the team's ladder.
watch(() => state.teamId, () => {
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

async function save(event: FormSubmitEvent<z.output<typeof schema>>) {
  const { userId, teamId, role } = event.data
  const name = nameOf(userId)
  already.value = null
  busy.value = true
  try {
    const body = { userId, ...(teamId ? { teamId } : {}), ...(teamId && role ? { role } : {}) }
    const added = await $fetch<StaffCrewMember>(crewApi.admin.addMember(props.operationId), { method: 'POST', body })
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
        v-if="teams.length"
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
        v-if="teams.length"
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
