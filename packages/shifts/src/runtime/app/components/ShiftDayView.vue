<script setup lang="ts">
import { minutesInDay } from '../utils/admin-shifts'
import type { ShiftsTeamOption } from '../utils/admin-shifts'
import type { ShiftWithAssigneesDto } from '../../../types'
import { computed, useModuleT, useShiftsFormat, useShiftsTranslate } from '#imports'

defineOptions({ name: 'ShiftDayView' })

// One day of a schedule as a timeline: a row per team, the hours across, a block per shift (stacked when they overlap),
// coloured by how full it is. Plain CSS, no calendar library. Clicking a block emits `open`.
const props = defineProps<{
  shifts: ShiftWithAssigneesDto[]
  day: string
  teams: ShiftsTeamOption[]
  timeZone: string
  minPerShift?: number | null
}>()
const emit = defineEmits<{ open: [shift: ShiftWithAssigneesDto] }>()

const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const format = useShiftsFormat()

type Block = { shift: ShiftWithAssigneesDto, start: number, end: number, lane: number }

const blocks = computed(() => props.shifts.map(shift => ({
  shift,
  start: minutesInDay(shift.startsAt, props.day, props.timeZone),
  end: minutesInDay(shift.endsAt, props.day, props.timeZone),
})))

// The hours shown: from the earliest start to the latest end of the day's shifts, whole hours, at least six.
const range = computed(() => {
  if (!blocks.value.length) return { from: 8 * 60, to: 20 * 60 }
  const from = Math.floor(Math.min(...blocks.value.map(block => block.start)) / 60) * 60
  let to = Math.ceil(Math.max(...blocks.value.map(block => block.end)) / 60) * 60
  if (to - from < 6 * 60) to = from + 6 * 60
  return { from, to }
})
const hours = computed(() => {
  const list: number[] = []
  for (let minute = range.value.from; minute < range.value.to; minute += 60) list.push(minute)
  return list
})
const span = computed(() => range.value.to - range.value.from)

const rows = computed(() => {
  const teamIds = [...new Set([...props.teams.map(team => team.id), ...props.shifts.map(shift => shift.teamId)])]
  return teamIds.flatMap((teamId) => {
    const own = blocks.value.filter(block => block.shift.teamId === teamId).sort((a, b) => a.start - b.start)
    if (!own.length) return []
    const laneEnds: number[] = []
    const placed: Block[] = own.map((block) => {
      let lane = laneEnds.findIndex(end => end <= block.start)
      if (lane === -1) lane = laneEnds.push(0) - 1
      laneEnds[lane] = block.end
      return { ...block, lane }
    })
    const team = props.teams.find(item => item.id === teamId)
    return [{ teamId, name: team ? tr(team.name) : own[0]!.shift.teamName ? tr(own[0]!.shift.teamName) : teamId, lanes: laneEnds.length, blocks: placed }]
  })
})

const LANE = 52
const left = (minute: number) => `${((minute - range.value.from) / span.value) * 100}%`
const width = (block: Block) => `${(Math.max(block.end - block.start, 15) / span.value) * 100}%`
const hourLabel = (minute: number) => `${String(((minute / 60) % 24 + 24) % 24).padStart(2, '0')}:00`

function tone(shift: ShiftWithAssigneesDto) {
  if (props.minPerShift && shift.filled < props.minPerShift) return 'border-warning/60 bg-warning/10'
  if (shift.effectiveCapacity !== null && shift.filled >= shift.effectiveCapacity) return 'border-success/60 bg-success/10'
  return 'border-primary/50 bg-primary/10'
}
const fill = (shift: ShiftWithAssigneesDto) => shift.effectiveCapacity === null ? String(shift.filled) : `${shift.filled}/${shift.effectiveCapacity}`
</script>

<template>
  <div class="overflow-x-auto">
    <div class="min-w-[720px]">
      <div class="border-default grid grid-cols-[10rem_1fr] border-b">
        <div />
        <div class="relative h-7">
          <span
            v-for="hour in hours"
            :key="hour"
            class="text-muted absolute top-1 -translate-x-1/2 text-xs tabular-nums"
            :style="{ left: left(hour) }"
          >{{ hourLabel(hour) }}</span>
        </div>
      </div>
      <p
        v-if="!rows.length"
        class="text-muted p-4 text-sm"
      >
        {{ t('admin.noShiftsDay', 'No shifts on this day.') }}
      </p>
      <div
        v-for="row in rows"
        :key="row.teamId"
        class="border-default grid grid-cols-[10rem_1fr] border-b last:border-b-0"
      >
        <div class="text-highlighted truncate p-2 text-sm font-medium">
          {{ row.name }}
        </div>
        <div
          class="relative"
          :style="{ height: `${row.lanes * LANE + 8}px` }"
        >
          <div
            v-for="hour in hours"
            :key="hour"
            class="border-default/60 absolute inset-y-0 border-s"
            :style="{ left: left(hour) }"
          />
          <button
            v-for="block in row.blocks"
            :key="block.shift.id"
            type="button"
            class="absolute flex flex-col overflow-hidden rounded-md border px-2 py-1 text-start text-xs transition hover:brightness-95 focus-visible:outline-2"
            :class="tone(block.shift)"
            :style="{ left: left(block.start), width: width(block), top: `${block.lane * LANE + 4}px`, height: `${LANE - 6}px` }"
            :aria-label="`${row.name} ${format.range(block.shift.startsAt, block.shift.endsAt)}`"
            @click="emit('open', block.shift)"
          >
            <span class="text-highlighted truncate font-medium tabular-nums">{{ format.time(block.shift.startsAt) }}–{{ format.time(block.shift.endsAt) }}</span>
            <span class="text-muted truncate">
              <UIcon
                name="i-lucide-users"
                class="size-3 align-[-2px]"
              />
              {{ fill(block.shift) }}
              <template v-if="block.shift.assignees.length"> · {{ block.shift.assignees.map(item => item.person.name ?? '').filter(Boolean).join(', ') }}</template>
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
