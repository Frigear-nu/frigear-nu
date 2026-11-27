<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { fromLocalDateTimeInput, toLocalDateTimeInput } from '../utils/admin-campaign'
import { computed, reactive, useModuleT } from '#imports'

defineOptions({ name: 'CampaignScheduleModal' })

// Picks when a campaign goes out, opened with `useOverlay()` by `useCampaignActions().schedule`: it closes with the
// instant, or `false` when cancelled. The time is the browser's local time.
const props = defineProps<{ name: string, recipients?: string }>()
const emit = defineEmits<{ close: [at: Date | false] }>()

const t = useModuleT('campaigns')

// An hour from now, on the hour, as a starting point.
const start = new Date(Date.now() + 60 * 60_000)
start.setMinutes(0, 0, 0)
const state = reactive({ at: toLocalDateTimeInput(start) })
const min = computed(() => toLocalDateTimeInput(new Date()))

const schema = z.object({
  at: z.string().refine((value) => {
    const at = fromLocalDateTimeInput(value)
    return !!at && at.getTime() > Date.now()
  }, t('campaign.schedule.future', 'Pick a time in the future.')),
})

function submit(event: FormSubmitEvent<{ at: string }>) {
  const at = fromLocalDateTimeInput(event.data.at)
  if (at) emit('close', at)
}
</script>

<template>
  <UModal
    :title="t('campaign.schedule.title', 'Schedule {name}', { name: props.name })"
    :description="props.recipients ?? t('campaign.schedule.description', 'It goes out at this time, in batches. You can cancel it until then.')"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <UForm
        id="campaign-schedule-form"
        :schema="schema"
        :state="state"
        @submit="submit"
      >
        <UFormField
          name="at"
          :label="t('campaign.schedule.at', 'Send at')"
          :description="t('campaign.schedule.atHelp', 'In your own time zone.')"
          required
        >
          <UInput
            v-model="state.at"
            type="datetime-local"
            :min="min"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        :label="t('campaign.cancelAction', 'Cancel')"
        color="neutral"
        variant="outline"
        @click="emit('close', false)"
      />
      <UButton
        type="submit"
        form="campaign-schedule-form"
        icon="i-lucide-calendar-clock"
        :label="t('campaign.scheduleAction', 'Schedule campaign')"
      />
    </template>
  </UModal>
</template>
