import { DOCS, type Migration } from '../upgrade/migrate.ts'

/** admin 0.1.3 removed the `Admin*` page components in favour of the `@frigear-nu/ui` patterns. */
export const adminComponents: Migration = {
  id: 'admin-components',
  package: '@frigear-nu/admin',
  since: '0.1.3',
  title: 'Admin* components are replaced by @frigear-nu/ui',
  docs: `${DOCS}/guide/ux-patterns`,
  rules: [
    {
      pattern: /<Admin(?:PageHeader|Page|Section|Toolbar|Empty|Table|StatCard|KeyValue|ListCard)\b/g,
      message: 'Removed: use the `@frigear-nu/ui` patterns (`PageHeading`, `SectionCard`, `PageToolbar`, `TableCard`, `UEmpty`, …). Props and slots differ.',
    },
  ],
}

/** account 0.1.3 redesigned the account layout; `AccountHeaderRight` became `AccountIdentity`. */
export const accountComponents: Migration = {
  id: 'account-components',
  package: '@frigear-nu/account',
  since: '0.1.3',
  title: 'AccountHeaderRight is AccountIdentity',
  docs: `${DOCS}/guide/ux-patterns`,
  rules: [
    {
      pattern: /\bAccountHeaderRight\b/g,
      message: 'Removed with the account layout redesign: use `AccountIdentity`, and `AccountHeader` for a page heading.',
    },
  ],
}
