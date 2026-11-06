import { describe, expect, test } from 'vitest'
import { ModelCatalogDirectory, refreshOnModelsUpdated } from '../../packages/modern-ui/src/vendor/model/client/catalog.ts'

type Listener = (provider: string) => void
type Deferred = { resolve: (names: string[]) => void }

const catalogOf = (names: string[]) => ({ ok: true, value: { groups: [{ id: 'p', models: names.map(id => ({ id, reasoning: undefined })) }] } })

/** A stand-in for `ctx.remote` whose `modelCatalog` answers are released by the test. */
function harness() {
  const listeners = new Set<Listener>()
  const pending: Deferred[] = []
  let calls = 0
  const ctx = {
    remote: {
      $on(event: string, listener: Listener) {
        expect(event).toBe('llm/models-updated')
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      session: {
        modelCatalog: () => {
          calls += 1
          return new Promise(resolve => {
            pending.push({ resolve: names => resolve(catalogOf(names)) })
          })
        },
      },
    },
  }
  const catalog = new ModelCatalogDirectory(ctx as never)
  const release = (index: number, listing: string[]) => {
    pending[index]?.resolve(listing)
  }
  return {
    catalog,
    ctx,
    release,
    listeners,
    calls: () => calls,
    emit: () => {
      for (const l of [...listeners]) l('p')
    },
  }
}
const names = (c: ModelCatalogDirectory) => c.store.getSnapshot().value?.groups[0]?.models.map(m => m.id)
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('model catalog follows llm/models-updated', () => {
  test('the event alone makes the next read return the new listing', async () => {
    const h = harness()
    refreshOnModelsUpdated(h.ctx as never, h.catalog)
    const first = h.catalog.load()
    h.release(0, ['a'])
    await first
    expect(names(h.catalog)).toEqual(['a'])
    expect(await h.catalog.load()).toBeDefined()
    expect(h.calls()).toBe(1)
    h.emit()
    expect(h.calls()).toBe(2)
    h.release(1, ['a', 'b'])
    await tick()
    expect(names(h.catalog)).toEqual(['a', 'b'])
    expect(h.calls()).toBe(2)
  })

  test('after the subscription is disposed an event starts no request', async () => {
    const h = harness()
    const dispose = refreshOnModelsUpdated(h.ctx as never, h.catalog)
    dispose()
    h.emit()
    await tick()
    expect(h.calls()).toBe(0)
    expect(h.listeners.size).toBe(0)
  })

  test('an update racing a running load keeps the newer result', async () => {
    const h = harness()
    refreshOnModelsUpdated(h.ctx as never, h.catalog)
    const stale = h.catalog.load()
    h.emit()
    expect(h.calls()).toBe(2)
    h.release(1, ['new'])
    await tick()
    h.release(0, ['old'])
    await stale
    await tick()
    expect(names(h.catalog)).toEqual(['new'])
    expect(h.catalog.store.getSnapshot().status).toBe('ready')
  })
})
