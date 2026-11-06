import { describe, expect, test } from 'vitest'
import type { Root, RootContent } from 'mdast'
import { parseFileLink } from '../../packages/modern-ui/src/vendor/primitives/markdown/file-link.ts'
import { parseGfm, parseGfmWithMath, parseStreamingGfm } from '../../packages/modern-ui/src/vendor/primitives/markdown/parse.ts'

function urls(root: Root | RootContent): string[] {
  const found = 'url' in root && typeof root.url === 'string' ? [root.url] : []
  return 'children' in root ? [...found, ...root.children.flatMap(urls)] : found
}

const destination = (source: string, parse = parseGfm): string | undefined => urls(parse(source))[0]

describe('file link locations', () => {
  test.each([
    ['src/a.ts', { path: 'src/a.ts' }],
    ['src/a.ts:24', { path: 'src/a.ts', line: 24 }],
    ['src/a.ts:24:3', { path: 'src/a.ts', line: 24 }],
    ['src/a.ts:3-5', { path: 'src/a.ts', line: 3 }],
    ['src/a.ts#L7', { path: 'src/a.ts', line: 7 }],
    ['src/a.ts#L7-L9', { path: 'src/a.ts', line: 7 }],
    ['./a.ts:2', { path: './a.ts', line: 2 }],
    ['/abs/a.ts:2:1', { path: '/abs/a.ts', line: 2 }],
    ['D:\\repo\\a.ts', { path: 'D:\\repo\\a.ts' }],
    ['D:\\repo\\a.ts:12:4', { path: 'D:\\repo\\a.ts', line: 12 }],
    ['D:/repo/a.ts#L3', { path: 'D:/repo/a.ts', line: 3 }],
    ['my%20docs/a%20b.ts:8', { path: 'my docs/a b.ts', line: 8 }],
  ])('%s', (value, expected) => {
    expect(parseFileLink(value)).toEqual(expected)
  })

  // Official 0.2.2-rc.1 accepts these; Modern keeps rc.4's refusal so a click cannot reach a network share.
  test.each(['\\\\server\\share\\a.ts', '\\\\server\\share\\a.ts:5', '//server/file:24', '%5C%5Cserver%5Cfile:24'])(
    'refuses a UNC or protocol-relative path: %s',
    value => {
      expect(parseFileLink(value)).toBeUndefined()
    },
  )

  test.each(['src/a.ts#L0', 'src/a.ts#Lx', 'src/a.ts#L5-L3', 'src/a.ts#top', 'src/a.ts:0', 'src/a.ts:5-3'])(
    'an invalid location still opens the file without a line: %s',
    value => {
      const link = parseFileLink(value)
      expect(link?.path).toBe('src/a.ts')
      expect(link?.line).toBeUndefined()
    },
  )

  test.each(['https://example.com/a', 'mailto:a@b.c', '#section', '', 'src/a.ts?x=1', 'src/%E0%A4%A.ts', 'a\u0000b'])('not a file link: %j', value => {
    expect(parseFileLink(value)).toBeUndefined()
  })

  test('a bare location with no path is rejected', () => {
    expect(parseFileLink(':24')).toBeUndefined()
  })
})

describe('Windows path destinations', () => {
  test('backslashes before punctuation stay literal', () => {
    expect(destination('[config](D:\\repo\\.github\\config.yml)')).toBe('D:\\repo\\.github\\config.yml')
    expect(destination('[x](D:\\repo\\_private\\a.md)')).toBe('D:\\repo\\_private\\a.md')
    expect(destination('[x](<C:\\a\\(b)\\c.txt>)')).toBe('C:\\a\\(b)\\c.txt')
  })

  test('UNC paths and angle-bracketed paths with spaces', () => {
    expect(destination('[x](\\\\server\\share\\.cfg)')).toBe('\\\\server\\share\\.cfg')
    expect(destination('[x](<D:\\my repo\\.github\\a b.yml>)')).toBe('D:\\my repo\\.github\\a b.yml')
  })

  test('character references still decode', () => {
    expect(destination('[x](D:\\repo\\a&amp;b.txt)')).toBe('D:\\repo\\a&b.txt')
  })

  test('reference definitions and images follow the same rule', () => {
    expect(urls(parseGfm('[a][1]\n\n[1]: D:\\repo\\.github\\a.yml'))).toContain('D:\\repo\\.github\\a.yml')
    expect(destination('![img](D:\\repo\\.assets\\a.png)')).toBe('D:\\repo\\.assets\\a.png')
  })

  test('the math arm agrees with the streaming-grammar arm', () => {
    const source = '[config](D:\\repo\\.github\\config.yml) and $x^2$'
    expect(destination(source, parseGfmWithMath)).toBe('D:\\repo\\.github\\config.yml')
  })

  test('ordinary destinations are unchanged', () => {
    expect(destination('[x](https://example.com/a_b?q=1&r=2#frag)')).toBe('https://example.com/a_b?q=1&r=2#frag')
    expect(destination('[x](src/a.ts:24:3)')).toBe('src/a.ts:24:3')
    expect(destination('[x](foo/\\*bar)')).toBe('foo/*bar')
    expect(destination('[x](https://example.com/\\.x)')).toBe('https://example.com/.x')
  })

  test('streaming parsing of a complete message matches the full parse', () => {
    const source = 'See [config](D:\\repo\\.github\\config.yml) and [a](src/a.ts:24:3).'
    expect(urls(parseStreamingGfm(source))).toEqual(urls(parseGfm(source)))
    expect(urls(parseStreamingGfm(source))).toEqual(['D:\\repo\\.github\\config.yml', 'src/a.ts:24:3'])
  })

  test('a Windows link cut off mid-destination is hidden, then settles on arrival', () => {
    const source = 'See [config](D:\\repo\\.github\\config.yml) now'
    const cut = source.indexOf('config.yml')
    expect(urls(parseStreamingGfm(source.slice(0, cut)))).toEqual([''])
    expect(urls(parseStreamingGfm(source))).toEqual(['D:\\repo\\.github\\config.yml'])
  })
})
