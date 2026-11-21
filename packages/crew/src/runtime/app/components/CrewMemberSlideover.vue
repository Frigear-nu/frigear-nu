<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { CrewLadder, CrewTeamOption, StaffCrewMember } from '../utils/admin-crew'
import { crewRoleOptions } from '../utils/admin-crew'
import { crewApi } from '../../utils/api'
import { CREW_STATUS_LABELS } from '../../utils/status'
import type { CrewSubmissionDto } from '../../../types'
import { $fetch, computed, reactive, useAction, useCrewTranslate, useFormat, useLazyFetch, useModuleT, watch } from '#imports'

defineOptions({ name: 'CrewMemberSlideover' })

// One person of an operation's crew: who they are, their application's answers (with `crew:pii`) and the form that moves
// them to another team or role of the operation. Opened by `useCrewActions()`; closes with the saved member, or `false`.
const props = defineProps<{ member: StaffCrewMember, teams: CrewTeamOption[], ladders: CrewLadder[], pii: boolean }>()
const emit = defineEmits<{ close: [saved: StaffCrewMember | false] }>()

const t = useModuleT('crew')
const tr = useCrewTranslate()
const format = useFormat()
const { busy, run } = useAction()

const { data: submission, status: submissionStatus } = useLazyFetch<CrewSubmissionDto>(crewApi.admin.submission(props.member.id), {
  immediate: props.pii && !!props.member.submissionId,
  watch: false,
  key: `crew:submission:${props.member.id}`,
})

const schema = z.object({
  teamId: z.string().min(1, t('admin.teamRequired', 'Choose a team.')),
  role: z.string().min(1, t('admin.roleRequired', 'Choose a role.')),
})
type State = z.output<typeof schema>
const state = reactive<State>({ teamId: props.member.teamId, role: props.member.role })

const teamOptions = computed(() => props.teams.map(team => ({ label: tr(team.name), value: team.id })))
const kind = computed(() => props.teams.find(team => team.id === state.teamId)?.kind)
const roleOptions = computed(() => crewRoleOptions(props.ladders, kind.value, tr))
// A role of another ladder does not carry over to the new team: fall back to its lowest role.
watch(() => state.teamId, () => {
  if (!roleOptions.value.some(option => option.value === state.role)) state.role = roleOptions.value.at(-1)?.value ?? state.role
})

const dash = '–'
const facts = computed(() => [
  { key: 'status', label: t('admin.status', 'Status'), value: t(`admin.statuses.${props.member.crewStatus}`, CREW_STATUS_LABELS[props.member.crewStatus]) },
  { key: 'applied', label: t('admin.applied', 'Applied'), value: props.member.appliedAt ? format.dateTime(props.member.appliedAt) : dash },
  { key: 'previous', label: t('admin.previousCrew', 'Earlier crew'), value: props.member.previousCrew ? t('admin.yes', 'Yes') : t('admin.no', 'No') },
  ...(props.pii
    ? [
        { key: 'email', label: t('admin.email', 'Email'), value: props.member.email || dash },
        { key: 'phone', label: t('admin.phone', 'Phone'), value: props.member.phone || dash },
      ]
    : []),
])
const answers = computed(() => (submission.value?.answers ?? []).map(answer => ({ key: answer.key, label: answer.label, value: answer.value || dash })))

async function save(event: FormSubmitEvent<State>) {
  const { teamId, role } = event.data
  const name = props.member.name ?? `#${props.member.userId}`
  if (teamId === props.member.teamId && role === props.member.role) return emit('close', false)
  const saved = await run(
    () => $fetch<StaffCrewMember>(crewApi.admin.member(props.member.id), { method: 'PATCH', body: { teamId, role } }),
    { success: t('admin.memberSaved', 'Saved {name}', { name }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="crew-member-form"
    :title="member.name ?? `#${member.userId}`"
    :description="t('admin.memberDescription', 'Move this person to another team or role. Their place follows their status.')"
    :submit-label="t('admin.saveMember', 'Save changes')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <div class="flex flex-col gap-6">
      <DescriptionList :items="facts" />

      <UForm
        id="crew-member-form"
        :schema="schema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="save"
      >
        <UFormField
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
          name="role"
          :label="t('admin.role', 'Role')"
          :description="t('admin.roleHelp', 'The role they hold once approved.')"
          required
        >
          <USelect
            v-model="state.role"
            :items="roleOptions"
            class="w-full"
          />
        </UFormField>
      </UForm>

      <div
        v-if="pii && member.submissionId"
        class="flex flex-col gap-2"
      >
        <h3 class="text-highlighted text-sm font-semibold">
          {{ t('admin.answers', 'Application') }}
        </h3>
        <USkeleton
          v-if="submissionStatus === 'pending'"
          class="h-24 w-full"
        />
        <DescriptionList
          v-else-if="answers.length"
          :items="answers"
        />
        <p
          v-else
          class="text-muted text-sm"
        >
          {{ t('admin.noAnswers', 'The answers could not be loaded.') }}
        </p>
      </div>
    </div>
  </FormSlideover>
</template>
