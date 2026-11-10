import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { checkClientBudget, logicalBuildInput, modernKatexFonts } from '../../scripts/build-metrics.mjs'

describe('client artifact budget', () => {
  test('fails independently on raw and compressed growth', () => {
    const bytes = Buffer.from('test content'.repeat(100))
    expect(() => checkClientBudget(bytes, { bytes: 1, gzipBytes: 9999 })).toThrow('bytes budget exceeded')
    expect(() => checkClientBudget(bytes, { bytes: 9999, gzipBytes: 1 })).toThrow('gzipBytes budget exceeded')
    expect(checkClientBudget(bytes, { bytes: 9999, gzipBytes: 9999 }).bytes).toBe(bytes.length)
  })
  test('retains nested versions in the input identity', () => {
    expect(logicalBuildInput(process.cwd(), 'node_modules/parent/node_modules/katex/dist/katex.js')).toBe(
      'node_modules/parent/node_modules/katex/dist/katex.js',
    )
  })
  test('retains every published KaTeX face with only the supported WOFF2 source', () => {
    const css = readFileSync('node_modules/katex/dist/katex.min.css', 'utf8')
    const compact = modernKatexFonts(css)
    expect(compact.match(/@font-face/g)?.length).toBe(css.match(/@font-face/g)?.length)
    expect(compact.match(/\.woff2/g)?.length).toBe(css.match(/\.woff2/g)?.length)
    expect(compact).not.toMatch(/\.(?:woff|ttf)\)/)
    expect(() => modernKatexFonts('@font-face{src:url(a.ttf) format("truetype")}')).toThrow('no WOFF2 source')
  })
})
