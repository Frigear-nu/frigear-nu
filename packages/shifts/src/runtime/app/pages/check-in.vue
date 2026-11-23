<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftCheckInDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, ref, useAuthPages, useHead, useModuleT, useRoute, useShiftsFormat } from '#imports'

defineOptions({ name: 'ShiftsCheckInPage' })

// The scanner of a team's leads: the camera reads a person's QR pass, or the lead types the code. Each scan checks the
// person in and shows whether they were already (and the other shifts of the day the `daily` mode checked in). Only
// leads of the team (and staff) can scan; the server decides.
const t = useModuleT('shifts')
const format = useShiftsFormat()
const route = useRoute()
const teamId = computed(() => String(route.params.teamId ?? ''))

type Result = { tone: 'success' | 'warning' | 'error', title: string, description?: string }
const result = ref<Result | null>(null)
const code = ref('')
const busy = ref(false)

const failureTitle = (status: number | undefined, errorCode: string | undefined) => {
  if (status === 404) return t('scanner.unknown', 'Unknown code for this team')
  if (status === 403) return t('scanner.forbidden', 'You do not lead this team')
  if (errorCode === 'outside_window') return t('scanner.outsideWindow', 'Check-in for this shift is not open now')
  if (errorCode === 'assignment_cancelled') return t('scanner.cancelled', 'This person was taken off the shift')
  return t('scanner.failed', 'Could not check in')
}

// The camera reads the same code many times a second while it stays in view: a repeat of the last code within a few
// seconds is ignored, until a different code is scanned.
const REPEAT_MS = 3000
let last: { code: string, at: number } | null = null

async function scan(value: string) {
  const trimmed = value.trim()
  if (!trimmed || busy.value) return
  if (last && last.code === trimmed && Date.now() - last.at < REPEAT_MS) return
  last = { code: trimmed, at: Date.now() }
  busy.value = true
  try {
    const answer = await $fetch<ShiftCheckInDto>(shiftsApi.teams.checkIn(teamId.value), { method: 'POST', body: { code: trimmed } })
    const name = answer.assignment.person.name ?? `#${answer.assignment.userId}`
    const when = `${format.time(answer.shift.startsAt)}–${format.time(answer.shift.endsAt)}`
    result.value = answer.alreadyCheckedIn
      ? { tone: 'warning', title: t('scanner.already', '{name} was checked in already', { name }), description: t('scanner.alreadyAt', 'At {time}, shift {when}', { time: format.time(answer.checkedInAt), when }) }
      : {
          tone: 'success',
          title: t('scanner.checkedIn', 'Checked in {name}', { name }),
          description: answer.alsoCheckedIn.length
            ? t('scanner.shiftAndDaily', 'Shift {when}, and {count} more today', { when, count: answer.alsoCheckedIn.length })
            : t('scanner.shift', 'Shift {when}', { when }),
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
        :description="t('scanner.description', 'Scan the QR pass of a person on your team, or type the code under it.')"
      />
      <UPageBody class="mx-auto flex w-full max-w-md flex-col gap-4">
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
            :label="t('scanner.checkInAction', 'Check in person')"
          />
        </form>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
