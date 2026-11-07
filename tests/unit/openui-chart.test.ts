import { describe, expect, test } from 'vitest'
import {
  bar,
  curve,
  makeFormat,
  niceDomain,
  stackAreas,
  stepDigits,
  valueDomain,
  type Domain,
} from '../../packages/modern-ui/src/vendor/openui/components/chart-math.ts'

describe('chart number formats', () => {
  test('small non-zero values never read as 0, on ticks or in tooltips', () => {
    const number = makeFormat('number', undefined)
    expect([0, 0.0005, 0.001, 0.0015].map(tick => number(tick, true, 0.0005))).toEqual(['0', '0.0005', '0.001', '0.0015'])
    expect(number(0.001)).toBe('0.001')
    expect(number(0.0012345)).toBe('0.00123')
    expect(makeFormat('percent', undefined)(0.05)).toBe('0.05%')
    expect(makeFormat('currency', 'usd')(0.001)).toBe('$0.001')
  })

  test('larger values keep their existing shapes', () => {
    const number = makeFormat('number', undefined)
    expect(number(1234.567)).toBe('1,234.57')
    expect(number(2500, true, 2500)).toBe('2.5K')
    expect(number(2.5, true, 2.5)).toBe('2.5')
    expect(makeFormat('currency', 'EUR')(1_240_000_000)).toBe('€1.24B')
    expect(number(0)).toBe('0')
  })

  test('precision never leaves the range Intl accepts, even for coincident ticks or values below 1e-20', () => {
    expect([0, Number.NaN, -1, Number.POSITIVE_INFINITY].map(stepDigits)).toEqual([0, 0, 0, 0])
    expect(stepDigits(1e-25)).toBe(25)
    const number = makeFormat('number', undefined)
    expect(() => number(1e-25, true, 1e-25)).not.toThrow()
    expect(() => number(0.5, false, 1e-25)).not.toThrow()
  })

  test('tooltips keep the axis precision, and three significant digits below 1', () => {
    const number = makeFormat('number', undefined)
    expect(number(1.0005, false, 0.0005)).toBe('1.0005')
    expect(number(0.000123456, false, 0.00002)).toBe('0.000123')
    expect(number(1234.567, false, 0)).toBe('1,234.57')
  })

  test('tick precision follows the step', () => {
    expect([1000, 5, 2.5, 0.25, 0.0005].map(stepDigits)).toEqual([0, 0, 1, 2, 4])
  })

  // Ticks a step apart, and the values in tooltips, must read differently, however large or small they are.
  const ticks = (lo: number, step: number, count: number, kind = 'number') =>
    Array.from({ length: count }, (_, k) => makeFormat(kind, undefined)(lo + k * step, true, step))

  test('large ticks keep the precision of their step, written out where a compact unit cannot show it', () => {
    expect(ticks(1_000_000, 0.2, 6)).toEqual(['1,000,000', '1,000,000.2', '1,000,000.4', '1,000,000.6', '1,000,000.8', '1,000,001'])
    expect(ticks(1000, 0.5, 5)).toEqual(['1,000', '1,000.5', '1,001', '1,001.5', '1,002'])
    expect(ticks(2020, 1, 6)).toEqual(['2,020', '2,021', '2,022', '2,023', '2,024', '2,025'])
    expect(ticks(0, 250_000_000, 6)).toEqual(['0', '250M', '500M', '750M', '1B', '1.25B'])
    expect(ticks(0, 1000, 3, 'currency')).toEqual(['$0', '$1K', '$2K'])
  })

  test('ticks below 20 decimals switch to scientific notation instead of all reading 0', () => {
    expect(ticks(0, 2e-26, 6)).toEqual(['0', '2E-26', '4E-26', '6E-26', '8E-26', '1E-25'])
    expect(ticks(0, 2.5e-26, 3)).toEqual(['0', '2.5E-26', '5E-26'])
  })

  test('tooltips show the actual value, compact only when that loses nothing', () => {
    const number = makeFormat('number', undefined)
    expect([1_000_000, 1_000_001].map(value => number(value, false, 0.2))).toEqual(['1,000,000', '1,000,001'])
    expect(number(1_000_000.4, false, 0.2)).toBe('1,000,000.4')
    expect(number(1_234_567_890, false, 250_000_000)).toBe('1,234,567,890')
    expect(number(1_250_000_000, false, 250_000_000)).toBe('1.25B')
    expect(number(0.5004, false, 0.0001)).toBe('0.5004')
    expect(number(1e-25, false, 2e-26)).toBe('1E-25')
    expect(number(1e-25)).toBe('1E-25')
    expect(makeFormat('currency', 'USD')(1_000_001)).toBe('$1,000,001')
  })
})

describe('stacked areas', () => {
  test('a series that changes sign splits where it crosses zero instead of twisting across the layer below', () => {
    const [a, b] = stackAreas([
      [10, 10],
      [10, -10],
    ])
    expect(a.bands).toEqual([
      [
        [0, 10],
        [0.5, 10],
        [1, 10],
        [1, 0],
        [0.5, 0],
        [0, 0],
      ],
    ])
    // b sits on a while positive, then hangs below zero once negative.
    expect(b.bands).toEqual([
      [
        [0, 20],
        [0.5, 10],
        [1, 10],
        [1, 10],
        [0.5, 10],
        [0, 10],
      ],
      [
        [0, 0],
        [0.5, 0],
        [1, -10],
        [1, 0],
        [0.5, 0],
        [0, 0],
      ],
    ])
    expect(b.edge).toEqual([
      [
        [0, 20],
        [0.5, 10],
      ],
      [
        [0.5, 0],
        [1, -10],
      ],
    ])
  })

  test('layers that never change sign keep one band and one unbroken edge each', () => {
    const layers = stackAreas([
      [0, 0],
      [10, 0],
      [20, 20],
    ])
    expect(layers.map(layer => layer.bands.length)).toEqual([1, 1])
    expect(layers.map(layer => layer.edge.length)).toEqual([1, 1])
    expect(layers[1].bands[0]).toEqual([
      [0, 0],
      [1, 10],
      [2, 40],
      [2, 20],
      [1, 10],
      [0, 0],
    ])
  })

  test('a single series crossing zero keeps one edge through the crossing', () => {
    const [only] = stackAreas([[5], [-5], [5]])
    expect(only.edge).toEqual([
      [
        [0, 5],
        [0.5, 0],
        [1, -5],
        [1.5, 0],
        [2, 5],
      ],
    ])
    expect(only.bands).toHaveLength(2)
  })
})

describe('chart geometry', () => {
  const ys = (path: string) => [...path.matchAll(/[\d.]+,([\d.]+)/g)].map(match => Number(match[1]))

  test('a line through three or more points is a smooth curve that does not overshoot', () => {
    const path = curve([
      [0, 0],
      [10, 10],
      [20, 10],
      [30, 30],
    ])
    expect(path.startsWith('M0.0,0.0C')).toBe(true)
    expect(path.endsWith('30.0,30.0')).toBe(true)
    expect(path.match(/C/g)).toHaveLength(3)
    // The flat middle stretch stays flat: its control points sit at y = 10.
    expect(ys(path.split('C')[2])).toEqual([10, 10, 10])
    expect(Math.min(...ys(path))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys(path))).toBeLessThanOrEqual(30)
  })

  test('two points stay a straight segment', () => {
    expect(
      curve([
        [0, 5],
        [10, 15],
      ]),
    ).toBe('M0.0,5.0L10.0,15.0')
  })

  test('bars round only the corners away from the baseline, never more than they can hold', () => {
    expect(bar(0, 10, 40, 90, true)).toBe('M0,100V18A8,8 0 0 1 8,10H32A8,8 0 0 1 40,18V100Z')
    expect(bar(0, 0, 40, 90, false)).toBe('M0,0V82A8,8 0 0 0 8,90H32A8,8 0 0 0 40,82V0Z')
    expect(bar(0, 97, 40, 3, true)).toContain('A3,3')
    expect(bar(0, 100, 40, 0, true)).toBe('M0,100H40V100H0Z')
  })
})

describe('chart value axis', () => {
  test('a first drawing keeps the plain rounded axis', () => {
    expect(valueDomain(0, 99, null)).toEqual({ lo: 0, hi: 100, step: 20 })
    expect(valueDomain(0, 101, null)).toEqual({ lo: 0, hi: 125, step: 25 })
    expect(valueDomain(-30, 80, null)).toEqual(niceDomain(-30, 80))
  })

  test('a slider sweep rescales once instead of at every rounded step', () => {
    let held: Domain | null = null
    const axes: string[] = []
    for (const value of [95, 98, 99, 100, 101, 102, 110, 120, 125, 126, 130, 140, 120, 101, 99, 100, 98]) {
      held = valueDomain(0, value, held)
      axes.push(`${held.lo}-${held.hi}`)
    }
    // The old axis jumped 100 -> 125 -> 150 and back down to 100 on the way back.
    expect([...new Set(axes)]).toEqual(['0-100', '0-150'])
  })

  test('an axis tightens once the data shrinks far inside it', () => {
    const held = { lo: 0, hi: 150, step: 50 }
    expect(valueDomain(0, 70, held)).toBe(held)
    expect(valueDomain(0, 20, held)).toEqual(niceDomain(0, 20))
  })

  test('outgrowing one side widens that side with headroom and keeps the other', () => {
    const held = { lo: -50, hi: 100, step: 25 }
    expect(valueDomain(-60, 90, held)).toEqual(niceDomain(-75, 100))
    expect(valueDomain(-10, 101, held)).toEqual(niceDomain(-50, 126.25))
  })

  test('fixed min and max give a constant axis that still shows values outside them', () => {
    const range = { min: 0, max: 200 }
    const axes = [0, 37, 99, 101, 180, 200].map(value => valueDomain(0, value, null, range))
    expect(new Set(axes.map(axis => `${axis.lo}-${axis.hi}-${axis.step}`))).toEqual(new Set(['0-200-50']))
    expect(valueDomain(0, 250, { lo: 0, hi: 200, step: 50 }, range)).toEqual(niceDomain(0, 250))
    expect(valueDomain(-5, 50, null, { max: 100 })).toEqual(niceDomain(-5, 100))
  })
})
