import { expect, test } from 'vitest'
import { makeFormat } from '../../packages/modern-ui/src/vendor/openui/components/chart-math.ts'
import { numberText } from '../../packages/modern-ui/src/vendor/openui/components/table.tsx'
import { languageTag } from '../../packages/modern-ui/src/vendor/openui/functions/dates.ts'

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

test('axis ticks abbreviate with K, M and B in every interface language, as they did before values were localized', () => {
  const axes: Array<[string, string | undefined, number[], number]> = [
    ['currency', 'USD', [0, 5e8, 1e9, 1.5e9, 2e9], 5e8],
    ['number', undefined, [0, 5e3, 1e4, 1.5e4, 2e4], 5e3],
    ['number', undefined, [1e6, 1e6 + 0.2], 0.2],
    ['percent', undefined, [0, 25, 50], 25],
  ]
  for (const [kind, currency, ticks, step] of axes) {
    const english = ticks.map(value => makeFormat(kind, currency, 'en-US')(value, true, step))
    for (const locale of ['zh', 'ja', 'en', 'de']) expect(ticks.map(value => makeFormat(kind, currency, locale)(value, true, step))).toEqual(english)
  }
  expect(makeFormat('currency', 'USD', 'zh')(1.5e9, true, 5e8)).toBe('$1.5B')
  // A tooltip abbreviates only where that loses nothing; a value written out in full follows the interface language.
  expect(makeFormat('currency', 'USD', 'zh')(1.24e9)).toBe('$1.24B')
  expect(makeFormat('currency', 'USD', 'zh')(1245300000)).toBe(
    (1245300000).toLocaleString('zh', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  )
})

test('a date language tag Intl would reject reads as the nearest valid tag or the default instead of throwing', () => {
  expect(languageTag('zh_CN')).toBe('zh-CN')
  expect(languageTag(' de ')).toBe('de')
  for (const invalid of ['', '中文', 'not a tag', undefined, 5]) expect(languageTag(invalid)).toBe('en-US')
  for (const locale of ['zh_CN', '', '中文']) expect(() => new Date(0).toLocaleString(languageTag(locale))).not.toThrow()
})

test('tiny table numbers keep the notation an English reader had, whichever English tag the Host reports', () => {
  expect(numberText(0.0000123, 'en')).toBe('1.23e-5')
  expect(numberText(0.0000123, 'en-US')).toBe('1.23e-5')
})
