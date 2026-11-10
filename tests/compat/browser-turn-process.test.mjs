import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { completedTurnProcess } from './browser.mjs'

test('answer-before-turn/end waits for its own completed process instead of collapsing a previous turn', async () => {
  const executablePath = process.env.MODERN_UI_BROWSER
  const browser = await chromium.launch(
    executablePath ? { executablePath, headless: true } : existsSync(chromium.executablePath()) ? { headless: true } : { channel: 'msedge', headless: true },
  )
  try {
    const page = await browser.newPage()
    await page.setContent(`
      <div data-compat-session-report>${JSON.stringify({
        navigation: [
          { prompt: '/plan on', turn: 1 },
          { prompt: 'COMPAT_FLOW', turn: 2 },
        ],
      })}</div>
      <button data-turn-process="1" data-process-outcome="completed" aria-expanded="true">Completed previous turn</button>
      <p>COMPAT_PLAIN_RESPONSE</p>
      <p>COMPAT_FIRST_ANSWER</p>
      <div data-compat-specific-tool="result">Actual tool result</div>
      <p id="progress">COMPAT_TOOL_PROGRESS</p>
      <p>COMPAT_LATER_ANSWER</p>
      <div id="flow-status">Running</div>
    `)
    await page.evaluate(() => {
      document.querySelector('[data-turn-process="1"]').onclick = event => event.currentTarget.setAttribute('aria-expanded', 'false')
      window.finishFlow = () => {
        const process = document.createElement('button')
        process.dataset.turnProcess = '2'
        process.dataset.processOutcome = 'completed'
        process.setAttribute('aria-expanded', 'true')
        process.textContent = 'Completed COMPAT_FLOW'
        process.onclick = () => {
          process.setAttribute('aria-expanded', 'false')
          requestAnimationFrame(() => {
            document.querySelector('[data-compat-specific-tool="result"]').hidden = true
            document.querySelector('#progress').hidden = true
          })
        }
        document.querySelector('#flow-status').replaceWith(process)
      }
    })
    // Reproduce the failed CI ordering: the final answer exists, but this turn has not ended.
    await page.getByText('COMPAT_LATER_ANSWER', { exact: true }).waitFor()
    const previousSelection = page.locator('[data-turn-process][data-process-outcome="completed"]').last()
    assert.equal(await previousSelection.getAttribute('data-turn-process'), '1')
    await previousSelection.click()
    assert.equal(await page.locator('[data-compat-specific-tool="result"]').isVisible(), true)

    let resolved = false
    const waiting = completedTurnProcess(page, 'COMPAT_FLOW').then(process => {
      resolved = true
      return process
    })
    await page.getByText('Running', { exact: true }).waitFor()
    assert.equal(resolved, false, 'The completed previous turn must not satisfy the flow wait')
    // Release turn/end independently of answer arrival, without relying on a fixed delay.
    await page.evaluate(() => window.finishFlow())
    const process = await waiting
    assert.equal(await process.getAttribute('data-turn-process'), '2')
    await process.click()
    await page.locator('[data-compat-specific-tool="result"]').waitFor({ state: 'hidden' })
    await page.getByText('COMPAT_TOOL_PROGRESS', { exact: true }).waitFor({ state: 'hidden' })
    assert.equal(await page.locator('[data-compat-specific-tool="result"]').isVisible(), false)
    assert.equal(await page.getByText('COMPAT_TOOL_PROGRESS', { exact: true }).isVisible(), false)
  } finally {
    await browser.close()
  }
})
