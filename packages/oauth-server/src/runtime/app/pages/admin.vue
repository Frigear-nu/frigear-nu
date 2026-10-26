<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminApplicationDto } from '../../../types'

type Application = AdminApplicationDto

defineOptions({ name: 'OAuthAdminPage' })

const t = useModuleT('oauthServer')
const { applications, status, error } = useOAuthApplications()
const actions = useOAuthApplicationActions()

const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

const columns = computed<TableColumn<Application>[]>(() => [
  { accessorKey: 'name', header: t('admin.application', 'Application') },
  { id: 'access', header: t('admin.access', 'Access') },
  { id: 'grants', header: t('admin.signedIn', 'Signed in'), meta: numericColumn },
  { id: 'actions', header: '', meta: { class: { th: 'w-0', td: 'w-0' } } },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'OAuth applications')"
      :description="t('admin.description', 'The applications users can sign in to with their account.')"
    >
      <template
        v-if="!forbidden"
        #actions
      >
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.new', 'Add application')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbiddenTitle', 'You are not allowed to manage OAuth applications')"
      :description="t('admin.forbiddenDescription', 'Ask an administrator for access.')"
    />
    <TableCard
      v-else
      :loading="status === 'pending' && !applications.length"
      :refreshing="status === 'pending' && !!applications.length"
    >
      <UTable
        :data="applications"
        :columns="columns"
        :ui="tableUi()"
        @select="(_event, row) => actions.edit(row.original)"
      >
        <template #name-cell="{ row }">
          <TableIdentity
            :title="row.original.name"
            :description="row.original.websiteUrl"
            :avatar="{ icon: row.original.icon || 'i-lucide-globe' }"
          >
            <template #badges>
              <UBadge
                v-if="row.original.clientType === 'public'"
                color="info"
                variant="subtle"
                size="sm"
                :label="t('admin.public', 'Public')"
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
        <template #access-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="role in row.original.allowedRoles"
              :key="role"
              variant="subtle"
              :label="role"
            />
            <UBadge
              v-if="!row.original.allowedRoles.length"
              color="neutral"
              variant="subtle"
              :label="t('admin.everyone', 'Every signed-in user')"
            />
          </div>
        </template>
        <template #grants-cell="{ row }">
          {{ row.original.activeGrants ?? 0 }}
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
            icon="i-lucide-app-window"
            :title="t('admin.emptyTitle', 'No applications yet')"
            :description="t('admin.emptyDescription', 'Add an application to let users sign in to it with their account.')"
            :actions="[{ label: t('admin.new', 'Add application'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
