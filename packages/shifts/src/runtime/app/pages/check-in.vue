<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftCheckInDto, ShiftPerkDto, ShiftPerkRedeemDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, ref, useAuthPages, useFetch, useHead, useModuleT, useRoute, useShiftsFormat, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsCheckInPage' })

// The scanner of a team's leads: the camera reads a person's QR pass, or the lead types the code. In "check in" mode each
// scan checks the person in and shows whether they were already; in "redeem a perk" mode it hands out the chosen perk
// (a meal voucher, a drink) without checking anybody in. Only leads of the team (and staff) can scan; the server decides.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const route = useRoute()
const teamId = computed(() => String(route.params.teamId ?? ''))

type Result = { tone: 'success' | 'warning' | 'error', title: string, description?: string }
const result = ref<Result | null>(null)
const code = ref('')
const busy = ref(false)

// The perks of the team: without any, the page is a plain check-in scanner.
const { data: perks } = await useFetch<ShiftPerkDto[]>(() => shiftsApi.teams.perks(teamId.value), {
  key: computed(() => `shifts:team-perks:${teamId.value}`),
  default: () => [],
})
const mode = ref<'checkin' | 'perk'>('checkin')
const perkId = ref(perks.value[0]?.id ?? '')
const perk = computed(() => perks.value.find(item => item.id === perkId.value))
const modeItems = computed(() => [
  { label: t('scanner.modeCheckIn', 'Check in'), value: 'checkin', icon: 'i-lucide-scan-line' },
  { label: t('scanner.modePerk', 'Redeem a perk'), value: 'perk', icon: 'i-lucide-utensils' },
])
const perkOptions = computed(() => perks.value.map(item => ({
  label: `${tr(item.name)} · ${item.perShift != null ? t('perks.allowancePerShift', '{count} per shift', { count: item.perShift }) : t('perks.allowancePerPerson', '{count} per person', { count: item.perPerson ?? 0 })}`,
  value: item.id,
})))

const failureTitle = (status: number | undefined, errorCode: string | undefined) => {
  if (status === 404) return t('scanner.unknown', 'Unknown code for this team')
  if (status === 403) return t('scanner.forbidden', 'You do not lead this team')
  if (errorCode === 'outside_window') return t('scanner.outsideWindow', 'Check-in for this shift is not open now')
  if (errorCode === 'assignment_cancelled') return t('scanner.cancelled', 'This person was taken off the shift')
  if (errorCode === 'perk_used_up') return t('scanner.perkUsedUp', 'This person has used up this perk')
  if (errorCode === 'not_on_shift') return t('scanner.notOnShift', 'This person does not hold a place on the shift')
  return mode.value === 'perk' ? t('scanner.redeemFailed', 'Could not redeem the perk') : t('scanner.failed', 'Could not check in')
}

async function scan(value: string) {
  const trimmed = value.trim()
  if (!trimmed || busy.value) return
  busy.value = true
  try {
    if (mode.value === 'perk') {
      if (!perk.value) return
      const answer = await $fetch<ShiftPerkRedeemDto>(shiftsApi.teams.redeemPerk(teamId.value, perk.value.id), { method: 'POST', body: { code: trimmed } })
      const name = answer.person.name ?? `#${answer.person.userId}`
      result.value = {
        tone: 'success',
        title: t('scanner.redeemed', 'Gave {name}: {perk}', { name, perk: tr(answer.perk.name) }),
        description: answer.remaining > 0 ? t('scanner.remaining', '{count} left', { count: answer.remaining }) : t('scanner.noneLeft', 'That was the last one.'),
      }
    }
    else {
      const answer = await $fetch<ShiftCheckInDto>(shiftsApi.teams.checkIn(teamId.value), { method: 'POST', body: { code: trimmed } })
      const name = answer.assignment.person.name ?? `#${answer.assignment.userId}`
      const when = `${format.time(answer.shift.startsAt)}–${format.time(answer.shift.endsAt)}`
      result.value = answer.alreadyCheckedIn
        ? { tone: 'warning', title: t('scanner.already', '{name} was checked in already', { name }), description: t('scanner.alreadyAt', 'At {time}, shift {when}', { time: format.time(answer.checkedInAt), when }) }
        : { tone: 'success', title: t('scanner.checkedIn', 'Checked in {name}', { name }), description: t('scanner.shift', 'Shift {when}', { when }) }
    }
    code.value = ''
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
    const errorCode = (error as { data?: { data?: { code?: string } } }).data?.data?.code
    result.value = {
      tone: 'error',
      title: failureTitle(status, errorCode),
      description: status === 404 || status === 403 ? undefined : errorMessage(error, ''),
    }
  }
  finally {
    busy.value = false
  }
}

useHead({ title: () => t('scanner.title', 'Check in') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('scanner.title', 'Check in')"
        :description="mode === 'perk'
          ? t('scanner.perkDescription', 'Scan the QR pass of a person on your team to hand out the perk, or type the code under it. Nobody is checked in.')
          : t('scanner.description', 'Scan the QR pass of a person on your team, or type the code under it.')"
      />
      <UPageBody class="mx-auto flex w-full max-w-md flex-col gap-4">
        <UTabs
          v-if="perks.length"
          v-model="mode"
          :items="modeItems"
          :content="false"
          class="w-full"
        />
        <USelect
          v-if="mode === 'perk'"
          v-model="perkId"
          :items="perkOptions"
          :aria-label="t('scanner.perk', 'Perk')"
          class="w-full"
        />
        <UAlert
          v-if="result"
          :color="result.tone"
          variant="subtle"
          :icon="result.tone === 'success' ? 'i-lucide-check-circle' : result.tone === 'warning' ? 'i-lucide-info' : 'i-lucide-circle-alert'"
          :title="result.title"
          :description="result.description"
        />
        <ShiftQrScanner
          :paused="busy"
          @detect="scan"
        />
        <form
          class="flex gap-2"
          @submit.prevent="scan(code)"
        >
          <UInput
            v-model="code"
            :placeholder="t('scanner.codePlaceholder', 'Code')"
            :aria-label="t('scanner.code', 'Check-in code')"
            autocomplete="off"
            class="flex-1"
          />
          <UButton
            type="submit"
            :loading="busy"
            :label="mode === 'perk' ? t('scanner.redeemAction', 'Give perk') : t('scanner.checkInAction', 'Check in person')"
          />
        </form>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
