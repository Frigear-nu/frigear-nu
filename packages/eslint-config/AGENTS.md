# AGENTS.md

## Description

This is a simple eslint config repository and is mainly used for packages / simple node apps or nuxt (unless specified
in the app itself - then never change it)

## Usage

See the [.example](./.example) folder for sample minimal config.

## Publishing

Published to npm as plain ESM source (`src/index.mjs` + `src/index.d.mts`), with no build step: Node does not strip
types from files inside `node_modules`, so do not ship `.ts` here. `@nuxt/eslint-config` is a dependency (not a dev
dependency) because consumers load it through this package. Check what ships with `npm pack --dry-run`.
