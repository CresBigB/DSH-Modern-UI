import { test } from 'vitest'
import assert from 'node:assert/strict'
import { runOfficialControlsChecks } from './official-controls.mjs'

assert.ok(process.env.COMPAT_BACKEND_PACKAGE, 'Set COMPAT_BACKEND_PACKAGE to the installed official DSH package.json')
let report
const check = () => (report ??= runOfficialControlsChecks(process.env.COMPAT_BACKEND_PACKAGE))

test('all 49 official control classes exist in published CSS and runtime mappings', async () => {
  assert.equal((await check()).classes.length, 49)
})

test('published switch and menu retain the structures used by exact selectors', async () => {
  const { structures } = await check()
  assert.ok(structures.switches > 0 && structures.accountMenus > 0)
})
