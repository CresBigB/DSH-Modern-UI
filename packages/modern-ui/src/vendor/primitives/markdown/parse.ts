/**
 * The markdown renderer's two mdast grammars, one per rendering arm. Each
 * arm is internally consistent — the incremental tail parses, the one-shot
 * parses, and the plain-text projection of a given grammar always agree on
 * where blocks start and end — and the settled grammar is the streaming one
 * plus the math extensions, so the arms differ only where TeX delimiters
 * begin a math construct (a `$$` block is a paragraph while streaming and a
 * math block once settled, by design).
 */

import type { Definition, Image, Link, Root, RootContent } from 'mdast'
import type { CompileContext, Extension, Token } from 'mdast-util-from-markdown'
import { recoverLocalImages } from './local-image-syntax.ts'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { decodeString } from 'micromark-util-decode-string'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'
import { cjkFriendlyStrong } from './cjkFriendlyStrong.ts'
import { mathCompatibility } from './mathCompatibility.ts'

/**
 * Ported from official 0.2.2-rc.1 ui-primitives/src/markdown/windows-path-destinations.ts.
 * A raw destination is a Windows path when it has a backslash and no URL
 * scheme, and either has no `/` or has a backslash before a letter or digit,
 * which CommonMark cannot read as an escape. A drive letter is not a scheme.
 */
function isWindowsPath(raw: string): boolean {
  return raw.includes('\\') && !/^[a-z][a-z\d+.-]+:/iu.test(raw)
    && (!raw.includes('/') || /\\[\p{L}\p{N}]/u.test(raw))
}

function exitDestination(this: CompileContext, token: Token): void {
  const parsed = this.resume()
  const raw = this.sliceSerialize(token)
  const node = this.stack.at(-1) as Link | Image | Definition
  // Doubling each backslash makes every one literal; character references still decode.
  node.url = isWindowsPath(raw) ? decodeString(raw.replaceAll('\\', '\\\\')) : parsed
}

/**
 * Keeps every backslash in a Windows-path destination literal (`D:\repo\.github`
 * would otherwise lose the one before `.`); other destinations parse unchanged.
 */
function windowsPathDestinations(): Extension {
  return { exit: { resourceDestinationString: exitDestination, definitionDestinationString: exitDestination } }
}

/** GFM strikethrough requires `~~`; a single `~` stays literal, as in ranges such as `10~20`. */
const gfmOptions = { singleTilde: false }

/**
 * Parse GFM markdown (the streaming arm's grammar: no math, so incomplete
 * TeX never flashes KaTeX errors mid-stream).
 * @param text - Markdown source.
 * @returns The mdast root.
 */
export function parseGfm(text: string): Root {
  return recoverLocalImages(fromMarkdown(text, {
    extensions: [gfm(gfmOptions), cjkFriendlyStrong()],
    mdastExtensions: [gfmFromMarkdown(), windowsPathDestinations()],
  }), text)
}

type Frontier = 'pending' | 'complete' | 'invalid'

function withoutQuotePrefixes(text: string, depth: number): string {
  if (depth === 0) return text
  return text.replace(/(\r\n|\r|\n)([^\r\n]*)/g, (_, newline: string, line: string) => {
    for (let index = 0; index < depth; index++) line = line.replace(/^ {0,3}>[ \t]?/, '')
    return newline + line
  })
}

/** Scan a destination and optional title, retaining ambiguity at the stream frontier. */
function destinationFrontier(text: string, start: number, inline: boolean): Frontier {
  let index = start
  let lines = 0
  const whitespace = (): boolean => {
    while (index < text.length && /[ \t\r\n]/.test(text[index]!)) {
      if (text[index] === '\n' || (text[index] === '\r' && text[index + 1] !== '\n')) lines++
      index++
    }
    return lines < 2
  }
  if (!whitespace()) return 'invalid'
  if (index === text.length) return 'pending'
  const angled = text[index] === '<'
  if (angled) index++
  let depth = 0
  const destinationStart = index
  for (; index < text.length; index++) {
    const char = text[index]!
    if (char === '\\' && index + 1 < text.length && /[!-/:-@[-`{-~]/.test(text[index + 1]!)) { index++; continue }
    if (angled) {
      if (char === '>') { index++; break }
      if (char === '<' || char === '\n' || char === '\r') return 'invalid'
    } else {
      if (/[ \t\r\n]/.test(char)) break
      if (char === '(') depth++
      if (char === ')') {
        if (depth === 0) return inline ? 'complete' : 'invalid'
        depth--
      }
    }
  }
  if (index === text.length) return 'pending'
  if (!angled && (index === destinationStart || depth !== 0)) return 'invalid'
  const separator = index
  lines = 0
  if (!whitespace()) return inline ? 'invalid' : 'complete'
  if (index === text.length) return 'pending'
  if (inline && text[index] === ')') return 'complete'
  const opener = text[index]
  if (index === separator || (opener !== '"' && opener !== "'" && opener !== '(')) {
    // A following non-title line settles a bare definition. Same-line junk invalidates it.
    return !inline && lines > 0 ? 'complete' : 'invalid'
  }
  const closer = opener === '(' ? ')' : opener
  index++
  let previousNewline = false
  for (; index < text.length; index++) {
    const char = text[index]!
    if (char === '\\' && index + 1 < text.length && /[!-/:-@[-`{-~]/.test(text[index + 1]!)) { index++; previousNewline = false; continue }
    if (char === closer) {
      index++
      while (text[index] === ' ' || text[index] === '\t') index++
      if (inline) return index === text.length ? 'pending' : text[index] === ')' ? 'complete' : 'invalid'
      return index === text.length || text[index] === '\n' || text[index] === '\r' ? 'complete' : 'invalid'
    }
    if (char === '\r' && text[index + 1] === '\n') continue
    if (char === '\n' || char === '\r') {
      if (previousNewline) return 'invalid'
      previousNewline = true
    } else if (char !== ' ' && char !== '\t') previousNewline = false
    if (opener === '(' && char === '(') return 'invalid'
  }
  return 'pending'
}

/**
 * Original streaming-only presentation policy. Work is confined to the parser's
 * mutable tail. Pending definitions stay hidden; pending links retain their
 * inline label grammar with an empty, non-clickable destination. Code rendering
 * and copy receive the untouched source. Settled parsing never uses this policy.
 */
export function parseStreamingGfm(text: string, references = ''): Root {
  const original = parseGfm(text)
  const masks: { start: number; end: number; link?: boolean }[] = []
  // A real following block disproves an unclosed definition, even without a
  // blank line. A bare definition may still acquire a title from the next
  // paragraph, but only within the same container and at the stream frontier.
  const frontier: { node: RootContent; parent: Root | RootContent }[] = []
  const collectFrontier = (parent: Root | RootContent): void => {
    if (!('children' in parent)) return
    for (const node of parent.children) {
      if ((node.type === 'blockquote' || node.type === 'list' || node.type === 'listItem' || node.type === 'footnoteDefinition') && node.children.length > 0) collectFrontier(node)
      else {
        frontier.push({ node, parent })
        if (frontier.length > 2) frontier.shift()
      }
    }
  }
  collectFrontier(original)
  const last = frontier.at(-1)
  const previous = frontier.at(-2)
  let pendingDefinition = text.length
  const visit = (node: RootContent, quoteDepth = 0): void => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) return
    if (start >= pendingDefinition) return
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return
    if ((node.type === 'definition' || node.type === 'paragraph') && text[start] === '[') {
      // mdast offsets include container prefixes on continuation lines, while
      // CommonMark consumes them before parsing definition destinations/titles.
      const definitionSource = withoutQuotePrefixes(text.slice(start), quoteDepth)
      const marker = /^\[(?:\\.|[^\]\\])+\]:/.exec(definitionSource)
      const atFrontier = last?.node === node || (node.type === 'definition' && previous?.node === node && last?.node.type === 'paragraph' && last.parent === previous.parent)
      if (atFrontier && marker !== null && !marker[0].startsWith('[^')
        && destinationFrontier(definitionSource, marker[0].length, false) === 'pending'
        // Let CommonMark validate labels (escapes, nested brackets, whitespace,
        // and its exact length limit); a matching prefix is not proof of syntax.
        && (node.type === 'definition' || parseGfm(`${marker[0]} / "pending"`).children[0]?.type === 'definition')) {
        masks.push({ start, end: last?.node.position?.end.offset ?? end })
        pendingDefinition = start
        return
      }
    }
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'tableCell') {
      // A later block or blank line proves an unfinished inline link was
      // literal Markdown. Do not freeze a presentation-only omission.
      const following = withoutQuotePrefixes(text.slice(end), quoteDepth)
      if (following.trim() !== '' || /\n[ \t]*\n/.test(following.replace(/\r\n?/g, '\n'))) return
      const protectedRanges: [number, number][] = []
      const protect = (child: RootContent): void => {
        if (child.type === 'inlineCode' || child.type === 'link' || child.type === 'image' || child.type === 'html') {
          const a = child.position?.start.offset, b = child.position?.end.offset
          if (a !== undefined && b !== undefined) protectedRanges.push([a, b])
        } else if ('children' in child) child.children.forEach(protect)
      }
      node.children.forEach(protect)
      const brackets: number[] = []
      let protectedIndex = 0
      for (let index = start; index < end; index++) {
        while (protectedRanges[protectedIndex] !== undefined && protectedRanges[protectedIndex]![1] <= index) protectedIndex++
        const protectedRange = protectedRanges[protectedIndex]
        if (protectedRange !== undefined && protectedRange[0] <= index) { index = protectedRange[1] - 1; continue }
        if (text[index] === '\\') { index++; continue }
        if (text[index] === '[') brackets.push(index)
        if (text[index] !== ']' || brackets.length === 0) continue
        const opening = brackets.pop()!
        if (text[index + 1] !== '(' || text[opening - 1] === '!') continue
        if (destinationFrontier(withoutQuotePrefixes(text.slice(index + 2, end), quoteDepth), 0, true) === 'pending') {
          const label = parseGfm(`${withoutQuotePrefixes(text.slice(opening, index + 1), quoteDepth)}()`).children[0]
          // Nested links and other invalid labels cannot become this link even
          // after its closing delimiter arrives. Keep their authored text.
          if (label?.type !== 'paragraph' || label.children[0]?.type !== 'link' || label.children[0].position?.start.offset !== 0) continue
          masks.push({ start: index + 2, end, link: true })
          break
        }
      }
      return
    }
    if ('children' in node) node.children.forEach(child => visit(child, quoteDepth + (node.type === 'blockquote' ? 1 : 0)))
  }
  original.children.forEach(node => visit(node))
  let display = text
  for (const { start, end, link } of masks) {
    const replacement = link
      ? `)${display.slice(start + 1, end).replace(/[^\r\n]/g, ' ')}`
      : display.slice(start, end).replace(/[^\r\n]/g, ' ')
    display = display.slice(0, start) + replacement + display.slice(end)
  }
  const root = display === text ? original : parseGfm(display)
  // A chunk ending exactly at `](` needs one synthetic closing character.
  // It belongs only to the inline frontier; never move source block endpoints.
  if (display.length > text.length && original.position !== undefined) {
    const clamp = (node: Root | RootContent): void => {
      if (node.position !== undefined && (node.position.end.offset ?? 0) > text.length) node.position.end = original.position!.end
      if ('children' in node) node.children.forEach(clamp)
    }
    clamp(root)
  }
  if (references === '') return root
  // The suffix supplies only reference labels to micromark. Actual destinations
  // and footnote bodies are supplied by the document-local render targets.
  const contextual = parseGfm(`${display}${openBlockCloser(display, root)}\n\n${references}`)
  const trim = (nodes: RootContent[], originals: readonly RootContent[]): RootContent[] => {
    const byPosition = new Map(originals.map(node => [`${node.type}:${node.position?.start.offset}`, node]))
    return nodes.filter(node => (node.position?.start.offset ?? text.length) < text.length).map(node => {
      const matching = byPosition.get(`${node.type}:${node.position?.start.offset}`)
      if ((node.type === 'code' || node.type === 'html') && (node.position?.end.offset ?? 0) > text.length && matching !== undefined) return matching
      if ('children' in node) node.children = trim(node.children, matching !== undefined && 'children' in matching ? matching.children : []) as typeof node.children
      if (matching?.position !== undefined) node.position = matching.position
      return node
    })
  }
  contextual.children = trim(contextual.children, root.children)
  return contextual
}

/**
 * The closing line for a fenced code block or raw HTML block (CommonMark types 1–5) left open at the end of the
 * text, or '' when there is none. The reference-label suffix would otherwise become content of that block and the
 * labels would stop resolving. A container (list item, block quote) is already ended by the suffix's unindented
 * lines, so only top-level blocks need a closer; the trim keeps the block exactly as it arrived.
 * @param display - The masked streaming text.
 * @param root - Its parse without the suffix.
 * @returns The text to insert before the suffix.
 */
function openBlockCloser(display: string, root: Root): string {
  const last = root.children.at(-1)
  if (last === undefined || (last.position?.end.offset ?? 0) < display.trimEnd().length) return ''
  const opening = display.slice(last.position?.start.offset ?? 0)
  if (last.type === 'code') {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(opening)?.[1]
    if (fence === undefined) return ''
    const lines = opening.trimEnd().split(/\r?\n/)
    const closing = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`)
    return lines.length > 1 && closing.test(lines.at(-1)!) ? '' : `\n${fence}`
  }
  if (last.type === 'html') {
    const kinds: readonly (readonly [RegExp, string])[] = [
      [/^ {0,3}<(script|pre|style|textarea)(?=[\s>]|$)/i, ''],
      [/^ {0,3}<!--/, '-->'],
      [/^ {0,3}<\?/, '?>'],
      [/^ {0,3}<![A-Za-z]/, '>'],
      [/^ {0,3}<!\[CDATA\[/, ']]>'],
    ]
    for (const [pattern, closer] of kinds) {
      const match = pattern.exec(opening)
      if (match === null) continue
      const end = closer || `</${match[1]}>`
      return opening.includes(end, match[0].length) ? '' : `\n${end}`
    }
  }
  return ''
}

/**
 * Parse GFM markdown plus TeX math with the compatibility delimiters
 * (the settled arm's grammar).
 * @param text - Markdown source.
 * @returns The mdast root.
 */
export function parseGfmWithMath(text: string): Root {
  return recoverLocalImages(fromMarkdown(text, {
    // `mathCompatibility()` MUST stay last: micromark dispatches the extension
    // registered last first, so its dollar flow takes precedence over `math()`
    // and keeps the opening line's text as math instead of upstream's fence meta.
    // Upstream single-dollar text math has no delimiter rules, so a price such as
    // `$115.36亿` paired with the next `$` and swallowed bold markers; the guarded
    // single-dollar construct in `mathCompatibility()` replaces it.
    extensions: [gfm(gfmOptions), cjkFriendlyStrong(), math({ singleDollarTextMath: false }), mathCompatibility()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown(), windowsPathDestinations()],
  }), text)
}
