<script setup lang="ts">
import type { ShiftScheduleSettings } from '../../../types'
import { computed, useModuleT, watch } from '#imports'

defineOptions({ name: 'ShiftScheduleSettingsFields' })

// How a schedule's shifts change hands: coverage, handover and approval, as `FormRow`s (label and hint | control). Put
// it in a parent with `divide-y divide-default`, inside a `UForm` (field names `coverage`, `handover`, `approval`).
// Choosing `coverage: 'all'` sets `handover: 'trade'`, the only handover it allows.
const settings = defineModel<ShiftScheduleSettings>({ required: true })

const t = useModuleT('shifts')

watch(() => settings.value.coverage, (coverage) => {
  if (coverage === 'all' && settings.value.handover !== 'trade') settings.value = { ...settings.value, handover: 'trade' }
})

const coverages = computed(() => [
  { label: t('admin.coverages.flexible', 'Flexible'), value: 'flexible', description: t('admin.coverages.flexibleHelp', 'Volunteers may give shifts away and take others over.') },
  { label: t('admin.coverages.all', 'Every shift'), value: 'all', description: t('admin.coverages.allHelp', 'Volunteers must work every shift they hold. They can only trade one shift for another.') },
])
const handovers = computed(() => [
  { label: t('admin.handovers.trade', 'Trade'), value: 'trade', description: t('admin.handovers.tradeHelp', 'Shift for shift: both change hands together, so nobody works fewer shifts.') },
  { label: t('admin.handovers.release', 'Give away'), value: 'release', description: t('admin.handovers.releaseHelp', 'A volunteer gives a shift away and somebody else takes it over.'), disabled: settings.value.coverage === 'all' },
  { label: t('admin.handovers.both', 'Both'), value: 'both', description: t('admin.handovers.bothHelp', 'Volunteers choose: trade a shift, or give it away.'), disabled: settings.value.coverage === 'all' },
])
const approvals = computed(() => [
  { label: t('admin.approvals.peer', 'Between volunteers'), value: 'peer', description: t('admin.approvals.peerHelp', 'A swap is done as soon as the owner accepts an offer.') },
  { label: t('admin.approvals.lead', 'A lead approves'), value: 'lead', description: t('admin.approvals.leadHelp', 'A lead of the team or staff approves each swap the owner accepted.') },
])

const update = (key: keyof ShiftScheduleSettings, value: unknown) => {
  settings.value = { ...settings.value, [key]: value }
}
</script>

<template>
  <FormRow
    name="coverage"
    :label="t('admin.coverage', 'Coverage')"
    :description="t('admin.coverageHelp', 'Whether volunteers must work every shift they are given.')"
  >
    <URadioGroup
      :model-value="settings.coverage"
      :items="coverages"
      @update:model-value="update('coverage', $event)"
    />
  </FormRow>
  <FormRow
    name="handover"
    :label="t('admin.handover', 'Handover')"
    :description="settings.coverage === 'all'
      ? t('admin.handoverAllHelp', 'With every shift covered, volunteers can only trade.')
      : t('admin.handoverHelp', 'How a shift changes hands between volunteers.')"
  >
    <URadioGroup
      :model-value="settings.handover"
      :items="handovers"
      @update:model-value="update('handover', $event)"
    />
  </FormRow>
  <FormRow
    name="approval"
    :label="t('admin.approval', 'Approval')"
    :description="t('admin.approvalHelp', 'Whether a swap the two volunteers agree on needs a lead too.')"
  >
    <URadioGroup
      :model-value="settings.approval"
      :items="approvals"
      @update:model-value="update('approval', $event)"
    />
  </FormRow>
</template>
