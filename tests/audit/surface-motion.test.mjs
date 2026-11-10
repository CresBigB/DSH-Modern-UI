import { afterAll, test } from 'vitest'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.resolve(import.meta.dirname, '../..')
const directory = await mkdtemp(path.join(tmpdir(), 'modern-surface-motion-'))
await build({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {Button} from './packages/modern-ui/src/vendor/primitives/Button.tsx';
import {Tooltip} from './packages/modern-ui/src/vendor/primitives/Tooltip.tsx';
import modal from './packages/modern-ui/src/vendor/primitives/Modal.module.css';
import './packages/modern-ui/src/vendor/theme/styles/feel.css';
import './packages/modern-ui/src/vendor/theme/styles/base.css';
import './packages/modern-ui/src/official-controls.css';
import './packages/modern-ui/src/official-surfaces.css';
const app=createRoot(document.getElementById('app'));let revision=0;let mode='buttons';
function Fixture({revision}) {return <><span id="revision">{revision}</span>
{mode==='buttons' && <div className="buttons"><Button id="action">Action</Button><Button id="anchor" aria-haspopup="menu">Anchored</Button><button id="official" className="_button_1rv3m_2">Official</button><button id="official-anchor" className="_button_1rv3m_2" aria-haspopup="menu">Official anchored</button></div>}
{mode==='tooltip' && <Tooltip label="A stable tooltip" side="bottom" portal><Button id="tooltip-trigger">Tooltip trigger</Button></Tooltip>}
{mode==='modal' && <div className={modal.root}><div id="mask" className={modal.mask}/><div id="modal" className={modal.dialog} role="dialog" aria-label="Motion fixture"><div className={modal.header}>Modal fixture</div><div className={modal.body}>Stable content</div></div></div>}
{mode==='prompt' && <div id="prompt-host"><div id="prompt" data-trigger-menu>Official prompt menu fixture</div></div>}
</>}
window.show=next=>{mode=next;app.render(<Fixture key={mode} revision={revision}/>)};
window.rerender=()=>{revision++;app.render(<Fixture key={mode} revision={revision}/>)};
`,
  },
  alias: { '@iroha1145/dsh-modern-ui/primitives': path.join(root, 'packages/modern-ui/src/vendor/primitives/index.ts') },
  outdir: directory,
  entryNames: 'client',
  bundle: true,
  jsx: 'automatic',
  format: 'esm',
  loader: { '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
})
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/client.css"><style>
:root{--dsw-alias-label-primary:#111;--dsw-alias-label-secondary:#555;--dsw-radius-sm:6px;--dsw-radius-lg:10px;--dsw-radius-panel:12px;--dsw-alias-tooltip-bg:#222;--dsw-static-neutral-bluish-00:#fff;--dsw-alias-bg-layer-2:white;--dsw-alias-bg-mask-1:#0003}
body{font:14px Arial;margin:40px}.buttons{display:flex;gap:30px;flex-wrap:wrap;width:600px}.buttons button{width:180px;height:36px}#revision{position:fixed;right:4px;bottom:4px}#prompt-host{position:fixed;left:120px;bottom:100px;width:300px;height:40px}#prompt{position:absolute;width:260px;height:160px;background:white;border:1px solid #999;box-sizing:border-box}
</style><body data-modern-official-controls><div id="app"></div><script type="module" src="/client.js"></script>`
const server = createServer(async (request, response) => {
  const name = request.url === '/client.js' ? 'client.js' : request.url === '/client.css' ? 'client.css' : null
  response.setHeader('Content-Type', name?.endsWith('.js') ? 'text/javascript' : name ? 'text/css' : 'text/html')
  response.end(name ? await readFile(path.join(directory, name)) : html)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch(
  process.env.MODERN_UI_BROWSER
    ? { executablePath: process.env.MODERN_UI_BROWSER, headless: true }
    : existsSync(chromium.executablePath())
      ? { headless: true }
      : { channel: 'msedge', headless: true },
)
afterAll(async () => {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
})

async function open(mode, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:' + server.address().port)
  await page.waitForFunction(() => typeof window.show === 'function')
  await page.evaluate(mode => window.show(mode), mode)
  return { context, page }
}
async function frames(page, selector, count = 18) {
  return page.locator(selector).evaluate(async (el, count) => {
    const samples = []
    const started = performance.now()
    // Sample a real time window rather than assuming a 60 Hz headless browser.
    while (performance.now() - started < (count * 1000) / 60) {
      await new Promise(requestAnimationFrame)
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el)
      samples.push({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        cx: r.x + r.width / 2,
        cy: r.y + r.height / 2,
        opacity: Number(s.opacity),
        transform: s.transform,
        translate: s.translate,
      })
    }
    return samples
  }, count)
}
function monotonic(values, direction, label) {
  for (let i = 1; i < values.length; i++) assert.ok(direction * (values[i] - values[i - 1]) >= -0.0001, label + ': ' + values.join(', '))
}
function stableGeometry(samples, position = true) {
  for (const sample of samples)
    for (const key of position ? ['width', 'height', 'x', 'y'] : ['width', 'height']) {
      assert.ok(Math.abs(sample[key] - samples[0][key]) < 0.02, key + ': ' + JSON.stringify(samples))
    }
}

test('vendored and official action feedback stays centered and releases monotonically without overshoot', async () => {
  const { context, page } = await open('buttons')
  try {
    for (const id of ['action', 'official']) {
      const button = page.locator('#' + id),
        box = await button.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      const pressed = await frames(page, '#' + id, 10)
      assert.ok(pressed.at(-1).width < box.width - 1, 'a real press feedback is exercised')
      assert.ok(
        pressed.every(s => Math.abs(s.cx - (box.x + box.width / 2)) < 0.02 && Math.abs(s.cy - (box.y + box.height / 2)) < 0.02),
        'no center translation',
      )
      monotonic(
        pressed.map(s => s.width),
        -1,
        'press',
      )
      await page.mouse.up()
      const released = await frames(page, '#' + id, 18)
      monotonic(
        released.map(s => s.width),
        1,
        'release',
      )
      assert.ok(
        [...pressed, ...released].every(s => s.width >= box.width * 0.985 - 0.02 && s.width <= box.width + 0.02),
        'no overshoot',
      )
      assert.ok(released.every(s => Math.abs(s.cx - (box.x + box.width / 2)) < 0.02 && Math.abs(s.cy - (box.y + box.height / 2)) < 0.02))
      assert.ok(Math.abs(released.at(-1).width - box.width) < 0.02)
    }
  } finally {
    await context.close()
  }
})

test('anchored vendored and official triggers never move while pressed or released', async () => {
  const { context, page } = await open('buttons')
  try {
    for (const id of ['anchor', 'official-anchor']) {
      const box = await page.locator('#' + id).boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      const pressed = await frames(page, '#' + id, 8)
      await page.mouse.up()
      const released = await frames(page, '#' + id, 16)
      stableGeometry([...pressed, ...released])
      assert.ok([...pressed, ...released].every(s => s.transform === 'none'))
    }
  } finally {
    await context.close()
  }
})

test('real Tooltip fades without moving its positioned box and does not restart on ordinary rerender', async () => {
  const { context, page } = await open('tooltip')
  try {
    await page.locator('#tooltip-trigger').focus()
    await page.getByRole('tooltip').waitFor({ state: 'attached' })
    const samples = await frames(page, '[role=tooltip]', 12)
    stableGeometry(samples)
    monotonic(
      samples.map(s => s.opacity),
      1,
      'tooltip opacity',
    )
    assert.equal(samples.at(-1).opacity, 1)
    await page.getByRole('tooltip').evaluate(el => {
      window.originalTooltip = el
    })
    await page.evaluate(() => window.rerender())
    const after = await frames(page, '[role=tooltip]', 8)
    assert.equal(await page.getByRole('tooltip').evaluate(el => el === window.originalTooltip), true)
    assert.ok(
      after.every(s => s.opacity === 1),
      'rerender does not replay the fade',
    )
    stableGeometry([...samples, ...after])
  } finally {
    await context.close()
  }
})

test('actual Modal CSS fixture fades at a stable box; its mask fades and rerender preserves the settled surface', async () => {
  // Only the changed CSS is under test; interactions-modal exercises the existing modal focus lifecycle.
  const { context, page } = await open('modal')
  try {
    const keyframes = await page.locator('#modal').evaluate(el => el.getAnimations().flatMap(a => a.effect.getKeyframes()))
    assert.ok(keyframes.length > 0, 'the production modal animation runs')
    assert.ok(
      keyframes.every(f => !('transform' in f) && !('translate' in f) && !('scale' in f)),
      'opacity-only modal animation',
    )
    const samples = await frames(page, '#modal', 12)
    stableGeometry(samples)
    monotonic(
      samples.map(s => s.opacity),
      1,
      'modal opacity',
    )
    assert.equal(samples.at(-1).opacity, 1)
    assert.equal(await page.locator('#mask').evaluate(el => getComputedStyle(el, '::after').opacity), '1')
    await page.evaluate(() => window.rerender())
    const after = await frames(page, '#modal', 8)
    stableGeometry([...samples, ...after])
    assert.ok(after.every(s => s.opacity === 1))
  } finally {
    await context.close()
  }
})

test('official prompt card enters with constant dimensions, a one-way movement no larger than two pixels and no replay', async () => {
  const { context, page } = await open('prompt')
  try {
    const samples = await frames(page, '#prompt', 20)
    stableGeometry(samples, false)
    monotonic(
      samples.map(s => s.y),
      -1,
      'prompt entrance',
    )
    assert.ok(Math.max(...samples.map(s => s.y)) - Math.min(...samples.map(s => s.y)) <= 2.02)
    assert.ok(
      samples.every(s => s.transform === 'none' && s.opacity === 1),
      'no scale or fade',
    )
    await page.evaluate(() => window.rerender())
    const after = await frames(page, '#prompt', 8)
    stableGeometry([samples.at(-1), ...after])
  } finally {
    await context.close()
  }
})

test('reduced motion disables button shrink and tooltip, modal and official prompt entrances', async () => {
  const { context, page } = await open('buttons', 'reduce')
  try {
    for (const id of ['action', 'official', 'anchor', 'official-anchor']) {
      const box = await page.locator('#' + id).boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      const samples = await frames(page, '#' + id, 4)
      await page.mouse.up()
      assert.ok(
        samples.every(s => s.transform === 'none' && Math.abs(s.width - box.width) < 0.02),
        id + ' does not scale',
      )
      assert.equal(await page.locator('#' + id).evaluate(el => el.getAnimations().length), 0)
    }
    for (const [mode, selector] of [
      ['tooltip', '[role=tooltip]'],
      ['modal', '#modal'],
      ['prompt', '#prompt'],
    ]) {
      // A fresh document gives each surface its own initial keyboard modality.
      const surface = await open(mode, 'reduce')
      try {
        const page = surface.page
        if (mode === 'tooltip') await page.locator('#tooltip-trigger').focus()
        await page.locator(selector).waitFor({ state: 'attached' })
        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).animationName), 'none')
        const samples = await frames(page, selector, 4)
        stableGeometry(samples)
        assert.ok(samples.every(s => s.opacity === 1))
        if (mode === 'modal') assert.equal(await page.locator('#mask').evaluate(el => getComputedStyle(el, '::after').animationName), 'none')
      } finally {
        await surface.context.close()
      }
    }
  } finally {
    await context.close()
  }
})
