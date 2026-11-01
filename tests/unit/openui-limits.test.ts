import { describe, expect, test } from 'vitest'
import { NESTING_LIMIT, nestingDepth } from '../../packages/modern-ui/src/vendor/intelligent/client/openui-source.ts'
import { Join, Replace } from '../../packages/modern-ui/src/vendor/openui/functions/text.ts'

describe('text the functions build', () => {
  test('@Replace and @Join work as before on ordinary text', () => {
    expect(Replace.fn({ text: 'a-b--c', find: '-', replacement: '+' })).toBe('a+b++c')
    expect(Replace.fn({ text: 'abc', find: '', replacement: 'x' })).toBe('abc')
    expect(Replace.fn({ text: 'aaa', find: 'aa', replacement: 'b' })).toBe('ba')
    expect(Join.fn({ list: [1, null, 'two', { three: 3 }], sep: ' | ' })).toBe('1 | two | {"three":3}')
    expect(Join.fn({ list: [{ name: 'a' }, { name: 'b' }, {}], field: 'name' })).toBe('a, b')
  })

  test('a result longer than any block could show is refused before it is built', () => {
    // 12,000 replacements of one character by 1,000 make 12 million characters.
    expect(() => Replace.fn({ text: 'x'.repeat(12_000), find: 'x', replacement: 'y'.repeat(1000) })).toThrow(RangeError)
    // 999 separators of 20,000 characters.
    expect(() => Join.fn({ list: Array(1000).fill(1), sep: 'y'.repeat(20_000) })).toThrow(RangeError)
    expect(Replace.fn({ text: 'x'.repeat(1000), find: 'x', replacement: 'y'.repeat(1000) })).toHaveLength(1_000_000)
  })
})

describe('openui-lang nesting', () => {
  test('counts brackets outside strings, as the lexer reads them', () => {
    expect(nestingDepth('root = Col([Text("x")])')).toBe(3)
    expect(nestingDepth('root = Col([Code("[[[[(((({{{{")])')).toBe(3)
    expect(nestingDepth(`root = Col([Text('it\\'s [[[[ "(" ')])`)).toBe(3)
    expect(nestingDepth('root = Text("a \\" [[[[ ")')).toBe(1)
    expect(nestingDepth('a = [[1], [2]]\nb = {k: [{v: (1 + 2)}]}')).toBe(4)
  })

  test('a deep program passes the limit without parsing it', () => {
    expect(nestingDepth(`root = Col([Text("" + @Count(${'['.repeat(4000)}1${']'.repeat(4000)}))])`)).toBeGreaterThan(NESTING_LIMIT)
    expect(NESTING_LIMIT).toBeGreaterThanOrEqual(64)
  })
})
