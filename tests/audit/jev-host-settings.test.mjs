// The Jev settings the built Host entry hands the tool. The Loader's schema fills every default, but `apply` also
// takes a plain section, where a field left `undefined` must keep its default rather than override it.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '../..')
const host = await import(pathToFileURL(path.join(root, 'packages/modern-ui/lib/index.js')).href)

test('a plain Jev section with an undefined timeout keeps the default timeout', async () => {
  const requests = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(JSON.stringify({ answers: { presentation: { type: 'choice', choice: 'table', confidence: 0.8 } } }))
  }
  try {
    const listeners = new Map()
    const registered = []
    const session = { id: 'main', header: {} }
    const agent = {
      id: 'main',
      session,
      ctx: {
        inject: (_deps, callback) => {
          callback({ tools: { register: definition => registered.push(definition) } })
          return { dispose: async () => {}, then: resolve => resolve(undefined) }
        },
      },
    }
    const scope = {
      credentials: { resolve: async () => ({ value: 'test-key', source: 'file' }) },
      agents: { list: () => [agent], roots: () => [agent] },
      logger: { warn: () => {} },
      on: (event, listener) => {
        listeners.set(event, listener)
      },
      effect: () => {},
    }
    // Only the Jev tool's services are provided; the prompt sections are covered by presentation-switch.test.mjs.
    const ctx = {
      inject: (deps, callback) => {
        if (deps.includes('credentials')) callback(scope)
      },
      on: () => () => {},
    }
    host.apply(ctx, { enabled: true, presentation: { prompt: true }, jev: { endpoint: 'http://127.0.0.1:9/v1/systemone', timeout: undefined } })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(registered.length, 1)
    const observe = listeners.get('session/event')
    observe(session, { type: 'turn/start', data: { turn: 1 } })
    observe(session, { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'compare redis and memcached' }] } })
    const advice = await registered[0].execute(
      { content_summary: 'Two caches compared on three shared dimensions.' },
      { agent, signal: new AbortController().signal },
    )
    assert.equal(advice.status, 'suggestion')
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'http://127.0.0.1:9/v1/systemone')
  } finally {
    globalThis.fetch = realFetch
  }
})
