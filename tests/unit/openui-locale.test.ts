import { expect, test } from 'vitest'
import { makeFormat } from '../../packages/modern-ui/src/vendor/openui/components/chart-math.ts'

test('localized chart values preserve tiny nonzero numbers, negative currency and percent units', () => {
  for (const locale of ['zh', 'ja', 'en', 'de']) {
    const number = makeFormat('number', undefined, locale)
    expect(number(1234.5)).toBe((1234.5).toLocaleString(locale, { maximumFractionDigits: 2 }))
    for (const value of [5e-7, 2e-26, -2e-26]) expect(number(value)).not.toMatch(/^-?0$/)
    expect(makeFormat('currency', 'EUR', locale)(-1234.5)).toBe(
      (-1234.5).toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    )
    expect(makeFormat('percent', undefined, locale)(45)).toBe((0.45).toLocaleString(locale, { style: 'percent', maximumFractionDigits: 2, useGrouping: false }))
    expect(makeFormat('percent', undefined, locale)(Number.MIN_VALUE)).not.toMatch(/^0\s?%$/)
    expect(new Set([1e6, 1e6 + 0.2, 1e6 + 0.4].map(n => number(n, true, 0.2))).size).toBe(3)
  }
})
