<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'
import { z } from 'zod'
import type { StaffTeam, StaffTeamLadder, StaffTeamMember } from '../utils/admin-team'
import { teamRoleOptions } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import type { TeamUserLookupDto } from '../../../types'
import { $fetch, computed, reactive, ref, useAction, useLazyFetch, useModuleT, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamMemberSlideover' })

// Adds a member to a team (a user search by name or email, and a role of the kind's ladder), or changes the role of
// an explicit member (`member`). Opened by `useTeamMemberActions()`; closes with the saved member, or `false`.
// Assigning a role to a mapped member (`member.source === 'mapped'`) makes the membership explicit.
const props = defineProps<{ team: StaffTeam, ladders: StaffTeamLadder[], member?: StaffTeamMember }>()
const emit = defineEmits<{ close: [saved: StaffTeamMember | false] }>()

const t = useModuleT('teams')
const tr = useTeamsTranslate()
const { busy, run } = useAction()

const editing = computed(() => props.member?.source === 'explicit')
const roleOptions = computed(() => teamRoleOptions(props.ladders, props.team.kind, tr))

const search = ref('')
const q = refDebounced(search, 250)
const { data: found, status } = useLazyFetch<TeamUserLookupDto[]>(teamsApi.admin.users, {
  query: computed(() => ({ q: q.value.trim() })),
  immediate: false,
  watch: [q],
  default: () => [],
})
const userItems = computed(() => (q.value.trim() ? found.value : []).map(user => ({
  label: user.name || user.email || `#${user.id}`,
  description: user.email ?? undefined,
  avatar: user.avatar ? { src: user.avatar } : undefined,
  value: user.id,
})))

const schema = z.object({
  userId: z.number({ error: t('admin.userRequired', 'Choose a person.') }).int().positive(),
  role: z.string().min(1, t('admin.roleRequired', 'Choose a role.')),
})
type State = { userId: number | undefined, role: string }

const lowest = () => roleOptions.value.at(-1)?.value ?? ''
const state = reactive<State>({ userId: props.member?.userId, role: props.member?.role ?? lowest() })

async function save(event: FormSubmitEvent<z.output<typeof schema>>) {
  const { userId, role } = event.data
  const name = props.member?.name ?? userItems.value.find(item => item.value === userId)?.label ?? ''
  const saved = await run(
    () => editing.value
      ? $fetch<StaffTeamMember>(teamsApi.admin.member(props.team.id, userId), { method: 'PATCH', body: { role } })
      : $fetch<StaffTeamMember>(teamsApi.admin.members(props.team.id), { method: 'POST', body: { userId, role } }),
    { success: editing.value
      ? t('admin.memberRoleChanged', 'Changed the role of {name}', { name })
      : t('admin.memberAdded', 'Added {name} to {team}', { name, team: tr(props.team.name) }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="team-member-form"
    :title="member ? t('admin.changeRoleTitle', 'Change role of {name}', { name: member.name ?? '' }) : t('admin.addMember', 'Add member')"
    :description="member?.source === 'mapped' ? t('admin.mappedToExplicit', 'A mapping rule gives them their role now. Saving makes the membership explicit, so it no longer follows the rule.') : undefined"
    :submit-label="editing ? t('admin.saveRole', 'Save role') : t('admin.addMemberAction', 'Add member')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="team-member-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        v-if="!member"
        name="userId"
        :label="t('admin.person', 'Person')"
        :description="t('admin.personHelp', 'Search by name or email.')"
        required
      >
        <UInputMenu
          v-model="state.userId"
          v-model:search-term="search"
          :items="userItems"
          value-key="value"
          ignore-filter
          :loading="status === 'pending'"
          icon="i-lucide-search"
          :placeholder="t('admin.searchPeople', 'Search people')"
          class="w-full"
        />
      </UFormField>
      <UFormField
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
