import { describe, expect, it, vi } from 'vitest'

// Published Cordis declares FiberState as a const enum with no JS export; the host build inlines it
// through TypeScript emission, this test supplies the declared values (equal in Cordis 4.0 and 4.1).
const FiberState = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 } as const
type FiberState = (typeof FiberState)[keyof typeof FiberState]
vi.mock('@deepseek-ai/cordis', async importOriginal => ({
  ...(await importOriginal<object>()),
  FiberState: { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 },
}))

import { availablePaidProviders, translateWithDeepSeek } from '../../packages/modern-ui/src/host-compat/translator/deepseek.ts'
import type { Config } from '../../packages/modern-ui/src/host-compat/translator/index.ts'
import type { TranslationLog } from '../../packages/modern-ui/src/host-compat/translator/storage.ts'

// Native owner discovery reads the account route's validated config from the loader entry. Cordis
// 4.0 validates into `fiber.config`; Cordis 4.1 (DSH 0.2.2) keeps the raw input there and the
// validated value in `fiber.effectiveConfig`. Lifecycle events carry the plugin context's own
// fiber, which is not the handle the loader returned.

const config = { deepseekTimeoutMs: 5_000, deepseekMaxOutputTokens: 64, maxResponseBytes: 1024 } as Config
const validated = (overrides: unknown) => ({ modelOverrides: { get: () => overrides } })

interface FakeOwnerFiber {
  state: FiberState
  config: unknown
  effectiveConfig?: unknown
  ctx: { fiber: { state: FiberState } }
}

function host(fiber: FakeOwnerFiber, prepareCall?: () => Promise<never>) {
  const listeners: ((fiber: unknown) => void)[] = []
  const llm = {
    listProviders: () => [{ id: 'deepseek-account' }],
    listConfigurableProviders: () => [{ provider: 'deepseek-account', settingsPath: [], settingsNs: 'llm-account' }],
    listModels: async () => [{ id: 'deepseek-flash' }],
    prepareCall: prepareCall ?? (() => new Promise<never>(() => {})),
  }
  const loader = {
    entries: () => [{ options: { id: 'llm-account', name: '@deepseek-ai/dsh-llm-deepseek-account' }, fiber }],
  }
  const ctx = {
    get: (name: string) => (name === 'llm' ? llm : name === 'loader' ? loader : undefined),
    on: (_event: string, listener: (fiber: unknown) => void) => {
      listeners.push(listener)
      return () => {
        listeners.splice(listeners.indexOf(listener), 1)
      }
    },
  }
  return { ctx: ctx as never, emitStatus: (target: unknown) => [...listeners].forEach(listener => listener(target)), listeners }
}

const discover = (ctx: never) => availablePaidProviders(ctx, config, new AbortController().signal, () => {})

describe('native translation owner config', () => {
  it('reads the validated config of a Cordis 4.0 fiber', async () => {
    const inner = { state: FiberState.ACTIVE }
    const { ctx } = host({ state: FiberState.ACTIVE, config: validated({}), ctx: { fiber: inner } })
    expect(await discover(ctx)).toEqual(['bing', 'google', 'deepseek-account'])
  })

  it('reads effectiveConfig of a Cordis 4.1 fiber, where config is the raw input', async () => {
    const inner = { state: FiberState.ACTIVE }
    const { ctx } = host({
      state: FiberState.ACTIVE,
      config: { modelOverrides: {} },
      effectiveConfig: validated({}),
      ctx: { fiber: inner },
    })
    expect(await discover(ctx)).toEqual(['bing', 'google', 'deepseek-account'])
  })

  it('does not fall back to the raw config while a Cordis 4.1 fiber has none in effect', async () => {
    const inner = { state: FiberState.ACTIVE }
    const { ctx } = host({
      state: FiberState.ACTIVE,
      config: validated({}),
      effectiveConfig: undefined,
      ctx: { fiber: inner },
    })
    expect(await discover(ctx)).toEqual(['bing', 'google'])
  })
})

describe('native translation withdrawal', () => {
  const spec = {
    provider: 'deepseek-account',
    sessionId: 'session-1',
    text: 'hello',
    sourceLanguage: 'auto',
    targetLanguage: 'zh',
  } as never
  const identity = { provider: 'deepseek-account', text: 'hello', sourceLanguage: 'auto', targetLanguage: 'zh', recipe: 'r' }
  const log = { request: async () => 1, result: async () => {} } as unknown as TranslationLog

  it('aborts an in-flight request when the owner plugin context stops', async () => {
    const inner = { state: FiberState.ACTIVE }
    const handle: FakeOwnerFiber = { state: FiberState.ACTIVE, config: validated({}), ctx: { fiber: inner } }
    const { ctx, emitStatus, listeners } = host(handle)
    const pending = translateWithDeepSeek(ctx, spec, config, new AbortController().signal, () => {}, log, identity)
    for (let turn = 0; turn < 20 && listeners.length === 0; turn++) await Promise.resolve()
    expect(listeners).toHaveLength(1)
    // An event naming the loader handle is not the owner's lifecycle event.
    emitStatus({ ...handle, state: FiberState.DISPOSED })
    inner.state = FiberState.DISPOSED
    emitStatus(inner)
    await expect(pending).rejects.toMatchObject({ code: 'TRANSLATION_UNAVAILABLE', message: 'Native Flash translation provider was withdrawn' })
    expect(listeners).toHaveLength(0)
  })
})
