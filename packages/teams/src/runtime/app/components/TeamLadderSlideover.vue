<script setup lang="ts">
import { teamLadderIssues } from '../../utils/ladders'
import type { StaffTeamLadder } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import type { TeamLadderRole, Translated } from '../../../types'
import { $fetch, computed, reactive, useAction, useModuleT, useTeamsTranslate } from '#imports'

defineOptions({ name: 'TeamLadderSlideover' })

// Edits the ladder of a team kind: its roles from lowest to highest, and the lowest role that leads a team. A role
// still held by a member, or used by a rule, cannot be removed (the API answers 409). Closes with the saved ladder.
const props = defineProps<{ ladder: StaffTeamLadder }>()
const emit = defineEmits<{ close: [saved: StaffTeamLadder | false] }>()

const t = useModuleT('teams')
const tr = useTeamsTranslate()
const { busy, run } = useAction()

const state = reactive<{ roles: Array<{ key: string, label: Translated | undefined }>, leadFrom: string }>({
  roles: props.ladder.roles.map(role => ({ key: role.key, label: role.label })),
  leadFrom: props.ladder.leadFrom ?? '',
})

const NONE = '__none'
const leadOptions = computed(() => [
  { label: t('admin.noLead', 'Nobody leads'), value: NONE },
  ...state.roles.filter(role => role.key).map(role => ({ label: tr(role.label) || role.key, value: role.key })),
])
const leadFrom = computed({
  get: () => state.leadFrom || NONE,
  set: (value: string) => { state.leadFrom = value === NONE ? '' : value },
})

const roles = computed<TeamLadderRole[]>(() => state.roles.map(role => ({ key: role.key.trim(), label: role.label ?? role.key })))
const issues = computed(() => teamLadderIssues({ roles: roles.value, leadFrom: state.leadFrom || null }))

function move(index: number, by: -1 | 1) {
  const [role] = state.roles.splice(index, 1)
  state.roles.splice(index + by, 0, role!)
}

async function save() {
  if (issues.value.length) return
  const saved = await run(
    () => $fetch<StaffTeamLadder>(teamsApi.admin.ladder(props.ladder.kind), { method: 'PUT', body: { roles: roles.value, leadFrom: state.leadFrom || null } }),
    { success: t('admin.ladderSaved', 'Saved the {kind} ladder', { kind: props.ladder.kind }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="team-ladder-form"
    :title="t('admin.editLadder', 'Edit the {kind} ladder', { kind: ladder.kind })"
    :description="t('admin.ladderHelp', 'Roles from lowest to highest. Keys are stored on members and rules: use lower case letters.')"
    :submit-label="t('admin.saveLadder', 'Save ladder')"
    :loading="busy"
    :disabled="issues.length > 0"
    @close="emit('close', false)"
  >
    <form
      id="team-ladder-form"
      class="flex flex-col gap-4"
      @submit.prevent="save"
    >
      <div
        v-for="(role, index) in state.roles"
        :key="index"
        class="flex flex-col gap-2 rounded-md border border-default p-3"
      >
        <div class="flex items-center gap-2">
          <UInput
            v-model="role.key"
            :aria-label="t('admin.roleKey', 'Key')"
            :placeholder="t('admin.roleKey', 'Key')"
            class="flex-1"
          />
          <UButton
            icon="i-lucide-arrow-up"
            color="neutral"
            variant="ghost"
            :disabled="index === 0"
            :aria-label="t('admin.moveUp', 'Move up')"
            @click="move(index, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            color="neutral"
            variant="ghost"
            :disabled="index === state.roles.length - 1"
            :aria-label="t('admin.moveDown', 'Move down')"
            @click="move(index, 1)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            :disabled="state.roles.length === 1"
            :aria-label="t('admin.removeRole', 'Remove role')"
            @click="state.roles.splice(index, 1)"
          />
        </div>
        <TranslatedInput v-model="role.label" />
      </div>
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :label="t('admin.addRole', 'Add role')"
        class="self-start"
        @click="state.roles.push({ key: '', label: undefined })"
      />
      <UFormField
        :label="t('admin.leadFrom', 'Leads from')"
        :description="t('admin.leadFromHelp', 'People with this role or higher lead their team.')"
      >
        <USelect
          v-model="leadFrom"
          :items="leadOptions"
          class="w-full"
        />
      </UFormField>
      <UAlert
        v-if="issues.length"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="issues.join(' ')"
      />
    </form>
  </FormSlideover>
</template>
