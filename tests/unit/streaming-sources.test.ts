import { describe, expect, test } from 'vitest'
import { parseGfm, parseStreamingGfm } from '../../packages/modern-ui/src/vendor/primitives/markdown/parse.ts'
import { IncrementalMarkdownParser } from '../../packages/modern-ui/src/vendor/primitives/markdown/incremental.ts'

const withoutPositions = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, item) => (key === 'position' ? undefined : item)))

describe('streaming Markdown presentation grammar', () => {
  test.each([
    '[1]: https://e',
    '[1]: https://example.com\n',
    '[1]: https://example.com "title',
    '[1]: https://example.com\n  "title',
    '[1]: https://example.com\n  "title\ncontinued',
    '[1]: https://example.com "escaped \\" quote',
    '[1]: <https://example.com>',
    '[1]: https://example.com/nonbreaking\u00a0space',
    '[1\n]: https://e',
  ])('holds an ambiguous definition: %s', source => {
    expect(parseStreamingGfm(source).children).toEqual([])
  })

  test.each([
    '[1]: https://example.com "title"',
    '[1]: https://example.com\n  "title\ncontinued"',
    '[1]: https://example.com "escaped \\" quote"',
    '[1]: https://example.com\n\n',
    '[1]: https://example.com\nNext paragraph',
    '[1]: https://example.com\n[2]: https://other.test "Other"',
    '[1]: https://example.com "title" illegal',
    '[1]: https://example.com "title\n\nnew paragraph',
  ])('commits confirmed syntax or falls back to ordinary grammar: %s', source => {
    expect(withoutPositions(parseStreamingGfm(source))).toEqual(withoutPositions(parseGfm(source)))
  })

  test.each([
    '`[label](https://unfinished`',
    '```md\n[1]: https://e\n[label](https://e',
    '    [1]: https://e',
    '\\[label](https://e',
    '1. https://example.com/research/long-address',
    '<https://example.com>',
    '[label](https://example.com) next text',
    '[label](https://example.com "title") next',
    '[label](https://example.com\n\nNext paragraph',
    '[outer [inner](https://inner.test)](https://unfinished',
    '| A | B |\n| - | - |\n| [label](https://example.com) | value |',
  ])('preserves settled ordinary syntax: %s', source => {
    expect(withoutPositions(parseStreamingGfm(source))).toEqual(withoutPositions(parseGfm(source)))
  })

  test('reference context does not leak synthetic definitions into open fences or HTML', () => {
    for (const source of ['```md\n[1]: https://e', '> ```md\n> code', '<div>\nhello']) {
      expect(withoutPositions(parseStreamingGfm(source, '[1]: /'))).toEqual(withoutPositions(parseGfm(source)))
    }
  })

  test('CRLF does not prematurely flush a still-open inline destination', () => {
    const tree = parseStreamingGfm('[Research](https://example.com\r\n')
    expect(JSON.stringify(tree)).not.toContain('https://')
  })

  test.each([
    '[1]: https://example.com "title\n# Heading',
    '[1]: https://example.com "title\n```js\ncode\n```',
    '- [1]: https://example.com "title\n- Next item',
    '> [1]: https://example.com "title\n> # Heading',
    '[1]: https://example.com\n"title\n# Heading',
    '[ ]: https://example.com',
    '[a[b]: https://example.com',
    `[${'a'.repeat(1000)}]: https://example.com`,
  ])('recovers invalid definitions at parser-confirmed boundaries: %s', source => {
    expect(withoutPositions(parseStreamingGfm(source))).toEqual(withoutPositions(parseGfm(source)))
    if (source.includes('"title')) expect(withoutPositions(parseStreamingGfm(`${source}\nclosing"`))).toEqual(withoutPositions(parseGfm(`${source}\nclosing"`)))
  })

  test.each(['# Heading', '---', '- List', '> Quote', '1. List', '    Code', '**bold** and `code`'])('keeps pending labels in inline grammar: %s', label => {
    for (const prefix of ['', '   ', '> ', '- ']) {
      for (const destination of ['', 'https://unfinished']) {
        const source = `${prefix}[${label}](${destination}`
        const actual = parseStreamingGfm(source)
        expect(withoutPositions(actual)).toEqual(withoutPositions(parseGfm(`${prefix}[${label}]()`)))
        expect(actual.children[0]?.position?.end.offset).toBeLessThanOrEqual(source.length)
      }
    }
  })

  test('buffers a multiline inline title inside a blockquote as an empty link', () => {
    const source = '> [Label](https://example.com\n> "Multiline\n> title'
    expect(withoutPositions(parseStreamingGfm(source))).toEqual(withoutPositions(parseGfm('> [Label]()')))
  })

  test('retains original offsets for code after temporarily hidden syntax', () => {
    const source = '[1]: https://example.com "Title"\n\n```ts\nconst n = 1\n```'
    const code = parseStreamingGfm(source, '[1]: /').children.find(node => node.type === 'code')
    expect(code).toEqual(parseGfm(source).children.find(node => node.type === 'code'))
  })

  test('ordinary appended blocks retain bounded tail parsing with reference context', () => {
    let parsed = 0
    const parser = new IncrementalMarkdownParser(source => {
      parsed += source.length
      return parseStreamingGfm(source, '[1]: /')
    })
    let source = ''
    for (let index = 0; index < 400; index++) {
      source += `Paragraph ${index} with reference [1].\n\n`
      parser.update(source)
    }
    expect(parsed).toBeLessThan(source.length * 5)
  })
})
