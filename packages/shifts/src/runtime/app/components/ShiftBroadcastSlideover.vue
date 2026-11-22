<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ShiftsLadder, ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsRoleOptions } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftBroadcastResultDto, Translated } from '../../../types'
import { $fetch, computed, reactive, useAction, useModuleT, useShiftsTranslate, useToast } from '#imports'

defineOptions({ name: 'ShiftBroadcastSlideover' })

// "Message team": an email to the members of a team (staff: to the teams of the operation, optionally one team and a
// role and up), and an SMS only when the box is ticked, because texts cost money. Opened by `useShiftsActions()`; a lead
// passes `teamId` (their own team, the whole of it) and staff `operationId` with the teams. Closes with the result, or
// `false`.
const props = defineProps<{
  /** Staff: the operation to message. */
  operationId?: string
  /** A lead: the team to message. */
  teamId?: string
  /** The name of the team a lead messages. */
  teamName?: string
  teams?: ShiftsTeamOption[]
  ladders?: ShiftsLadder[]
}>()
const emit = defineEmits<{ close: [sent: ShiftBroadcastResultDto | false] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const { busy, run } = useAction()

const ALL = '__all__'
const ANY = '__any__'
const filled = (value: unknown) => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value as Record<string, string>).some(text => text?.trim()))
const schema = z.object({
  teamId: z.string(),
  teamRole: z.string(),
  subject: z.custom<Translated>(filled, t('broadcast.subjectRequired', 'Give the message a subject.')),
  message: z.custom<Translated>(filled, t('broadcast.messageRequired', 'Write the message.')),
  sms: z.boolean(),
})
type State = z.output<typeof schema>
const state = reactive<State>({ teamId: ALL, teamRole: ANY, subject: '', message: '', sms: false })

const teamOptions = computed(() => [{ label: t('admin.allTeams', 'All teams'), value: ALL }, ...(props.teams ?? []).map(team => ({ label: tr(team.name), value: team.id }))])
const kind = computed(() => props.teams?.find(team => team.id === state.teamId)?.kind)
const roleOptions = computed(() => [{ label: t('broadcast.anyRole', 'Everyone on the team'), value: ANY }, ...shiftsRoleOptions(props.ladders, kind.value, tr)])
const audienceHelp = computed(() => props.teamId
  ? t('broadcast.leadAudience', 'Everyone on {team}.', { team: props.teamName ?? '' })
  : t('broadcast.audienceHelp', 'The active members of the operation\'s teams. At most 500 people at once.'))

async function send(event: FormSubmitEvent<State>) {
  const { data } = event
  const channels = data.sms ? ['email', 'sms'] : ['email']
  const body = props.teamId
    ? { audience: {}, channels, subject: data.subject, message: data.message }
    : {
        operationId: props.operationId,
        audience: { ...(data.teamId === ALL ? {} : { teamId: data.teamId }), ...(data.teamId !== ALL && data.teamRole !== ANY ? { teamRole: data.teamRole } : {}) },
        channels,
        subject: data.subject,
        message: data.message,
      }
  const sent = await run(
    () => $fetch<ShiftBroadcastResultDto>(props.teamId ? shiftsApi.teams.broadcasts(props.teamId) : shiftsApi.admin.broadcasts, { method: 'POST', body }),
    { error: t('broadcast.failed', 'Could not send the message') },
  )
  if (sent) {
    notifySent(sent)
    emit('close', sent)
  }
}

// The toast names how many people it reached, and by what.
const toast = useToast()
function notifySent(sent: ShiftBroadcastResultDto) {
  toast.add({
    title: sent.delivery === 'queued' ? t('broadcast.queued', 'Sending to {count} people', { count: sent.recipientCount }) : t('broadcast.sent', 'Sent to {count} people', { count: sent.recipientCount }),
    description: sent.delivery === 'queued' ? t('broadcast.queuedDetail', 'The messages go out in the background.') : sent.sent.sms ? t('broadcast.sentDetail', '{email} emails and {sms} texts.', { email: sent.sent.email, sms: sent.sent.sms }) : t('broadcast.sentEmails', '{email} emails.', { email: sent.sent.email }),
    color: 'success',
  })
}
</script>

<template>
  <FormSlideover
    form-id="shift-broadcast-form"
    :title="teamId ? t('broadcast.leadTitle', 'Message {team}', { team: teamName ?? '' }) : t('broadcast.title', 'Message teams')"
    :description="audienceHelp"
    :submit-label="t('broadcast.submit', 'Send message')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="shift-broadcast-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="send"
    >
      <template v-if="!teamId">
        <UFormField
          name="teamId"
          :label="t('admin.team', 'Team')"
        >
          <USelect
            v-model="state.teamId"
            :items="teamOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="state.teamId !== ALL"
          name="teamRole"
          :label="t('broadcast.role', 'Role')"
          :description="t('broadcast.roleHelp', 'This role and everyone above it on the team\'s ladder.')"
        >
          <USelect
            v-model="state.teamRole"
            :items="roleOptions"
            class="w-full"
          />
        </UFormField>
      </template>
      <UFormField
        name="subject"
        :label="t('broadcast.subject', 'Subject')"
        required
      >
        <TranslatedInput
          v-model="state.subject"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="message"
        :label="t('broadcast.message', 'Message')"
        :description="t('broadcast.messageHelp', 'Each person gets the text in their own language when you write it in several.')"
        required
      >
        <TranslatedInput
          v-model="state.message"
          multiline
          :preview="false"
          :rows="5"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="sms"
        :label="t('broadcast.sms', 'Also send a text message')"
      >
        <USwitch v-model="state.sms" />
      </UFormField>
      <UAlert
        v-if="state.sms"
        color="warning"
        variant="subtle"
        icon="i-lucide-coins"
        :title="t('broadcast.smsCost', 'Texts cost money')"
        :description="t('broadcast.smsWarning', 'Everyone with a phone number gets a text as well as the email. Use it when people need to know right now.')"
      />
    </UForm>
  </FormSlideover>
</template>
