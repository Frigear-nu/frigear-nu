# AGENTS.md - `packages/eslint-config`

`@workspace/eslint-config`: the shared ESLint config (`@nuxt/eslint-config`, stylistic + TypeScript) for packages and
plain Node apps in this workspace. Nuxt apps such as `apps/web` use the `@nuxt/eslint` module instead; never change an
app's own lint config to use this one.

## Usage in a package

```json
{
  "devDependencies": {
    "@workspace/eslint-config": "workspace:*",
    "eslint": "^10.12.0"
  },
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

```js
// eslint.config.mjs
export { default } from '@workspace/eslint-config'
```

The package ships TypeScript source (`exports: { ".": "./src/index.ts" }`) with no build step. Add rules in
`src/index.ts`; they apply to every consumer, so run `pnpm lint` from the root after changing them.
