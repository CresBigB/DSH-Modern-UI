import { afterAll, test } from 'vitest'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const root = path.resolve(import.meta.dirname, '../..')
const directory = await mkdtemp(path.join(tmpdir(), 'modern-layout-'))
const require = createRequire(import.meta.url)
const official = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-primitives'), 'utf8')
const region = name => {
  const begin = official.indexOf('//#region lib/types/' + name + '.js')
  const end = official.indexOf('//#endregion', begin)
  assert.ok(begin >= 0 && end > begin)
  return official.slice(begin, end)
}
// Use the published modal/composition behavior, sharing the test's React instance.
const officialLayer = `import {useRef,useLayoutEffect} from 'react'; ${region('keyboard-composition')} ${region('focus')} ${region('useModalLayer')} export {useModalLayer,isBehindModal,closeTopModal,observeComposition};`
await build({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {ConversationWidthControls,ConversationLayoutSettings} from './packages/modern-ui/src/conversation-layout.tsx';
import root from './packages/modern-ui/src/vendor/conversation/client/skeleton/ConversationRoot.module.css';
import chat from './packages/modern-ui/src/vendor/chat/client/chat/ChatView.module.css';
import assistant from './packages/modern-ui/src/vendor/chat/client/chat/AssistantMarkdown.module.css';
import md from './packages/modern-ui/src/vendor/primitives/markdown/MarkdownText.module.css';
function Demo(){const [body,setBody]=useState(null);return <><ConversationLayoutSettings/><div id="pane" className={root.root} style={{height:600}}>
<div ref={setBody} className={root.body} data-conversation-content><div className={root.scrollBody} data-conversation-scroll>
<div className={chat.scroll}><div className={chat.column} data-column><article className={assistant.root}><div className={assistant.body}>
<div className={md.markdown}><h2 data-heading>回答标题</h2><p data-prose>{'这是一段用来检查对话宽度与居中布局的中文长文，'.repeat(35)}</p><ul><li data-list>列表与段落使用同一列宽。</li></ul><blockquote data-quote>引用也保持在同一条阅读轴上。</blockquote></div>
</div></article></div></div><div data-composer style={{width:'var(--dsh-composer-card-max-width)',maxWidth:'100%',margin:'0 auto'}}>输入框</div></div>
<ConversationWidthControls container={body} phase="active"/></div></div><div className={md.markdown} style={{width:840}}><p data-preview>独立预览仍保留自己的阅读行长。</p></div></>};
createRoot(document.getElementById('app')).render(<Demo/>);`,
  },
  outfile: path.join(directory, 'client.js'),
  bundle: true,
  jsx: 'automatic',
  format: 'esm',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'published-primitives',
      setup(builder) {
        builder.onResolve({ filter: /^@iroha1145\/dsh-modern-ui\/primitives$/ }, () => ({ path: 'modern-primitives', namespace: 'layout-test' }))
        builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'official-layer', namespace: 'layout-test' }))
        builder.onLoad({ filter: /.*/, namespace: 'layout-test' }, args => ({
          contents:
            args.path === 'official-layer'
              ? officialLayer
              : `export {Menu} from ${JSON.stringify(path.join(root, 'packages/modern-ui/src/vendor/primitives/Menu.tsx'))}; export {IconChevronDownOutlineRegular} from ${JSON.stringify(path.join(root, 'packages/modern-ui/src/vendor/primitives/icons/index.tsx'))};`,
          loader: 'tsx',
          resolveDir: root,
        }))
      },
    },
  ],
  logLevel: 'silent',
})
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/client.css"><style>body{margin:0;font:14px Arial;--dsw-font-markdown-base:14px/1.6 Arial;--dsw-alias-bg-base:white;--dsw-alias-label-primary:black;--dsw-alias-label-secondary:#333;--dsw-alias-label-tertiary:#777}#pane{width:100%}</style><div id="app"></div><script type="module" src="/client.js"></script>`
const server = createServer(async (request, response) => {
  const name = request.url === '/client.js' ? 'client.js' : request.url === '/client.css' ? 'client.css' : null
  response.setHeader('Content-Type', name?.endsWith('.js') ? 'text/javascript' : name ? 'text/css' : 'text/html')
  response.end(name ? await readFile(path.join(directory, name)) : html)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
const executablePath = process.env.MODERN_UI_BROWSER
const browser = await chromium.launch(
  executablePath ? { executablePath, headless: true } : existsSync(chromium.executablePath()) ? { headless: true } : { channel: 'msedge', headless: true },
)
afterAll(async () => {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
})

async function width(page) {
  return Math.round((await page.locator('[data-column]').boundingBox()).width)
}
async function chooseMode(page, mode) {
  await page.locator('[data-conversation-layout-settings] button[aria-haspopup="menu"]').click()
  await page.getByRole('menuitem', { name: { reading: 'Reading', standard: 'Standard', wide: 'Wide' }[mode], exact: true }).click()
}
async function open() {
  const context = await browser.newContext({ viewport: { width: 1520, height: 900 } })
  const page = await context.newPage()
  const failed = new Promise((_, reject) => {
    page.once('pageerror', reject)
  })
  await page.goto(url)
  await Promise.race([page.locator('[data-conversation-layout]').waitFor({ timeout: 10_000 }), failed])
  return { context, page }
}

test('presets center the whole response, remove its second measure, and preserve independent previews', async () => {
  const { context, page } = await open()
  try {
    for (const [mode, expected] of [
      ['reading', 680],
      ['standard', 840],
      ['wide', 1040],
    ]) {
      await chooseMode(page, mode)
      await page.waitForFunction(expected => Math.round(document.querySelector('[data-column]').getBoundingClientRect().width) === expected, expected)
      const geometry = await page.evaluate(() => {
        const column = document.querySelector('[data-column]').getBoundingClientRect()
        const prose = document.querySelector('[data-prose]').getBoundingClientRect()
        const heading = document.querySelector('[data-heading]').getBoundingClientRect()
        const composer = document.querySelector('[data-composer]').getBoundingClientRect()
        const list = document.querySelector('[data-list]')
        return {
          column: column.width,
          prose: prose.width,
          start: prose.x - heading.x,
          axis: prose.x + prose.width / 2 - (composer.x + composer.width / 2),
          listMeasure: getComputedStyle(list).maxWidth,
          previewMeasure: getComputedStyle(document.querySelector('[data-preview]')).maxWidth,
        }
      })
      assert.equal(geometry.prose, geometry.column)
      assert.equal(geometry.start, 0)
      assert.ok(Math.abs(geometry.axis) < 1, JSON.stringify(geometry))
      assert.equal(geometry.listMeasure, 'none')
      assert.notEqual(geometry.previewMeasure, 'none')
    }
  } finally {
    await context.close()
  }
})

test('both pointer handles, keyboard controls, persistence and preset reset work together', async () => {
  const { context, page } = await open()
  try {
    const right = page.locator('[data-conversation-width-handle="right"]')
    const box = await right.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + 20, { steps: 8 })
    await page.mouse.up()
    assert.equal(await width(page), 960)
    await page.reload()
    await page.locator('[data-conversation-layout]').waitFor()
    assert.equal(await width(page), 960)
    const left = page.locator('[data-conversation-width-handle="left"]')
    await left.focus()
    await left.press('ArrowLeft')
    assert.equal(await width(page), 968)
    await left.press('Home')
    assert.equal(await width(page), 480)
    await chooseMode(page, 'reading')
    assert.equal(await width(page), 680)
    await right.focus()
    await right.press('ArrowRight')
    await right.dblclick()
    assert.equal(await width(page), 680)
    await page.locator('#pane').evaluate(pane => {
      pane.style.height = '280px'
    })
    await right.hover()
    await page.mouse.wheel(0, 180)
    await page.waitForFunction(() => document.querySelector('[data-conversation-scroll]').scrollTop > 0)
  } finally {
    await context.close()
  }
})

test('pane resizing and phone widths fit without discarding the desktop preference', async () => {
  const { context, page } = await open()
  try {
    await chooseMode(page, 'wide')
    await page.locator('#pane').evaluate(pane => {
      pane.style.width = '390px'
    })
    await page.waitForFunction(() => document.querySelector('[data-column]').getBoundingClientRect().width < 390)
    assert.ok((await width(page)) > 300)
    assert.equal(await page.locator('[data-conversation-width-handle]').count(), 0)
    await page.locator('#pane').evaluate(pane => {
      pane.style.width = '100%'
    })
    await page.waitForFunction(() => Math.round(document.querySelector('[data-column]').getBoundingClientRect().width) === 1040)
    for (const size of [640, 390, 320]) {
      await page.setViewportSize({ width: size, height: 900 })
      await page.waitForFunction(size => document.querySelector('[data-column]').getBoundingClientRect().right <= size, size)
      assert.ok((await width(page)) <= size)
    }
  } finally {
    await context.close()
  }
})
