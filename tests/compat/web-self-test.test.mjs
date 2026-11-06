import { expect, test } from 'vitest'
import { auditStartupOutput } from '../../scripts/distribution/web-self-test.mjs'

const incompatible = name =>
  `Plugin ${name}@1.0.0 is incompatible with dsh 0.2.2-rc.1: requirements {"@deepseek-ai/dsh":"^0.1.0"}. ` +
  'Running it may cause crashes or data loss. Update the plugin or install a plugin version compatible with this dsh runtime. ' +
  `To accept this risk explicitly, grant the exact-version exemption for ${name}@1.0.0 on dsh 0.2.2-rc.1 with \`dsh plugin allow-version\` or the plugin manager, then retry the installation or restart dsh. Exact-version exemption: not active.`

// Real formats: app-boot profile.ts reportSkippedBundles (rc4 and rc1) and compatibility-preflight.ts (rc4 and rc1).
const missingBundle =
  'dsh: skipping profile bundle "@deepseek-ai/dsh-gone": Error: dsh: cannot resolve profile bundle "@deepseek-ai/dsh-gone" from the dsh installation or /p/web; run \'dsh plugin --profile web install\' if its dependency is not installed\n'
const incompatibleBundle = `dsh: skipping profile bundle "community-bundle": Error: ${incompatible('community-bundle')}\n`
const platformBundle =
  'dsh: skipping profile bundle "win-only": UnsupportedBundlePlatformError: Bundle supports Host platforms win32; the DSH Host is running darwin\n'
const brokenBundle = 'dsh: skipping profile bundle "broken": SyntaxError: Unexpected end of JSON input\n'
const rowDenied = `dsh: disabling profile plugin row "old-row": ${incompatible('old-plugin')}\n`
const moduleDenied = `dsh: disabling profile plugin file:///p/node_modules/denied/index.mjs: ${incompatible('denied')}\n`
const unvalidated = 'dsh: disabling profile plugin row "odd": its declared dsh requirements cannot be validated: peerDependencies must be an object\n'

test('a bundle the release no longer ships stays a harmless removal', () => {
  const audit = auditStartupOutput(missingBundle)
  expect(audit).toEqual({ skippedBundles: ['@deepseek-ai/dsh-gone'], unverified: [], problem: false })
})

test('an unresolved community bundle is reported as not running, not as a harmless removal', () => {
  const audit = auditStartupOutput(
    'dsh: skipping profile bundle "dsh-community-thing": Error: dsh: cannot resolve profile bundle "dsh-community-thing" from the dsh installation or /p/web\n',
  )
  expect(audit.problem).toBe(false)
  expect(audit.skippedBundles).toEqual([])
  expect(audit.unverified).toEqual([expect.objectContaining({ kind: 'bundle', name: 'dsh-community-thing', category: 'missing' })])
})

test('a bundle refused for version support is unverified with name, category and reason', () => {
  const audit = auditStartupOutput(incompatibleBundle)
  expect(audit.problem).toBe(false)
  expect(audit.skippedBundles).toEqual([])
  expect(audit.unverified).toEqual([
    expect.objectContaining({
      kind: 'bundle',
      name: 'community-bundle',
      category: 'compatibility',
      reason: expect.stringContaining('community-bundle@1.0.0 is incompatible with dsh 0.2.2-rc.1'),
    }),
  ])
})

test('platform and load failures of a bundle are unverified, not removals', () => {
  const audit = auditStartupOutput(platformBundle + brokenBundle)
  expect(audit.problem).toBe(false)
  expect(audit.unverified.map(({ name, category }) => [name, category])).toEqual([
    ['win-only', 'platform'],
    ['broken', 'load-failure'],
  ])
})

test('a plugin row disabled by the compatibility preflight is reported by id and by module', () => {
  const audit = auditStartupOutput(rowDenied + moduleDenied + unvalidated)
  expect(audit.problem).toBe(false)
  expect(audit.unverified.map(({ kind, name, category }) => [kind, name, category])).toEqual([
    ['plugin', 'old-row', 'compatibility'],
    ['plugin', 'file:///p/node_modules/denied/index.mjs', 'compatibility'],
    ['plugin', 'odd', 'unvalidated'],
  ])
})

test('an include that reaches an incompatible plugin is a compatibility denial', () => {
  const audit = auditStartupOutput(
    'dsh: disabling profile plugin row "inc": its included file /p/x.yml reaches an incompatible plugin, and that file is never rewritten\n',
  )
  expect(audit.unverified).toEqual([expect.objectContaining({ name: 'inc', category: 'compatibility' })])
})

test('Modern-owned disabled official entries print nothing and stay clean', () => {
  expect(auditStartupOutput('dsh web: http://127.0.0.1:1234/?token=x\nlisten ok\n')).toEqual({ skippedBundles: [], unverified: [], problem: false })
})

test('unrelated log lines are ignored and real errors still fail', () => {
  expect(auditStartupOutput('info: server ready\nwarn: slow disk\n').problem).toBe(false)
  expect(auditStartupOutput(`${incompatibleBundle}TypeError: boom\n`).problem).toBe(true)
  expect(auditStartupOutput('1 entry did not activate\n').problem).toBe(true)
})

test('mixed output keeps each class apart, dedupes, and survives CRLF', () => {
  const text = (missingBundle + incompatibleBundle + rowDenied + incompatibleBundle + platformBundle).replace(/\n/g, '\r\n')
  const audit = auditStartupOutput(text)
  expect(audit.problem).toBe(false)
  expect(audit.skippedBundles).toEqual(['@deepseek-ai/dsh-gone'])
  expect(audit.unverified.map(({ name, category }) => [name, category])).toEqual([
    ['community-bundle', 'compatibility'],
    ['win-only', 'platform'],
    ['old-row', 'compatibility'],
  ])
})
