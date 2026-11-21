<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftCheckInDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, ref, useAuthPages, useHead, useModuleT, useRoute, useShiftsFormat } from '#imports'

defineOptions({ name: 'ShiftsCheckInPage' })

// The check-in scanner of a team's leads: the camera reads a person's QR pass, or the lead types the code. Each scan
// shows who it is and whether they were checked in already. Only leads of the team (and staff) can check in; the server
// decides.
const t = useModuleT('shifts')
const format = useShiftsFormat()
const route = useRoute()
const teamId = computed(() => String(route.params.teamId ?? ''))

type Result = { tone: 'success' | 'warning' | 'error', title: string, description?: string }
const result = ref<Result | null>(null)
const code = ref('')
const busy = ref(false)

async function checkIn(value: string) {
  const trimmed = value.trim()
  if (!trimmed || busy.value) return
  busy.value = true
  try {
    const answer = await $fetch<ShiftCheckInDto>(shiftsApi.teams.checkIn(teamId.value), { method: 'POST', body: { code: trimmed } })
    const name = answer.assignment.person.name ?? `#${answer.assignment.userId}`
    const when = `${format.time(answer.shift.startsAt)}–${format.time(answer.shift.endsAt)}`
    result.value = answer.alreadyCheckedIn
      ? { tone: 'warning', title: t('scanner.already', '{name} was checked in already', { name }), description: t('scanner.alreadyAt', 'At {time}, shift {when}', { time: format.time(answer.checkedInAt), when }) }
      : { tone: 'success', title: t('scanner.checkedIn', 'Checked in {name}', { name }), description: t('scanner.shift', 'Shift {when}', { when }) }
    code.value = ''
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
    const errorCode = (error as { data?: { data?: { code?: string } } }).data?.data?.code
    result.value = {
      tone: 'error',
      title: status === 404
        ? t('scanner.unknown', 'Unknown code for this team')
        : status === 403
          ? t('scanner.forbidden', 'You do not lead this team')
          : errorCode === 'outside_window'
            ? t('scanner.outsideWindow', 'Check-in for this shift is not open now')
            : errorCode === 'assignment_cancelled'
              ? t('scanner.cancelled', 'This person was taken off the shift')
              : t('scanner.failed', 'Could not check in'),
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
          @detect="checkIn"
        />
        <form
          class="flex gap-2"
          @submit.prevent="checkIn(code)"
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
