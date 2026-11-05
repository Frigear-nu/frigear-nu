# UX pattern screenshots

Taken at 1440 px wide, light colour scheme, PNG, from the website app (`apps/website`) running on localhost with the
English locale (`/en/...`), a throwaway staff account, and three events created through the admin UI. Files live in
`apps/docs/public/images/ux-patterns/`.

| File | What it shows (alt text) | Docs page and section | URL |
| --- | --- | --- | --- |
| layouts-and-navigation-public.png | A public page with the site header at the top, the page content and the site footer, full page height (1440x1232). | layouts-and-navigation, public pages | /en/events |
| layouts-and-navigation-admin.png | The admin dashboard with the sidebar groups (Dashboard, Manage, Settings), the breadcrumb navbar and the account menu in the sidebar footer. | layouts-and-navigation, admin area | /en/admin |
| layouts-and-navigation-account.png | The account area inside the site chrome, with the left section list (Overview, Profile, Membership, Security and more). | layouts-and-navigation, account area | /en/account |
| pages-list.png | An admin list: heading with description and a primary "New event" action, search and status filter, a table in a card with status badges and a row menu column. | pages, lists | /en/admin/events |
| pages-row-menu.png | The same list with a row menu open: Open, Duplicate, and a red Delete event item in its own group. | pages, lists (row menu) | /en/admin/events |
| pages-detail.png | An event detail page with a breadcrumb back to the list, a title with status badge, a summary card, tabs (Details, Tickets, Attendees) and a form card with label and control rows. | pages, detail pages | /en/admin/events/evn_9e75f4a360c348cf901f0327b69c19d3 |
| pages-empty.png | An empty list showing an icon, a title, a one-line hint and a single "New event" action. | pages, empty states | /en/admin/events (before any event existed) |
| forms-and-actions-create.png | The "New event" slideover open over the list, with a filled form and Cancel and Create draft buttons at the bottom. | forms-and-actions, create and edit | /en/admin/events |
| forms-and-actions-confirm.png | A confirm dialog titled "Delete Board workshop?" that says what else is deleted, with Cancel and a red Delete event button. | forms-and-actions, destructive actions | /en/admin/events |
| forms-and-actions-settings.png | An account settings page with section cards of label and control rows (hint under the label) and the save button in the card footer. | forms-and-actions, inline settings forms | /en/account/profile |
| text-and-formatting-badges.png | A table crop showing Archived, Published and Draft status badges and dates formatted as "Dec 20, 2026, 10:00 AM" (1152x245). | text-and-formatting, status badges and dates | /en/admin/events |

## Notes

- No money value is shown anywhere: the app has no payments yet, so the money half of the formatting example is not covered.
- The default locale is Danish (`da`); all shots use the `/en` prefix.
- The cookie banner was declined and dev overlays (Nuxt hints, devtools) were hidden before each capture.
