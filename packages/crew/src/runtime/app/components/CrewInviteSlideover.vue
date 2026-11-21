<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { CrewLadder, CrewTeamOption } from '../utils/admin-crew'
import { crewRoleOptions, localToIso } from '../utils/admin-crew'
import { crewApi } from '../../utils/api'
import type { CreatedCrewInviteDto } from '../../../types'
import { $fetch, computed, reactive, ref, useAction, useCopyToClipboard, useCrewTranslate, useModuleT, useRequestURL, watch } from '#imports'

defineOptions({ name: 'CrewInviteSlideover' })

// Creates an invite link for a team and role. The token is only in the answer of the server, so once the invite exists
// this slideover shows the link (with a copy button) instead of the form; closing it forgets the token.
// Opened by `useCrewActions()`; closes with the created invite, or `false`.
const props = defineProps<{ operationId: string, teams: CrewTeamOption[], ladders: CrewLadder[] }>()
const emit = defineEmits<{ close: [created: CreatedCrewInviteDto | false] }>()

const t = useModuleT('crew')
const tr = useCrewTranslate()
const { busy, run } = useAction()
const { copy } = useCopyToClipboard()
const origin = useRequestURL().origin

const schema = z.object({
  teamId: z.string().min(1, t('admin.teamRequired', 'Choose a team.')),
  role: z.string().min(1, t('admin.roleRequired', 'Choose a role.')),
  maxUses: z.number({ error: t('admin.maxUsesInvalid', 'Enter how many people may use the link.') }).int().min(1).max(1000),
  expiresAt: z.string().optional(),
})
type State = z.output<typeof schema>
const state = reactive<State>({ teamId: props.teams[0]?.id ?? '', role: '', maxUses: 1, expiresAt: '' })

const teamOptions = computed(() => props.teams.map(team => ({ label: tr(team.name), value: team.id })))
const kind = computed(() => props.teams.find(team => team.id === state.teamId)?.kind)
const roleOptions = computed(() => crewRoleOptions(props.ladders, kind.value, tr))
// Start from the lowest role; "as lead" is a choice of a higher one.
watch(() => state.teamId, () => {
  if (!roleOptions.value.some(option => option.value === state.role)) state.role = roleOptions.value.at(-1)?.value ?? ''
}, { immediate: true })

const created = ref<CreatedCrewInviteDto>()
const link = computed(() => created.value?.path ? `${origin}${created.value.path}` : created.value?.token ?? '')

async function save(event: FormSubmitEvent<State>) {
  const { teamId, role, maxUses, expiresAt } = event.data
  const invite = await run(
    () => $fetch<CreatedCrewInviteDto>(crewApi.admin.invites(props.operationId), {
      method: 'POST',
      body: { teamId, role, maxUses, expiresAt: expiresAt ? localToIso(expiresAt) : null },
    }),
    { success: t('admin.inviteCreated', 'Created the invite') },
  )
  if (invite) created.value = invite
}
</script>

<template>
  <FormSlideover
    form-id="crew-invite-form"
    :title="t('admin.createInvite', 'Create invite')"
    :description="created
      ? t('admin.inviteShownOnce', 'Copy the link now. For safety it is shown only once.')
      : t('admin.inviteDescription', 'Anyone with the link who is signed in joins the team, approved, with this role.')"
    :submit-label="t('admin.createInviteAction', 'Create invite')"
    :loading="busy"
    @close="emit('close', created ?? false)"
  >
    <div
      v-if="created"
      class="flex flex-col gap-4"
    >
      <UFormField :label="t('admin.inviteLink', 'Invite link')">
        <UInput
          :model-value="link"
          readonly
          class="w-full"
          :ui="{ trailing: 'pe-1' }"
        >
          <template #trailing>
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="link"
              size="sm"
              :aria-label="t('admin.copyLink', 'Copy link')"
              @click="copy(link)"
            />
          </template>
        </UInput>
      </UFormField>
    </div>
    <UForm
      v-else
      id="crew-invite-form"
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
        :description="t('admin.inviteRoleHelp', 'Pick a lead role such as BA to invite someone as a lead.')"
        required
      >
        <USelect
          v-model="state.role"
          :items="roleOptions"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="maxUses"
        :label="t('admin.maxUses', 'Uses')"
        :description="t('admin.maxUsesHelp', 'How many people may join with the link.')"
        required
      >
        <UInputNumber
          v-model="state.maxUses"
          :min="1"
          :max="1000"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="expiresAt"
        :label="t('admin.expiresAt', 'Expires')"
        :description="t('admin.expiresAtHelp', 'Leave empty for a link that does not expire.')"
      >
        <UInput
          v-model="state.expiresAt"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
    </UForm>

    <template
      v-if="created"
      #footer="{ cancel }"
    >
      <UButton
        :label="t('admin.done', 'Done')"
        @click="cancel()"
      />
    </template>
  </FormSlideover>
</template>
