import { initCmd } from '@frigear-nu/cli'
import { describe, expect, it } from 'vitest'
import { createCmd } from '../src/main.ts'

describe('create-frigear-app', () => {
  it('is the init command of @frigear-nu/cli under its own name', () => {
    expect(createCmd.meta).toMatchObject({ name: 'create-frigear-app' })
    expect(createCmd.args).toBe(initCmd.args)
    expect(createCmd.run).toBe(initCmd.run)
  })
})
