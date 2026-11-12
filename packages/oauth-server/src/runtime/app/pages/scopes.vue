<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminOAuthScopeDto } from '../../../types'
import { computed, errorMessage, tableUi, useModuleT, useOAuthScopeActions, useOAuthScopes, useRuntimeConfig } from '#imports'

defineOptions({ name: 'OAuthScopesAdminPage' })

const t = useModuleT('oauthServer')
const { scopes, data, error, loading, refresh } = await useOAuthScopes()
const actions = useOAuthScopeActions()
const applicationsPath = (useRuntimeConfig().public.oauthServer as { pages?: { admin?: string } } | undefined)?.pages?.admin

const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const failed = computed(() => !!error.value && !forbidden.value && !data.value)

const columns = computed<TableColumn<AdminOAuthScopeDto>[]>(() => [
  { accessorKey: 'name', header: t('scopes.scope', 'Scope') },
  { id: 'permissions', header: t('scopes.permissions', 'Permissions') },
  { id: 'actions', header: '', meta: { class: { th: 'w-0', td: 'w-0' } } },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('scopes.title', 'OAuth scopes')"
      :description="t('scopes.description', 'Names applications can ask for, each standing for a set of permissions.')"
      :breadcrumb="applicationsPath ? [{ label: t('admin.title', 'OAuth applications'), to: applicationsPath }] : undefined"
    >
      <template
        v-if="!forbidden"
        #actions
      >
        <UButton
          icon="i-lucide-plus"
          :label="t('scopes.new', 'Add scope')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="forbidden"
      icon="i-lucide-lock"
      :title="t('scopes.forbiddenTitle', 'You are not allowed to manage OAuth scopes')"
      :description="t('admin.forbiddenDescription', 'Ask an administrator for access.')"
    />
    <UEmpty
      v-else-if="failed"
      icon="i-lucide-circle-alert"
      :title="t('scopes.loadFailed', 'OAuth scopes could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <TableCard
      v-else
      :loading="loading"
    >
      <UTable
        :data="scopes"
        :columns="columns"
        :ui="tableUi()"
        @select="(_event, row) => actions.edit(row.original)"
      >
        <template #name-cell="{ row }">
          <TableIdentity
            :title="row.original.label || row.original.name"
            :description="row.original.name"
            :avatar="{ icon: row.original.icon || 'i-lucide-key-round' }"
          >
            <template #badges>
              <UBadge
                v-if="row.original.managed"
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-file-cog"
                :label="t('admin.managed', 'Managed in nuxt.config')"
              />
              <UBadge
                v-if="!row.original.isActive"
                color="neutral"
                variant="subtle"
                size="sm"
                :label="t('admin.disabled', 'Disabled')"
              />
            </template>
          </TableIdentity>
        </template>
        <template #permissions-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="permission in row.original.permissions"
              :key="permission"
              variant="subtle"
              :label="permission"
            />
          </div>
        </template>
        <template #actions-cell="{ row }">
          <RowMenu
            :items="actions.menu(row.original)"
            :subject="row.original.name"
          />
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-key-round"
            :title="t('scopes.emptyTitle', 'No scopes yet')"
            :description="t('scopes.emptyDescription', 'Add a scope to let applications ask for a set of permissions under one name.')"
            :actions="[{ label: t('scopes.new', 'Add scope'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
