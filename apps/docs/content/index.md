---
seo:
  title: Frigear Developer Docs
  description: Build on the Frigear Nuxt ecosystem - modules for sign-in, users, payments, events and forms, plus the layer and tooling they run on.
---

::u-page-hero
---
orientation: horizontal
---
#title
Build on the Frigear Nuxt ecosystem

#description
Copy a starter and you have a Nuxt 4 app with sign-in, account pages and an admin area. Then add the modules you need.

#links
  :::u-button
  ---
  size: xl
  to: /get-started/installation#create-the-project
  trailing-icon: i-lucide-arrow-right
  ---
  Create an app
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /modules
  variant: outline
  icon: i-lucide-blocks
  ---
  Browse modules
  :::

#default
```bash [Terminal]
pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/workspace my-app
cd my-app
corepack enable
pnpm install
pnpm prepare:env
pnpm dev
```
::

::u-page-section
#title
From zero to signed in

#description
Three steps, no outside services. You need Node.js `24`.

#features
  :::u-page-feature
  ---
  icon: i-lucide-copy
  to: /get-started/installation#create-the-project
  ---
  #title
  Copy the starter

  #description
  Copy the workspace starter with giget and install it with pnpm.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-play
  to: /get-started/installation#run-it-for-the-first-time
  ---
  #title
  Run it

  #description
  Run `pnpm prepare:env`, put your email in `NUXT_ACL_ADMINS` in `apps/web/.env`, then run `pnpm dev`.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-log-in
  to: /get-started/installation#sign-in
  ---
  #title
  Sign in

  #description
  Register with that email. You land on `/account`, and `/admin` is yours.
  :::
::

::u-page-section
#title
Pick a starter

#description
Each starter is a pnpm workspace you copy and run on the published `@frigear-nu` packages.

#features
  :::u-page-feature
  ---
  icon: i-lucide-rocket
  to: /examples/starters/workspace#create-the-project
  ---
  #title
  Workspace

  #description
  For a website: one Nuxt app with registration, sign-in, account pages and a user admin. Start here if unsure.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-smartphone
  to: /examples/starters/mobile#create-the-project
  ---
  #title
  Mobile

  #description
  For an iOS and Android app that signs in at a server you already have, such as frigear.nu.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-tablet-smartphone
  to: /examples/starters/mobile-standalone#create-the-project
  ---
  #title
  Mobile standalone

  #description
  For an app with its own users and API: the workspace starter plus a mobile app that signs in at it.
  :::
::

::u-page-section
#title
Then add what you need

#description
Modules install what they depend on, so you add only the ones you want. [Adding modules](/get-started/adding-modules) shows how.

#features
  :::u-page-feature
  ---
  icon: i-lucide-user-round
  to: /modules#identity
  ---
  #title
  Identity

  #description
  Sign-in, users, account pages, roles and OAuth.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-credit-card
  to: /modules#commerce
  ---
  #title
  Commerce

  #description
  Stripe customers, one-time payments and subscriptions.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-ticket
  to: /modules#features
  ---
  #title
  Features

  #description
  Events with tickets, forms, cookie consent and MCP tools.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-layout-dashboard
  to: /modules#interface
  ---
  #title
  Interface

  #description
  Shared components, the admin shell, menus, widgets and the mobile shell.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-wrench
  to: /modules#platform
  ---
  #title
  Platform

  #description
  Email and SMS, email templates, the base layer and helpers for writing modules.
  :::
::

::u-page-section
#title
Common tasks

#description
Short walkthroughs you can copy into your app. For the ideas behind them, read the [Guide](/guide/concepts/architecture).

#features
  :::u-page-feature
  ---
  icon: i-lucide-shield-check
  to: /examples/tasks/protect-a-route
  ---
  #title
  Protect a route

  #description
  Require a signed-in user, limit by scope, restrict to cookie sessions.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-layout-dashboard
  to: /examples/tasks/add-an-admin-page
  ---
  #title
  Add an admin page

  #description
  A list page with a sidebar entry in the admin area.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-ticket
  to: /examples/tasks/sell-event-tickets
  ---
  #title
  Sell event tickets

  #description
  Paid and free tickets with Events, Payments and Stripe.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-clipboard-list
  to: /examples/tasks/build-a-form
  ---
  #title
  Build a form

  #description
  Define a form in code and publish it with email delivery.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-mail
  to: /examples/tasks/send-an-email
  ---
  #title
  Send an email

  #description
  A branded email from a Vue template, with a delivery driver.
  :::
::

::u-page-section
#title
Contribute to Frigear

#description
Change a module, the layer or these docs in the monorepo, keep the starters in step and release packages.

#links
  :::u-button
  ---
  color: neutral
  to: /contribute/overview
  variant: outline
  icon: i-lucide-git-pull-request
  ---
  Contributor guide
  :::
::
