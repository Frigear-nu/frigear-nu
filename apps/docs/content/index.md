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
Every app needs sign-in, account pages and an admin area before it can do its real job. Copy a starter and those
already work in a Nuxt 4 app. Then add only the modules you need.

#links
  :::u-button
  ---
  size: xl
  to: /get-started/installation#_1-create-the-project
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
pnpm create frigear-app my-app --platform web && cd my-app
```
::

::u-page-section
#title
From zero to signed in

#description
Three steps and no outside services. You need Node.js `24`.

#features
  :::u-page-feature
  ---
  icon: i-lucide-copy
  to: /get-started/installation#_1-create-the-project
  ---
  #title
  Create the app

  #description
  Run `pnpm create frigear-app`. It copies a starter, installs it and fills in `.env`.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-play
  to: /get-started/installation#_2-run-it-for-the-first-time
  ---
  #title
  Run it

  #description
  Put your email in `NUXT_ACL_ADMINS` in `apps/web/.env`. Then run `pnpm dev`.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-log-in
  to: /get-started/installation#_3-sign-in
  ---
  #title
  Sign in

  #description
  Sign up with that email. You land on `/account`, and the admin area at `/admin` is open to you.
  :::
::

::u-page-section
#title
Pick a starter

#description
Each starter is a ready-made project you copy. It runs on the published `@frigear-nu` modules.

#features
  :::u-page-feature
  ---
  icon: i-lucide-rocket
  to: /examples/starters/workspace#_1-create-the-project
  ---
  #title
  Workspace

  #description
  For a website: one Nuxt app with sign-up, sign-in, account pages and user management. Start here if unsure.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-smartphone
  to: /examples/starters/mobile#_1-create-the-project
  ---
  #title
  Mobile

  #description
  For an iOS and Android app that signs in at an issuer you already have, such as frigear.nu.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-tablet-smartphone
  to: /examples/starters/mobile-standalone#_1-create-the-project
  ---
  #title
  Mobile standalone

  #description
  For an app with its own users and API. It is the workspace starter plus a mobile app that signs in at it.
  :::
::

::u-page-section
#title
Then add what you need

#description
Each module installs the modules it depends on, so you add only the ones you want.
[Adding modules](/get-started/adding-modules) shows how.

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
  Events with tickets, forms, cookie consent and Model Context Protocol (MCP) tools for AI agents.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-layout-dashboard
  to: /modules#interface
  ---
  #title
  Interface

  #description
  Shared components, the admin area, menus, widgets and the mobile shell.
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
Short walkthroughs you can copy into your app. The [Guide](/guide/concepts/architecture) explains the ideas behind them.

#features
  :::u-page-feature
  ---
  icon: i-lucide-shield-check
  to: /examples/tasks/protect-a-route
  ---
  #title
  Protect a route

  #description
  Require a signed-in user, limit a route by scope, or allow only cookie sessions.
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
Next steps

#features
  :::u-page-feature
  ---
  icon: i-lucide-book-a
  to: /guide/concepts/glossary
  ---
  #title
  Glossary

  #description
  Learn the one word these docs use for each idea, such as host app, issuer and staff.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-house
  to: /get-started/introduction
  ---
  #title
  Introduction

  #description
  Read what Frigear gives you before you install anything.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-blocks
  to: /modules
  ---
  #title
  Modules

  #description
  Find the module for the feature you want to add.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-git-pull-request
  to: /contribute/overview
  ---
  #title
  Contribute

  #description
  Change a module, a starter or these docs in the Frigear repository.
  :::
::
