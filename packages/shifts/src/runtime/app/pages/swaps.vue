<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import { SHIFT_SWAP_OFFER_STATUS_LABELS } from '../../utils/status'
import type { MyShiftDto, ShiftSwapDto } from '../../../types'
import { $fetch, computed, errorMessage, navigateTo, reactive, useAction, useAuthPages, useFetch, useHead, useModuleT, useRoute, useShiftsFormat, useShiftsLinks, useShiftsTranslate, useState } from '#imports'

defineOptions({ name: 'ShiftsSwapsPage' })

// The swap marketplace: shifts other people want to give away that I can take, with an offer to take each one over or
// to give one of my own shifts back. My own open swaps are listed first.
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()
const links = useShiftsLinks()
const { busy, run } = useAction()
const route = useRoute()

const { data: swaps, error, refresh } = await useFetch<ShiftSwapDto[]>(shiftsApi.swaps, { key: 'shifts:swaps', default: () => [] })
if (error.value?.statusCode === 401) {
  await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}
const { data: mine, refresh: refreshMine } = await useFetch<MyShiftDto[]>(shiftsApi.me.shifts, { key: 'shifts:me', default: () => [] })

// The server's clock, carried to the client, so the first render matches.
const now = useState('shifts:now', () => Date.now())
const upcomingMine = computed(() => mine.value.filter(item => item.assignment.status === 'assigned' && Date.parse(item.shift.startsAt) > now.value))
const myOpen = computed(() => upcomingMine.value.filter(item => item.swap))
const TAKE = '__take__'
// Per swap: what I give back (one of my shifts, or nothing).
const giving = reactive<Record<string, string>>({})
const givingOptions = computed(() => [
  { label: t('swaps.giveNothing', 'Nothing: I take the shift over'), value: TAKE },
  ...upcomingMine.value.map(item => ({ label: `${tr(item.teamName)} · ${format.range(item.shift.startsAt, item.shift.endsAt)}`, value: item.assignment.id })),
])

async function offer(swap: ShiftSwapDto) {
  const back = giving[swap.id] && giving[swap.id] !== TAKE ? giving[swap.id] : null
  const done = await run(
    () => $fetch(shiftsApi.offers(swap.id), { method: 'POST', body: { assignmentId: back } }).then(() => true),
    { success: t('swaps.offered', 'Offered to take the shift of {name}', { name: swap.owner.name ?? '' }), error: t('swaps.offerFailed', 'Could not make the offer') },
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

useHead({ title: () => t('swaps.title', 'Open swaps') })
</script>

<template>
  <UContainer>
    <UPage>
      <UPageHeader
        :title="t('swaps.title', 'Open swaps')"
        :description="t('swaps.description', 'Shifts others want to give away that you can take. You can give one of your own shifts back.')"
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
      <UPageBody class="max-w-3xl">
        <SectionCard
          v-if="myOpen.length"
          :title="t('swaps.mine', 'Your shifts on offer')"
        >
          <ul class="divide-default divide-y">
            <li
              v-for="item in myOpen"
              :key="item.assignment.id"
              class="flex items-center justify-between gap-2 py-2"
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

        <UEmpty
          v-if="error && error.statusCode !== 401"
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
        >
          <SectionCard
            v-for="swap in swaps"
            :key="swap.id"
            :title="`${tr(swap.shift.teamName)} · ${format.range(swap.shift.startsAt, swap.shift.endsAt)}`"
            :description="t('swaps.from', 'From {name} · {schedule}', { name: swap.owner.name ?? '', schedule: tr(swap.shift.scheduleName) })"
          >
            <template
              v-if="swap.myOffer"
              #actions
            >
              <UBadge
                color="primary"
                variant="subtle"
                :label="t(`offerStatuses.${swap.myOffer.status}`, SHIFT_SWAP_OFFER_STATUS_LABELS[swap.myOffer.status])"
              />
            </template>
            <div
              v-if="!swap.myOffer"
              class="flex flex-wrap items-end gap-2"
            >
              <UFormField
                :label="t('swaps.giveBack', 'You give back')"
                class="min-w-64 flex-1"
              >
                <USelect
                  v-model="giving[swap.id]"
                  :items="givingOptions"
                  :placeholder="t('swaps.giveNothing', 'Nothing: I take the shift over')"
                  class="w-full"
                />
              </UFormField>
              <UButton
                :loading="busy"
                :label="t('swaps.offerAction', 'Offer to take it')"
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
      </UPageBody>
    </UPage>
  </UContainer>
</template>
