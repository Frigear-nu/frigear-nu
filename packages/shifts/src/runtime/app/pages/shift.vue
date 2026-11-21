<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import { allowedSwapKinds, allowsSwapKind, offerKind } from '../../utils/settings'
import { SHIFT_ASSIGNMENT_STATUS_LABELS, SHIFT_SWAP_OFFER_STATUS_LABELS, SHIFT_SWAP_STATUS_LABELS } from '../../utils/status'
import { countdownParts, dayKey } from '../../utils/time'
import type { MyShiftDetailDto, ShiftPassDto, ShiftPassPerkDto, ShiftSelfCheckInDto, ShiftSwapKind, ShiftSwapOfferDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, onBeforeUnmount, onMounted, ref, useAction, useAuthPages, useConfirmDialog, useFetch, useHead, useLazyFetch, useModuleT, useRoute, useShiftsFormat, useShiftsLinks, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftsShiftPage' })

// One of my shifts: when and where, the lead on duty, the QR pass and checking in myself (a station's code or my
// location) while check-in is open, what the shift earns, and the swap (open a trade or
// give the shift away, as far as the schedule allows; accept or reject offers; withdraw it).
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()
const confirm = useConfirmDialog()
const { busy, run } = useAction()
const route = useRoute()
const assignmentId = computed(() => String(route.params.assignmentId ?? ''))

const { data, error, refresh } = await useFetch<MyShiftDetailDto>(() => shiftsApi.me.shift(assignmentId.value), { key: computed(() => `shifts:me:${assignmentId.value}`) })
if (error.value?.statusCode === 401) {
  await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}

// The pass: asked for while the window is open; the page checks again every half minute so it appears on time.
// A page clock, set in the browser only: the server renders without it, so the first render matches.
const now = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  timer = setInterval(() => (now.value = Date.now()), 30_000)
})
onBeforeUnmount(() => clearInterval(timer))
const passOpen = computed(() => !!data.value && now.value >= Date.parse(data.value.passOpensAt) && now.value <= Date.parse(data.value.passClosesAt))
const holdsPlace = computed(() => data.value?.assignment.status === 'assigned' || data.value?.assignment.status === 'attended')
const { data: pass, refresh: refreshPass } = useLazyFetch<ShiftPassDto>(() => shiftsApi.me.pass(assignmentId.value), {
  key: computed(() => `shifts:pass:${assignmentId.value}`),
  watch: [passOpen],
  server: false,
})
const qr = computed(() => pass.value?.svg ? `data:image/svg+xml;utf8,${encodeURIComponent(pass.value.svg)}` : null)
// "Show larger": the pass full screen, high contrast, with the screen kept awake.
const large = ref(false)
// Until the pass opens: days, hours and minutes left, refreshed with the page clock.
const countdown = computed(() => {
  if (!data.value || !now.value) return ''
  const { days, hours, minutes } = countdownParts(Date.parse(data.value.passOpensAt) - now.value)
  return [days ? t('shift.unitDays', '{count} d', { count: days }) : '', days || hours ? t('shift.unitHours', '{count} h', { count: hours }) : '', t('shift.unitMinutes', '{count} min', { count: minutes })].filter(Boolean).join(' ')
})
const perks = computed(() => pass.value?.perks ?? [])
const perkLabel = (perk: ShiftPassPerkDto) => perk.status === 'upcoming'
  ? t('shift.perkUpcoming', 'You will earn this')
  : perk.status === 'earned'
    ? t('shift.perkEarned', 'Earned')
    : perk.status === 'claimed' ? t('shift.perkClaimed', 'Claimed') : t('shift.perkRevoked', 'Revoked')
const perkColor = (perk: ShiftPassPerkDto) => perk.status === 'earned' ? 'success' : perk.status === 'revoked' ? 'error' : 'neutral'

// --- Checking in myself -------------------------------------------------------------------------------------------------
const checkedIn = computed(() => data.value?.assignment.status === 'attended' && !!data.value.assignment.checkedInAt)
const canStation = computed(() => !!pass.value?.available && !!pass.value.checkIn.modes.includes('station'))
const canLocation = computed(() => !!pass.value?.available && !!pass.value.checkIn.modes.includes('location'))
const scanning = ref(false)
const checkInBusy = ref(false)
const checkInResult = ref<{ tone: 'success' | 'warning' | 'error', title: string } | null>(null)
const checkInFailure = (code: string | undefined, fallback: string) => ({
  token_expired: t('checkIn.errors.expired', 'That code has expired. Scan the station again.'),
  invalid_token: t('checkIn.errors.invalid', 'That is not a check-in station\'s code.'),
  wrong_station: t('checkIn.errors.wrongStation', 'That station is not your team\'s.'),
  outside_location: t('checkIn.errors.outside', 'You are not at the check-in place yet.'),
  inaccurate_position: t('checkIn.errors.inaccurate', 'Your position is not accurate enough. Try again outside, or ask your lead.'),
  outside_window: t('checkIn.errors.window', 'Check-in for this shift is not open now.'),
  mode_disabled: t('checkIn.errors.disabled', 'This way of checking in is not on for your shift.'),
} as Record<string, string>)[code ?? ''] ?? fallback

async function checkIn(body: Record<string, unknown>) {
  if (checkInBusy.value) return
  checkInBusy.value = true
  try {
    const answer = await $fetch<ShiftSelfCheckInDto>(shiftsApi.me.checkIn(assignmentId.value), { method: 'POST', body })
    scanning.value = false
    checkInResult.value = answer.alreadyCheckedIn
      ? { tone: 'warning', title: t('checkIn.already', 'You were checked in already, at {time}.', { time: format.time(answer.checkedInAt) }) }
      : { tone: 'success', title: answer.alsoCheckedIn.length ? t('checkIn.doneDaily', 'Checked in, and on your {count} other shifts today.', { count: answer.alsoCheckedIn.length }) : t('checkIn.done', 'Checked in. Have a good shift!') }
    await Promise.all([refresh(), refreshPass()])
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } }).data?.data?.code
    checkInResult.value = { tone: 'error', title: checkInFailure(code, errorMessage(error, t('checkIn.failed', 'Could not check in'))) }
  }
  finally {
    checkInBusy.value = false
  }
}
const onStationScan = (token: string) => checkIn({ mode: 'station', token })
function checkInHere() {
  if (!import.meta.client || !navigator.geolocation) {
    checkInResult.value = { tone: 'error', title: t('checkIn.errors.noGeo', 'This device cannot tell where you are.') }
    return
  }
  checkInBusy.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => {
      checkInBusy.value = false
      void checkIn({ mode: 'location', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy })
    },
    () => {
      checkInBusy.value = false
      checkInResult.value = { tone: 'error', title: t('checkIn.errors.geoDenied', 'Allow the app to use your location, or ask your lead to scan your pass.') }
    },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
  )
}
const leadNames = computed(() => (data.value?.leadsOnDuty ?? []).map(lead => lead.name ?? `#${lead.userId}`))

const swap = computed(() => data.value?.swapDetail ?? null)
const upcoming = computed(() => !!data.value && Date.parse(data.value.shift.startsAt) > now.value)
const canOpenSwap = computed(() => !swap.value && data.value?.assignment.status === 'assigned' && upcoming.value)
const waitingOffers = computed(() => (swap.value?.offers ?? []).filter(offer => offer.status === 'offered' || offer.status === 'accepted'))
// What the schedule lets me do now: trade the shift, give it away, or both.
const kinds = computed<ShiftSwapKind[]>(() => data.value ? allowedSwapKinds(data.value.settings) : [])
const mustWorkAll = computed(() => data.value?.settings.coverage === 'all')
const canAccept = (offer: ShiftSwapOfferDto) => !!data.value && allowsSwapKind(data.value.settings, offerKind(offer))

async function openSwap(kind: ShiftSwapKind) {
  const done = await run(
    () => $fetch(shiftsApi.me.swap(assignmentId.value), { method: 'POST', body: { kind } }).then(() => true),
    kind === 'trade'
      ? { success: t('shift.tradeOpened', 'Your shift is open for a trade'), error: t('shift.swapOpenFailed', 'Could not open a swap') }
      : { success: t('shift.swapOpened', 'Your shift is up for grabs'), error: t('shift.swapOpenFailed', 'Could not open a swap') },
  )
  if (done) await refresh()
}

async function withdrawSwap() {
  const confirmed = await confirm({
    title: t('shift.withdrawSwapTitle', 'Withdraw the swap?'),
    description: t('shift.withdrawSwapDescription', 'You keep the shift. The offers you got are turned down.'),
    confirmText: t('shift.withdrawSwap', 'Withdraw swap'),
    destructive: true,
  })
  if (!confirmed) return
  const done = await run(
    () => $fetch(shiftsApi.me.swap(assignmentId.value), { method: 'DELETE' }).then(() => true),
    { success: t('shift.swapWithdrawn', 'Withdrew the swap'), error: t('shift.swapWithdrawFailed', 'Could not withdraw the swap') },
  )
  if (done) await refresh()
}

async function decide(offer: ShiftSwapOfferDto, accept: boolean) {
  if (!swap.value) return
  const name = offer.person?.name ?? ''
  const done = await run(
    () => $fetch(accept ? shiftsApi.acceptOffer(swap.value!.id, offer.id) : shiftsApi.rejectOffer(swap.value!.id, offer.id), { method: 'POST' }).then(() => true),
    accept
      ? { success: t('shift.offerAccepted', 'Accepted the offer of {name}', { name }), error: t('shift.offerAcceptFailed', 'Could not accept the offer') }
      : { success: t('shift.offerRejected', 'Turned down the offer of {name}', { name }), error: t('shift.offerRejectFailed', 'Could not turn the offer down') },
  )
  if (done) {
    if (accept && data.value?.settings.approval === 'peer') return navigateTo(links.shifts())
    await refresh()
  }
}

const facts = computed(() => data.value
  ? [
      { key: 'when', label: t('shift.when', 'When'), value: format.range(data.value.shift.startsAt, data.value.shift.endsAt) },
      { key: 'team', label: t('shift.team', 'Team'), value: tr(data.value.teamName) },
      ...(data.value.roleName ? [{ key: 'role', label: t('shift.role', 'Role'), value: tr(data.value.roleName) }] : []),
      ...(data.value.shift.location?.name ? [{ key: 'where', label: t('shift.where', 'Where'), value: tr(data.value.shift.location.name) }] : []),
      { key: 'operation', label: t('shift.operation', 'Operation'), value: tr(data.value.operationName) },
      { key: 'status', label: t('shift.status', 'Status'), value: t(`statuses.${data.value.assignment.status}`, SHIFT_ASSIGNMENT_STATUS_LABELS[data.value.assignment.status]) },
      ...(data.value.shift.notes && tr(data.value.shift.notes) ? [{ key: 'notes', label: t('shift.notes', 'Notes'), value: tr(data.value.shift.notes) }] : []),
    ]
  : [])

useHead({ title: () => t('shift.title', 'My shift') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="data ? `${tr(data.teamName)} · ${format.time(data.shift.startsAt)}–${format.time(data.shift.endsAt)}` : t('shift.title', 'My shift')"
        :description="data ? format.day(dayKey(data.shift.startsAt, format.timeZone)) : undefined"
      >
        <template #links>
          <UButton
            :to="links.shifts()"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            :label="t('shift.back', 'My shifts')"
          />
        </template>
      </UPageHeader>
      <UPageBody class="max-w-2xl">
        <UEmpty
          v-if="error && error.statusCode !== 401"
          icon="i-lucide-circle-alert"
          :title="error.statusCode === 404 ? t('shift.notFound', 'This shift is not yours, or no longer exists') : t('shift.loadFailed', 'The shift could not be loaded')"
          :description="error.statusCode === 404 ? undefined : errorMessage(error, '')"
          :actions="[{ label: t('shift.back', 'My shifts'), to: links.shifts(), color: 'neutral', variant: 'outline' }]"
        />
        <div
          v-else-if="data"
          class="flex flex-col gap-4"
        >
          <SectionCard
            v-if="holdsPlace"
            :title="t('shift.pass', 'Check-in pass')"
            icon="i-lucide-qr-code"
          >
            <div
              v-if="passOpen && qr"
              class="flex flex-col items-center gap-2"
            >
              <img
                :src="qr"
                :alt="t('shift.passAlt', 'QR code to check in')"
                class="size-60 rounded-md bg-white p-2"
              >
              <p class="text-muted text-center text-sm">
                {{ canStation || canLocation ? t('shift.passHelpSelf', 'Check in below, or show this to the lead of your team.') : t('shift.passHelp', 'Show this to the lead of your team when you arrive.') }}
              </p>
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-maximize-2"
                :label="t('shift.passLarger', 'Show larger')"
                @click="large = true"
              />
            </div>
            <USkeleton
              v-else-if="passOpen"
              class="mx-auto size-60"
            />
            <div
              v-else
              class="flex flex-col gap-1"
            >
              <p
                v-if="now && now < Date.parse(data.passOpensAt)"
                class="text-highlighted text-lg font-semibold tabular-nums"
              >
                {{ t('shift.passOpensIn', 'Opens in {time}', { time: countdown }) }}
              </p>
              <p class="text-muted text-sm">
                {{ now < Date.parse(data.passOpensAt)
                  ? t('shift.passLater', 'Your pass shows here from {time}.', { time: format.dateTime(data.passOpensAt) })
                  : t('shift.passClosed', 'Check-in for this shift has closed.') }}
              </p>
            </div>
            <div
              v-if="checkedIn || canStation || canLocation || checkInResult"
              class="border-default mt-3 flex flex-col gap-2 border-t pt-3"
            >
              <UAlert
                v-if="checkInResult"
                :color="checkInResult.tone"
                variant="subtle"
                :icon="checkInResult.tone === 'success' ? 'i-lucide-check-circle' : checkInResult.tone === 'warning' ? 'i-lucide-info' : 'i-lucide-circle-alert'"
                :title="checkInResult.title"
              />
              <p
                v-else-if="checkedIn"
                class="text-success flex items-center gap-1.5 text-sm font-medium"
              >
                <UIcon
                  name="i-lucide-check-circle"
                  class="size-4"
                />
                {{ t('checkIn.checkedInAt', 'Checked in at {time}', { time: format.time(data.assignment.checkedInAt!) }) }}
              </p>
              <div
                v-if="!checkedIn && (canStation || canLocation)"
                class="flex flex-wrap gap-2"
              >
                <UButton
                  v-if="canStation"
                  icon="i-lucide-scan-line"
                  :color="scanning ? 'neutral' : 'primary'"
                  :variant="scanning ? 'outline' : 'solid'"
                  :label="scanning ? t('checkIn.stopScanning', 'Stop scanning') : t('checkIn.scanStation', 'Scan the station code')"
                  @click="scanning = !scanning"
                />
                <UButton
                  v-if="canLocation"
                  icon="i-lucide-map-pin"
                  :color="canStation ? 'neutral' : 'primary'"
                  :variant="canStation ? 'outline' : 'solid'"
                  :loading="checkInBusy"
                  :label="t('checkIn.imHere', 'I\'m here: check in')"
                  @click="checkInHere"
                />
              </div>
              <ShiftQrScanner
                v-if="scanning && !checkedIn"
                :paused="checkInBusy"
                @detect="onStationScan"
              />
            </div>
            <p
              v-if="leadNames.length"
              class="text-muted mt-3 flex items-center gap-1.5 text-sm"
            >
              <UIcon
                name="i-lucide-shield-check"
                class="size-4"
              />
              {{ t('shift.leadOnDutyIs', 'Lead on duty: {names}', { names: leadNames.join(', ') }) }}
            </p>
            <div
              v-if="perks.length"
              class="border-default mt-3 flex flex-col gap-1.5 border-t pt-3"
            >
              <h3 class="text-highlighted text-sm font-semibold">
                {{ t('shift.perks', 'What this shift earns') }}
              </h3>
              <ul class="flex flex-col gap-1 text-sm">
                <li
                  v-for="perk in perks"
                  :key="perk.perkId"
                  class="flex items-center justify-between gap-2"
                >
                  <span>{{ perk.quantity }} × {{ tr(perk.name) }}</span>
                  <UBadge
                    :color="perkColor(perk)"
                    variant="subtle"
                    :label="perkLabel(perk)"
                  />
                </li>
              </ul>
            </div>
          </SectionCard>

          <SectionCard :title="t('shift.details', 'Shift')">
            <DescriptionList :items="facts" />
          </SectionCard>

          <SectionCard
            :title="t('shift.leadOnDuty', 'Lead on duty')"
            icon="i-lucide-shield-check"
          >
            <p
              v-if="!data.leadsOnDuty.length"
              class="text-muted text-sm"
            >
              {{ t('shift.noLead', 'No lead of your team is on shift with you yet.') }}
            </p>
            <div
              v-else
              class="flex flex-wrap gap-3"
            >
              <TableIdentity
                v-for="lead in data.leadsOnDuty"
                :key="lead.userId"
                :title="lead.name ?? `#${lead.userId}`"
                :avatar="{ src: lead.avatar ?? undefined, alt: lead.name ?? '' }"
              />
            </div>
          </SectionCard>

          <SectionCard
            :title="t('shift.swap', 'Swap')"
            icon="i-lucide-arrow-left-right"
            :description="data.settings.approval === 'lead' ? t('shift.swapApprovalHelp', 'A lead of the team approves a swap you accept.') : t('shift.swapPeerHelp', 'A swap is done as soon as you accept an offer.')"
          >
            <template
              v-if="swap"
              #actions
            >
              <div class="flex items-center gap-2">
                <UBadge
                  color="neutral"
                  variant="subtle"
                  :label="swap.kind === 'trade' ? t('swapKinds.trade', 'Trade') : t('swapKinds.release', 'Give away')"
                />
                <StatusBadge
                  :status="swap.status"
                  :label="t(`swapStatuses.${swap.status}`, SHIFT_SWAP_STATUS_LABELS[swap.status])"
                />
              </div>
            </template>
            <UAlert
              v-if="mustWorkAll"
              class="mb-3"
              color="info"
              variant="subtle"
              icon="i-lucide-info"
              :title="t('shift.tradeOnly', 'Trade only: you must work all your shifts.')"
            />
            <UAlert
              v-if="swap && !allowsSwapKind(data.settings, swap.kind)"
              class="mb-3"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :title="t('shift.swapNoLongerAllowed', 'The schedule no longer allows this kind of swap: withdraw it and open a new one.')"
            />
            <div
              v-if="swap"
              class="flex flex-col gap-3"
            >
              <p
                v-if="!waitingOffers.length"
                class="text-muted text-sm"
              >
                {{ swap.kind === 'trade'
                  ? t('shift.noTradeOffers', 'No offers yet. People who can take your shift see it in the open swaps and offer one of theirs.')
                  : t('shift.noOffers', 'No offers yet. People who can take your shift see it in the open swaps.') }}
              </p>
              <ul
                v-else
                class="divide-default divide-y"
              >
                <li
                  v-for="offer in waitingOffers"
                  :key="offer.id"
                  class="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div class="flex flex-col text-sm">
                    <span class="text-highlighted font-medium">{{ offer.person?.name ?? `#${offer.userId}` }}</span>
                    <span class="text-muted">
                      {{ offer.offeredShift
                        ? t('shift.offerBack', 'Gives you {team}, {when}', { team: tr(offer.offeredShift.teamName), when: format.range(offer.offeredShift.startsAt, offer.offeredShift.endsAt) })
                        : t('shift.offerTake', 'Takes your shift over') }}
                    </span>
                  </div>
                  <div
                    v-if="offer.status === 'offered' && swap.status === 'offered' && canAccept(offer)"
                    class="flex gap-2"
                  >
                    <UButton
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :loading="busy"
                      :label="t('shift.rejectOffer', 'Turn down offer')"
                      @click="decide(offer, false)"
                    />
                    <UButton
                      size="sm"
                      :loading="busy"
                      :label="t('shift.acceptOffer', 'Accept offer')"
                      @click="decide(offer, true)"
                    />
                  </div>
                  <UBadge
                    v-else
                    color="neutral"
                    variant="subtle"
                    :label="t(`offerStatuses.${offer.status}`, SHIFT_SWAP_OFFER_STATUS_LABELS[offer.status])"
                  />
                </li>
              </ul>
            </div>
            <p
              v-else-if="!canOpenSwap"
              class="text-muted text-sm"
            >
              {{ t('shift.cannotSwap', 'This shift cannot be swapped now.') }}
            </p>
            <template
              v-if="(swap && swap.status !== 'accepted') || (canOpenSwap && kinds.length)"
              #footer
            >
              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  v-if="swap && swap.status !== 'accepted'"
                  color="neutral"
                  variant="outline"
                  :loading="busy"
                  :label="t('shift.withdrawSwap', 'Withdraw swap')"
                  @click="withdrawSwap"
                />
                <template v-else-if="canOpenSwap">
                  <UButton
                    v-if="kinds.includes('release')"
                    :color="kinds.includes('trade') ? 'neutral' : 'primary'"
                    :variant="kinds.includes('trade') ? 'outline' : 'solid'"
                    icon="i-lucide-hand"
                    :loading="busy"
                    :label="t('shift.openRelease', 'Give shift away')"
                    @click="openSwap('release')"
                  />
                  <UButton
                    v-if="kinds.includes('trade')"
                    icon="i-lucide-arrow-left-right"
                    :loading="busy"
                    :label="t('shift.openTrade', 'Offer shift for a trade')"
                    @click="openSwap('trade')"
                  />
                </template>
              </div>
            </template>
          </SectionCard>
        </div>
      </UPageBody>
    </UPage>
    <ShiftPassFullscreen
      v-if="large && qr"
      :qr="qr"
      :code="pass?.code"
      :title="data ? `${tr(data.teamName)} · ${format.time(data.shift.startsAt)}–${format.time(data.shift.endsAt)}` : ''"
      :leads="leadNames"
      @close="large = false"
    />
  </UContainer>
</template>
