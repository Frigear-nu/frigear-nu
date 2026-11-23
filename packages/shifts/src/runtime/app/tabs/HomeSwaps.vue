<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import { SHIFT_SWAP_OFFER_STATUS_LABELS } from '../../utils/status'
import { allowsSwapKind } from '../../utils/settings'
import type { MyShiftDto, ShiftSwapDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, onMounted, reactive, ref, useAction, useAuthPages, useLazyFetch, useModuleT, useRoute, useShiftsFormat, useShiftsLinks, useShiftsTranslate, watch } from '#imports'

defineOptions({ name: 'ShiftsHomeSwapsTab' })

// The swap marketplace: shifts other people want to trade or give away that I can take. A trade asks for one of my own
// shifts in return (required); a shift given away is taken over without one. My own open swaps are listed first. The
// Swaps tab of the crew home (`crew.dashboard`), and the body of the swaps page where there is one.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()
const { busy, run } = useAction()
const route = useRoute()

const { data: swaps, status, error, refresh } = useLazyFetch<ShiftSwapDto[]>(shiftsApi.swaps, { key: 'shifts:swaps', default: () => [] })
const { data: mine, refresh: refreshMine } = useLazyFetch<MyShiftDto[]>(shiftsApi.me.shifts, { key: 'shifts:me', default: () => [] })
const loading = computed(() => status.value === 'pending' && !swaps.value.length)
// The pages around it are for signed-in people; a session that ran out goes to the sign-in page and comes back.
watch(() => error.value?.statusCode, async (code) => {
  if (code === 401) await navigateTo({ path: useAuthPages().login, query: { redirect: route.fullPath } })
}, { immediate: true })

// A page clock, set in the browser only, so the first render matches the server's.
const now = ref(0)
onMounted(() => (now.value = Date.now()))
const upcomingMine = computed(() => mine.value.filter(item => item.assignment.status === 'assigned' && Date.parse(item.shift.startsAt) > now.value))
const myOpen = computed(() => upcomingMine.value.filter(item => item.swap))
// Per trade: the shift of mine I give in return (required). A trade aimed at one of my shifts only takes that one. My
// shift's schedule must allow trades too, and where either schedule asks for every shift to be worked, both shifts are
// in the same schedule (the server answers 409 `handover_cross_schedule` otherwise).
const giving = reactive<Record<string, string>>({})
const givingOptions = (swap: ShiftSwapDto) => upcomingMine.value
  .filter(item => !swap.wantedAssignmentId || item.assignment.id === swap.wantedAssignmentId)
  .filter(item => allowsSwapKind(item.settings, 'trade'))
  .filter(item => item.shift.scheduleId === swap.shift.scheduleId || (swap.settings.coverage !== 'all' && item.settings.coverage !== 'all'))
  .map(item => ({ label: `${tr(item.teamName)} · ${format.range(item.shift.startsAt, item.shift.endsAt)}`, value: item.assignment.id }))

async function offer(swap: ShiftSwapDto) {
  const back = swap.kind === 'trade' ? giving[swap.id] ?? swap.wantedAssignmentId ?? null : null
  if (swap.kind === 'trade' && !back) return
  const done = await run(
    () => $fetch(shiftsApi.offers(swap.id), { method: 'POST', body: { assignmentId: back } }).then(() => true),
    swap.kind === 'trade'
      ? { success: t('swaps.tradeOffered', 'Offered {name} a trade', { name: swap.owner.name ?? '' }), error: t('swaps.offerFailed', 'Could not make the offer') }
      : { success: t('swaps.offered', 'Offered to take the shift of {name}', { name: swap.owner.name ?? '' }), error: t('swaps.offerFailed', 'Could not make the offer') },
  )
  if (done) await Promise.all([refresh(), refreshMine()])
}

async function withdraw(swap: ShiftSwapDto) {
  if (!swap.myOffer) return
  const done = await run(
    () => $fetch(shiftsApi.offer(swap.id, swap.myOffer!.id), { method: 'DELETE' }).then(() => true),
    { success: t('swaps.offerWithdrawn', 'Withdrew your offer'), error: t('swaps.offerWithdrawFailed', 'Could not withdraw the offer') },
  )
  if (done) await refresh()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard
      v-if="myOpen.length"
      :title="t('swaps.mine', 'Your shifts on offer')"
      icon="i-lucide-megaphone"
      flush
    >
      <ul class="divide-default divide-y">
        <li
          v-for="item in myOpen"
          :key="item.assignment.id"
          class="flex items-center justify-between gap-2 px-4 py-2.5"
        >
          <span class="text-sm">{{ tr(item.teamName) }} · {{ format.range(item.shift.startsAt, item.shift.endsAt) }}</span>
          <UButton
            :to="links.shift(item.assignment.id)"
            size="sm"
            color="neutral"
            variant="outline"
            :label="t('swaps.seeOffers', 'See offers')"
          />
        </li>
      </ul>
    </SectionCard>

    <div
      v-if="loading"
      class="flex flex-col gap-3"
      aria-busy="true"
    >
      <SectionCard
        v-for="index in 2"
        :key="index"
        loading
      />
    </div>
    <UEmpty
      v-else-if="error && error.statusCode !== 401"
      icon="i-lucide-circle-alert"
      :title="t('swaps.loadFailed', 'The swaps could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <UEmpty
      v-else-if="!swaps.length"
      icon="i-lucide-arrow-left-right"
      :title="t('swaps.empty', 'No open swaps for you')"
      :description="t('swaps.emptyDescription', 'When somebody on your team offers a shift you can take, it shows up here.')"
    />
    <div
      v-else
      class="flex flex-col gap-3"
      data-shifts-swaps
    >
      <SectionCard
        v-for="swap in swaps"
        :key="swap.id"
        :title="`${tr(swap.shift.teamName)} · ${format.range(swap.shift.startsAt, swap.shift.endsAt)}`"
        :description="t('swaps.from', 'From {name} · {schedule}', { name: swap.owner.name ?? '', schedule: tr(swap.shift.scheduleName) })"
      >
        <template #actions>
          <div class="flex items-center gap-2">
            <UBadge
              color="neutral"
              variant="subtle"
              :label="swap.kind === 'trade' ? t('swapKinds.trade', 'Trade') : t('swapKinds.release', 'Give away')"
            />
            <UBadge
              v-if="swap.myOffer"
              color="primary"
              variant="subtle"
              :label="t(`offerStatuses.${swap.myOffer.status}`, SHIFT_SWAP_OFFER_STATUS_LABELS[swap.myOffer.status])"
            />
          </div>
        </template>
        <UAlert
          v-if="swap.settings.coverage === 'all'"
          class="mb-3"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          :title="t('shift.tradeOnly', 'Trade only: you must work all your shifts.')"
        />
        <p
          v-if="swap.wantedShift && !swap.myOffer"
          class="text-muted mb-3 text-sm"
        >
          {{ t('swaps.wants', 'Wants your shift on {team}, {when}', { team: tr(swap.wantedShift.teamName), when: format.range(swap.wantedShift.startsAt, swap.wantedShift.endsAt) }) }}
        </p>
        <div
          v-if="!swap.myOffer && swap.kind === 'trade'"
          class="flex flex-wrap items-end gap-2"
        >
          <UFormField
            :label="t('swaps.giveBack', 'You give in return')"
            :description="givingOptions(swap).length ? undefined : t('swaps.nothingToTrade', 'You have no upcoming shift to trade.')"
            required
            class="min-w-64 flex-1"
          >
            <USelect
              v-model="giving[swap.id]"
              :items="givingOptions(swap)"
              :placeholder="t('swaps.pickShift', 'Choose one of your shifts')"
              :disabled="!givingOptions(swap).length"
              class="w-full"
            />
          </UFormField>
          <UButton
            :loading="busy"
            :disabled="!giving[swap.id] && !swap.wantedAssignmentId"
            :label="t('swaps.tradeAction', 'Offer a trade')"
            @click="offer(swap)"
          />
        </div>
        <div
          v-else-if="!swap.myOffer"
          class="flex justify-end"
        >
          <UButton
            :loading="busy"
            :label="t('swaps.offerAction', 'Take the shift over')"
            @click="offer(swap)"
          />
        </div>
        <div
          v-else
          class="flex items-center justify-between gap-2"
        >
          <span class="text-muted text-sm">
            {{ swap.myOffer.offeredShift
              ? t('swaps.youGive', 'You give {team}, {when}', { team: tr(swap.myOffer.offeredShift.teamName), when: format.range(swap.myOffer.offeredShift.startsAt, swap.myOffer.offeredShift.endsAt) })
              : t('swaps.youTake', 'You take the shift over') }}
          </span>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :loading="busy"
            :label="t('swaps.withdrawOffer', 'Withdraw offer')"
            @click="withdraw(swap)"
          />
        </div>
      </SectionCard>
    </div>
  </div>
</template>
