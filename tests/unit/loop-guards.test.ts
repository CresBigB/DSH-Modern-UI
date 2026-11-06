import { describe, expect, test } from 'vitest'
import { formatCacheHitPercent } from '../../packages/modern-ui/src/vendor/chat/client/chat/token-format.ts'
import { reasoningFragments } from '../../packages/modern-ui/src/vendor/translation/client/translation.ts'

describe('cache-hit percentage', () => {
  test('more cached than prompt tokens, as some gateways report, reads as a full hit instead of looping', () => {
    expect(formatCacheHitPercent(150, 100)).toBe('100')
    expect(formatCacheHitPercent(1001, 1000, 1)).toBe('100')
    expect(formatCacheHitPercent(100, 100)).toBe('100')
  })

  test('a partial hit that would round to 100 still shows its missing part', () => {
    expect(formatCacheHitPercent(999, 1000)).toBe('99.9')
    expect(formatCacheHitPercent(50, 100)).toBe('50')
    expect(formatCacheHitPercent(0, 0)).toBeNull()
  })
})

describe('reasoning fragments', () => {
  test('a one-character limit splits a surrogate pair rather than looping on an empty fragment', () => {
    const fragments = reasoningFragments('😀😀', false, 1)
    expect(fragments.every(fragment => fragment.text.length > 0)).toBe(true)
    expect(fragments.map(fragment => fragment.text + fragment.suffix).join('')).toBe('😀😀')
  })

  test('a wider limit keeps a surrogate pair together', () => {
    const fragments = reasoningFragments('a😀b', false, 2)
    expect(fragments.map(fragment => fragment.text)).toEqual(['a', '😀', 'b'])
  })
})
