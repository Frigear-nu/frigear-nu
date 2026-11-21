<script setup lang="ts">
import { isNarrowerOrEqual } from '@frigear-nu/audience'
import type { Visibility } from '@frigear-nu/audience'
import { computed, reactive, ref, useFetch, useModuleT, watch } from '#imports'

defineOptions({ name: 'FaqVisibilityEditor' })

// The roles admin route of `@frigear-nu/authorization` (`authorizationApi.admin.roles`). Authorization is optional for this
// package, so its path builders are not imported: the path is spelled out here, and a 403 or 404 means "no list".
const ROLES_PATH = '/api/admin/authorization/roles'

// Edits a `visibility` value (see `@frigear-nu/audience`): public, or signed-in viewers narrowed by global roles, a team role
// and an operation. `null` is "signed-in viewers". The model only changes when the editor does: opening a stored
// value and saving it untouched sends it back exactly as it was.
//
// For an item, pass `parent` (the group's visibility) and `inheritable`: the item can inherit the group (`null`), and the
// editor warns when what is set would show the item to more people than its group.
const props = defineProps<{
  parent?: Visibility | null
  /** Offer "Same as the group". Used for items. */
  inheritable?: boolean
}>()
const model = defineModel<Visibility | null | undefined>()

const t = useModuleT('faq')

type State = { public: boolean, roles: string[], teamKind: string, teamRole: string, operationId: string }
const read = (value: Visibility | null | undefined): State => ({
  public: value?.public === true,
  roles: [...(value?.globalRoles ?? [])],
  teamKind: value?.minTeamRole?.kind ?? '',
  teamRole: value?.minTeamRole?.role ?? '',
  operationId: value?.operationId ?? '',
})

const state = reactive<State>(read(model.value))
// For an item, "same as the group" is on while it has no visibility of its own. Turning it off opens the rules; an item
// with none set still inherits, as `null` and `{}` mean the same on an item.
const inherit = ref(!!props.inheritable && !model.value)
watch(inherit, (value) => {
  if (value) model.value = null
})

function build() {
  if (state.public) {
    model.value = { public: true }
    return
  }
  const next: Visibility = {}
  if (state.roles.length) next.globalRoles = [...state.roles]
  if (state.teamKind.trim() && state.teamRole.trim()) next.minTeamRole = { kind: state.teamKind.trim(), role: state.teamRole.trim() }
  if (state.operationId.trim()) next.operationId = state.operationId.trim()
  model.value = Object.keys(next).length ? next : null
}

// Edits go through `build`; a value changed from outside (a reloaded record) refreshes the fields.
watch(model, (value) => {
  if (JSON.stringify(read(value)) !== JSON.stringify(state)) Object.assign(state, read(value))
})

// The registered roles to pick from, when the roles admin of `@frigear-nu/authorization` is there and the caller may read
// it. Otherwise the roles are typed in as tags.
const { data: roles } = useFetch<{ name: string, label: string }[]>(ROLES_PATH, {
  key: 'faq:role-options',
  server: false,
  lazy: true,
  default: () => [],
  onResponseError: () => {},
})
const roleItems = computed(() => (roles.value ?? []).map(role => ({ label: role.label || role.name, value: role.name })))

// Roles stored in the value that the list does not know stay visible and removable.
const roleOptions = computed(() => [
  ...roleItems.value,
  ...state.roles.filter(name => !roleItems.value.some(item => item.value === name)).map(name => ({ label: name, value: name })),
])

const widens = computed(() => !!props.parent && !inherit.value && !isNarrowerOrEqual(props.parent, model.value))
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <USwitch
      v-if="inheritable"
      v-model="inherit"
      :label="t('admin.visibility.inherit', 'Same as the group')"
      :description="t('admin.visibility.inheritHelp', 'The question is visible to the people who can see its group. Turn this off to narrow it further.')"
    />

    <template v-if="!inherit">
      <USwitch
        v-model="state.public"
        :label="t('admin.visibility.public', 'Public')"
        :description="t('admin.visibility.publicHelp', 'Everyone sees it, also without signing in. Nothing else below applies then.')"
        @update:model-value="build"
      />

      <template v-if="!state.public">
        <p class="text-muted text-sm">
          {{ t('admin.visibility.signedIn', 'Signed-in people see it. Narrow it down with any of the rules below; all that are set must hold.') }}
        </p>
        <UFormField
          :label="t('admin.visibility.roles', 'Roles')"
          :description="t('admin.visibility.rolesHelp', 'Anyone holding at least one of these roles.')"
        >
          <USelectMenu
            v-if="roleItems.length"
            v-model="state.roles"
            :items="roleOptions"
            value-key="value"
            multiple
            class="w-full"
            :placeholder="t('admin.visibility.anyRole', 'Any signed-in person')"
            @update:model-value="build"
          />
          <TagInput
            v-else
            v-model="state.roles"
            :placeholder="t('admin.visibility.rolesPlaceholder', 'Type a role and press Enter')"
            @update:model-value="build"
          />
        </UFormField>
        <UFormField
          :label="t('admin.visibility.teamRole', 'Team role')"
          :description="t('admin.visibility.teamRoleHelp', 'At least this role in a team of this kind, for example bar and ba.')"
        >
          <div class="flex gap-2">
            <UInput
              v-model="state.teamKind"
              class="w-full"
              :placeholder="t('admin.visibility.teamKind', 'Team kind')"
              @update:model-value="build"
            />
            <UInput
              v-model="state.teamRole"
              class="w-full"
              :placeholder="t('admin.visibility.teamRoleName', 'Role')"
              @update:model-value="build"
            />
          </div>
        </UFormField>
        <UFormField
          :label="t('admin.visibility.operation', 'Operation')"
          :description="t('admin.visibility.operationHelp', 'Only people who take part in the operation with this id.')"
        >
          <UInput
            v-model="state.operationId"
            class="w-full"
            @update:model-value="build"
          />
        </UFormField>
      </template>
    </template>

    <UAlert
      v-if="widens"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('admin.visibility.widens', 'This shows the question to more people than its group')"
      :description="t('admin.visibility.widensHelp', 'An item can only narrow its group, so people the group hides it from will still not see it.')"
    />
  </div>
</template>
