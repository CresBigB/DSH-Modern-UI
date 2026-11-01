import { describe, expect, test } from 'vitest'
import { hasMarkdownSection, hasSectionReply, hasVisualReply, isAnswerStep } from '../../packages/modern-ui/src/vendor/chat/client/contract/turn-process.ts'
import { ChatTurnProcessProjector } from '../../packages/modern-ui/src/vendor/chat/client/conversation-nodes/turn-process-presentation.ts'
import { turnProcessDefinition } from '../../packages/modern-ui/src/vendor/chat/client/conversation-nodes/turn-process.ts'
import { turnNavigationItem } from '../../packages/modern-ui/src/vendor/chat/client/conversation-nodes/turn-navigation.ts'
import { hasOpenUIFence } from '../../packages/modern-ui/src/vendor/intelligent/client/openui-source.ts'

// Shaped after a real staged answer: three visualizations, each followed by web searches before the next one, so the
// first two segments share their Steps with Tool calls and only the third is the closing reply.

type Block = { readonly kind: string; readonly text?: string; readonly name?: string }

const chart = (title: string) => `\`\`\`openui-lang\nroot = Card([title])\ntitle = TextContent("${title}")\n\`\`\``
const reasoning = (text: string): Block => ({ kind: 'reasoning', text })
const text = (body: string): Block => ({ kind: 'text', text: body })
const tool = (name: string): Block => ({ kind: 'tool-call', name })

const steps: { readonly step: number; readonly blocks: readonly Block[]; readonly finalNode: { readonly seq: number } }[] = [
  { step: 1, blocks: [reasoning('plan three segments'), text(`第 1 段\n\n${chart('含量')}\n\n先查资料。`), tool('web_search')], finalNode: { seq: 21 } },
  { step: 2, blocks: [reasoning('read the page'), tool('web_fetch')], finalNode: { seq: 30 } },
  { step: 3, blocks: [reasoning('check half-life'), text('查到了官方口径。'), tool('web_search')], finalNode: { seq: 36 } },
  { step: 4, blocks: [reasoning('draw the curve'), text(`第 2 段\n\n${chart('衰减')}`), tool('web_fetch')], finalNode: { seq: 44 } },
  { step: 5, blocks: [reasoning('build the tool'), text(`第 3 段\n\n${chart('计算器')}`)], finalNode: { seq: 50 } },
]

describe('hasOpenUIFence', () => {
  test('counts closed openui-lang fences and openui fences written in openui-lang', () => {
    expect(hasOpenUIFence(chart('x'))).toBe(true)
    expect(hasOpenUIFence('Intro\n\n~~~~ OpenUI-Lang\nroot = Col([])\n~~~~\n')).toBe(true)
    expect(hasOpenUIFence('```openui\n// sizing\nroot = Card([])\n```')).toBe(true)
    expect(hasOpenUIFence('Intro\r\n\r\n```openui-lang\r\nroot = Col([])\r\n```\r\n')).toBe(true)
  })

  test('a line opening with inline code is not a fence, so the real block after it still counts', () => {
    // Read as a fence, the inline ```text``` would run to the real block's closing line and swallow the block.
    expect(hasOpenUIFence('```text``` 是普通代码块的标签。\n\n```openui-lang\nroot = Card([])\n```')).toBe(true)
  })

  test('ignores streaming fences, prose mentions, HTML openui fences and fences nested in other code', () => {
    expect(hasOpenUIFence('```openui-lang\nroot = Card([])')).toBe(false)
    expect(hasOpenUIFence('Write a ```openui-lang fence next time.')).toBe(false)
    expect(hasOpenUIFence('```openui\n<section>Old</section>\n```')).toBe(false)
    expect(hasOpenUIFence('````markdown\n```openui-lang\nroot = Card([])\n```\n````')).toBe(false)
    expect(hasOpenUIFence('```ts\nconst a = 1\n```\n\nplain')).toBe(false)
  })

  test('only reply text counts, not reasoning', () => {
    expect(hasVisualReply([reasoning(chart('draft')) as never, text('Done.') as never])).toBe(false)
    expect(hasVisualReply([text(chart('final')) as never])).toBe(true)
  })
})

type Fixture = typeof steps

function turn(list: Fixture) {
  return {
    turn: 1,
    status: 'closed',
    start: { seq: 6 },
    steps: list.map(data => ({ step: data.step, status: 'closed', data: { get: () => data } })),
    data: { get: () => undefined },
  }
}

function buildSpec(list: Fixture = steps) {
  const location = turn(list)
  const replies = list.filter(data => data.blocks.some(block => block.kind === 'text'))
  const context = {
    state: {
      turn: 1,
      controlAnchorSeq: 6,
      assistantStartByStep: new Map(list.map(data => [data.step, data.finalNode.seq - 1])),
      messageCountByStep: new Map(replies.map(data => [data.step, 1])),
      messageCount: replies.length,
      toolCallCount: list.filter(data => data.blocks.some(block => block.kind === 'tool-call')).length,
      subagentCount: 0,
    },
    start: { location: { kind: 'turn', turn: location } },
    matches: [],
    current: new Map(),
  }
  const result = turnProcessDefinition.buildLocationData?.(context as never, 'turn', undefined)
  if (result?.kind !== 'turn') throw new Error('turn-process data expected')
  return { spec: result.value as never as Parameters<typeof isAnswerStep>[0] & Record<string, unknown>, location }
}

describe('staged visualizations stay outside the folded process', () => {
  test('every Step whose reply carries a visualization joins the answer; narration-only Steps stay process', () => {
    const { spec } = buildSpec()
    expect(spec.answerStep).toBe(5)
    expect(steps.map(data => isAnswerStep(spec, data as never))).toEqual([true, false, false, true, true])
    // Step 3's narration is the only reply left in the fold; the visual Steps' reasoning folds with the answer's.
    expect(spec.messageCount).toBe(1)
    expect(spec.inlineReasoning).toBe(true)
  })

  test('the fold still has content while Tools or narration remain, and none when only visual segments do', () => {
    const { spec, location } = buildSpec()
    const nodes = (members: readonly (typeof steps)[number][], tools: boolean) => {
      const values = [
        { key: 'input', kind: 'user', anchorSeq: 10, groupTree: 'input', data: {} },
        { key: 'control', kind: 'turn-process', anchorSeq: 6.5, groupTree: 'turn', data: spec },
        ...members.map(data => ({ key: `step-${data.step}`, kind: 'assistant-step', anchorSeq: data.finalNode.seq - 1, data })),
        ...(tools ? [{ key: 'tool', kind: 'tool-call', anchorSeq: 22, data: {} }] : []),
      ].map(node => ({ target: 'chat', id: node.key, visibility: 'visible', location: { kind: 'turn', turn: location }, ...node }))
      const byKey = new Map(values.map(node => [node.key, node]))
      return {
        order: [...byKey.keys()],
        locations: { getTurn: () => [...byKey.keys()] },
        nodes: { get: (key: string) => byKey.get(key) },
        control: byKey.get('control'),
      }
    }
    const presentation = (members: readonly (typeof steps)[number][], tools: boolean) => {
      const f = nodes(members, tools)
      const projector = new ChatTurnProcessProjector()
      projector.replace(f.order, f.locations as never, f.nodes as never)
      return projector.get(f.control as never)
    }
    expect(presentation(steps, true)?.hasExternalProcess).toBe(true)
    expect(presentation([steps[0], steps[2], steps[4]], false)?.hasExternalProcess).toBe(true)
    expect(presentation([steps[0], steps[3], steps[4]], false)?.hasExternalProcess).toBe(false)
  })
})

describe('hasMarkdownSection', () => {
  test('counts a heading anywhere outside code, after one lead-in sentence too', () => {
    expect(hasMarkdownSection('## 天气\n\n三天以晴为主。')).toBe(true)
    expect(hasMarkdownSection('天气查完了。\n\n## 天气\n\n三天以晴为主。')).toBe(true)
    expect(hasMarkdownSection('Intro\r\n\r\n### Sights\r\nDay one outdoors.')).toBe(true)
    // A mid-turn result table under a heading is a finished result; keeping it visible is intended.
    expect(hasMarkdownSection('找到原因了。状态报告:\n\n## 📊 检查结果\n\n| 项目 | 状态 |\n|---|---|\n| 插件加载 | 正常 |')).toBe(true)
  })

  test('a line opening with inline code does not hide the heading after it', () => {
    expect(hasMarkdownSection('```openui-lang``` 是组件代码块的标签。\n\n## 天气\n\n三天以晴为主。')).toBe(true)
  })

  test('ignores plain progress notes, headings in fences or indented code, and hashes that open no heading', () => {
    expect(hasMarkdownSection("I'll investigate this. Let me start by looking at your workspace.")).toBe(false)
    expect(hasMarkdownSection('我来搜一下东京今天的天气。')).toBe(false)
    expect(hasMarkdownSection('插件行已出现：\n\n```yaml\n# == @dsh-external/workflow\n- id: x\n```')).toBe(false)
    expect(hasMarkdownSection('````markdown\n```\n## not closed by the shorter fence\n```\n````')).toBe(false)
    expect(hasMarkdownSection('Streaming code:\n\n~~~\n## still inside')).toBe(false)
    expect(hasMarkdownSection('    ## indented code')).toBe(false)
    expect(hasMarkdownSection('#hashtag and ##\n#')).toBe(false)
  })

  test('only reply text counts, not reasoning', () => {
    expect(hasSectionReply([reasoning('## Plan\n1. weather') as never, text('Searching.') as never])).toBe(false)
    expect(hasSectionReply([text('## Weather\nSunny.') as never, tool('web_search') as never])).toBe(true)
  })
})

describe('progressively delivered text sections stay outside the folded process', () => {
  // Shaped after the travel plan the user described: weather, then sights, then food, each written as soon as its
  // searches finish and before the searches for the next part, as plain Markdown without components.
  const travel: Fixture = [
    { step: 1, blocks: [reasoning('plan weather, sights, food'), tool('web_search')], finalNode: { seq: 12 } },
    {
      step: 2,
      blocks: [reasoning('weather settled'), text('## 天气\n\n三天以晴为主，第二天有阵雨。'), tool('web_search')],
      finalNode: { seq: 20 },
    },
    { step: 3, blocks: [reasoning('need opening hours'), text('再核对一下营业时间。'), tool('web_fetch')], finalNode: { seq: 28 } },
    {
      step: 4,
      blocks: [reasoning('sights settled'), text('景点也定了。\n\n## 景点\n\n第一天户外，第二天美术馆。'), tool('web_search')],
      finalNode: { seq: 36 },
    },
    {
      step: 5,
      blocks: [reasoning('food settled'), text('## 美食\n\n每天就近安排餐厅。\n\n总的来说，第一天最适合户外。')],
      finalNode: { seq: 44 },
    },
  ]

  test('the turn navigation previews the first delivered part, not the closing one', () => {
    const { spec, location } = buildSpec(travel)
    const values = [
      { key: 'input', kind: 'user', anchorSeq: 10, data: { content: [{ type: 'text', text: '帮我规划三天行程' }] } },
      ...travel.map(data => ({ key: `step-${data.step}`, kind: 'assistant-step', anchorSeq: data.finalNode.seq - 1, data })),
    ].map(node => ({
      target: 'chat',
      id: node.key,
      visibility: 'visible',
      location: { kind: 'turn', turn: { ...location, data: { get: () => spec } } },
      ...node,
    }))
    const byKey = new Map(values.map(node => [node.key, node]))
    const item = turnNavigationItem(1, { getTurn: () => [...byKey.keys()] } as never, { get: (key: string) => byKey.get(key) } as never)
    expect(item?.response).toContain('三天以晴为主')
    expect(item?.response).not.toContain('鲷鱼饭')
  })

  test('every Step that delivers a section joins the answer; the progress note stays in the fold', () => {
    const { spec } = buildSpec(travel)
    expect(spec.answerStep).toBe(5)
    expect(travel.map(data => isAnswerStep(spec, data as never))).toEqual([false, true, false, true, true])
    expect(spec.messageCount).toBe(1)
  })
})
