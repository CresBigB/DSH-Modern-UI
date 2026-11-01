import { test } from 'vitest'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import Agents from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Llm, { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { installJevTool, JEV_TOOL } from '../../packages/modern-ui/src/jev-tool.ts'

// The Jev tool against the official rc.4 agent runtime: a scripted model calls it inside a real turn, the
// registry scopes it to the main agent, and switch and key changes add or remove it between requests.

/** A model that plays back one scripted step per request and records what it was sent. */
class Scripted extends LlmAdapter {
  requests = []
  constructor(script) {
    super()
    this.script = script
  }
  async *stream(options) {
    this.requests.push(options)
    const next = this.script.shift() ?? { text: 'Done.' }
    if (next.call !== undefined) {
      const block = { type: 'tool-call', id: next.call.id, name: next.call.name, arguments: JSON.stringify(next.call.args) }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: next.text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: next.text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const names = tools => (tools ?? []).map(tool => tool.name)
const flush = () => new Promise(resolve => setTimeout(resolve, 20))
const say = text => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })

test('the Jev tool follows key and switches, stays out of subagents, and answers inside a real turn', async () => {
  const bodies = []
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      bodies.push({ authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ answers: { presentation: { type: 'choice', choice: 'table', confidence: 0.8, probabilities: { table: 0.8, text: 0.2 } } } }),
      )
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/systemone`

  const ctx = new Context()
  const state = { key: undefined, enabled: true, prompt: true }
  const handles = []
  try {
    for (const plugin of [Llm, SessionStore, Projections, Prompt, Tools, Agents]) await ctx.plugin(plugin).await()
    await ctx.plugin(AgentLoop, { agents: [] }).await()
    ctx.provide('credentials', { resolve: async () => (state.key === undefined ? undefined : { value: state.key, source: 'file' }) })
    const summary = 'Two caches to compare on latency, memory use and persistence; both report comparable numbers.'
    const model = new Scripted([{ call: { id: 'call-1', name: JEV_TOOL, args: { content_summary: summary } } }, { text: 'Here is the comparison.' }])
    ctx.llm.registerAdapter(['scripted'], model)
    const plugin = ctx.plugin({
      name: 'jev-probe',
      apply: pluginCtx =>
        installJevTool(
          pluginCtx,
          () => ({ enabled: state.enabled, credential: 'TYPESAFE_API_KEY', model: 'jev-latest', endpoint, timeout: 4000 }),
          () => state.prompt,
        ),
    })
    await plugin.await()
    // How the Loader announces a volatile config change: to the owning fiber only.
    const volatileUpdate = async (section = 'jev') => {
      const self = Object.create(plugin.ctx)
      self[Context.filter] = owner => owner.fiber === plugin.ctx.fiber
      plugin.ctx.emit(self, 'loader/volatile-update', [[section]])
      await flush()
    }

    const main = (await ctx.agents.create({ sessionId: 'main', agentOptions: { provider: 'scripted', model: 'm' } })).agent
    handles.push(main)
    await flush()
    assert.ok(!names(ctx.tools.schemas(main)).includes(JEV_TOOL), 'no key: no tool')

    state.key = 'test-key'
    ctx.emit('credentials/reference-updated', 'TYPESAFE_API_KEY')
    await flush()
    assert.ok(names(ctx.tools.schemas(main)).includes(JEV_TOOL), 'a saved key shows the tool')
    assert.ok(!names(ctx.tools.schemas()).includes(JEV_TOOL), 'never a global registration')

    const childHandle = await ctx.agents.create({
      sessionId: 'child',
      parentAgent: main,
      meta: { origin: 'subagent', parentSession: main.id, isSeeded: false, delegationDepth: 1 },
      agentOptions: { provider: 'scripted', model: 'm' },
    })
    await flush()
    assert.ok(!names(ctx.tools.schemas(childHandle.agent)).includes(JEV_TOOL), 'subagents never see the tool')
    await childHandle.dispose()
    // Creation awaits the registration, so a new main session lists the tool from its first request.
    const second = await ctx.agents.create({ sessionId: 'second', agentOptions: { provider: 'scripted', model: 'm' } })
    assert.ok(names(ctx.tools.schemas(second.agent)).includes(JEV_TOOL))
    await second.dispose()

    main.followup(say('compare redis and memcached'))
    await main.whenIdle()
    assert.equal(model.requests.length, 2)
    assert.ok(names(model.requests[0].tools).includes(JEV_TOOL))
    assert.equal(bodies.length, 1, 'one Jev request for the turn')
    assert.equal(bodies[0].authorization, 'Bearer test-key')
    assert.deepEqual(bodies[0].body.state.conversation, [
      { role: 'user', content: 'compare redis and memcached' },
      { role: 'assistant', content: `Structure of the planned answer: ${summary}` },
    ])
    const toolMessage = model.requests[1].messages.find(message => message.role === 'tool')
    const text = toolMessage.content.map(block => block.text).join('')
    assert.match(text, /^You could consider a table \(Table\) for the parts that compare items/)
    assert.doesNotMatch(text, /0\.8|confidence/i)
    const result = main.session.snapshotEvents().find(event => event.type === 'tool/result')
    assert.deepEqual(result.data.meta, { status: 'suggestion', presentation: 'table' })

    // Switching Jev off removes the tool before the next request, which the log records as a removal.
    state.enabled = false
    await volatileUpdate()
    assert.ok(!names(ctx.tools.schemas(main)).includes(JEV_TOOL))
    main.followup(say('thanks'))
    await main.whenIdle()
    assert.equal(model.requests.length, 3)
    assert.ok(!names(model.requests[2].tools).includes(JEV_TOOL))
    const removal = main.session
      .snapshotEvents()
      .filter(event => event.type === 'developer/message')
      .flatMap(event => event.data.message.content)
    assert.deepEqual(removal, [{ type: 'tool-removal', toolName: JEV_TOOL }])
    state.enabled = true
    await volatileUpdate()
    assert.ok(names(ctx.tools.schemas(main)).includes(JEV_TOOL))
    state.prompt = false
    await volatileUpdate('presentation')
    assert.ok(!names(ctx.tools.schemas(main)).includes(JEV_TOOL))
    assert.equal(bodies.length, 1)

    // Unloading the plugin takes every registration with it.
    state.prompt = true
    await volatileUpdate('presentation')
    assert.ok(names(ctx.tools.schemas(main)).includes(JEV_TOOL))
    await plugin.dispose()
    assert.ok(!names(ctx.tools.schemas(main)).includes(JEV_TOOL))
  } finally {
    await ctx.fiber.dispose()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})

/**
 * A PTC runtime that runs each program in-process: `code` names one of the test's functions, which receives the
 * real `tools` binding run_code builds, so every call goes through the Host's own PTC dispatch.
 */
class InlinePtc {
  language = 'typescript'
  isolation = 'in-process'
  programFormat = 'function-body'
  executionInstructions = ''
  sandboxMode = undefined
  timeout = undefined
  constructor(programs) {
    this.programs = programs
  }
  async release() {}
  resolve(request) {
    return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: null }
  }
  async run(spec) {
    const value = await this.programs[spec.program](spec.bindings[0].functions)
    return { logs: [], ...(value === undefined ? {} : { value }) }
  }
}

test('in PTC mode a program gets the advice without the confidence, and a call it leaves behind does not use up the turn', async () => {
  const bodies = []
  let hold = false
  let received
  const arrived = new Promise(resolve => {
    received = resolve
  })
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      // A held request is never answered: only the caller's cancellation ends it.
      if (hold) return received()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ answers: { presentation: { type: 'choice', choice: 'table', confidence: 0.8, probabilities: { table: 0.8, text: 0.2 } } } }),
      )
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/systemone`

  const summary = 'Two caches to compare on latency, memory use and persistence; both report comparable numbers.'
  const results = {}
  const programs = {
    ask: async tools => {
      results.ask = await tools[JEV_TOOL]({ content_summary: summary })
      return results.ask
    },
    // Starts the call, waits until Jev has the request, and ends without awaiting the answer.
    leave: async tools => {
      tools[JEV_TOOL]({ content_summary: summary }).catch(() => {})
      await arrived
      return 'left'
    },
    again: async tools => {
      results.again = await tools[JEV_TOOL]({ content_summary: summary })
      return results.again
    },
  }
  const run = (id, code) => ({ call: { id, name: 'run_code', args: { code, description: 'Ask Jev about the presentation' } } })
  const ctx = new Context()
  try {
    for (const plugin of [Llm, SessionStore, Projections, Prompt]) await ctx.plugin(plugin).await()
    await ctx.plugin(Tools, { mode: 'ptc' }).await()
    await ctx.plugin(Agents).await()
    await ctx.plugin(AgentLoop, { agents: [] }).await()
    ctx.provide('ptcRuntime', new InlinePtc(programs))
    ctx.provide('workingDirectory', { ensure: async () => process.cwd() })
    ctx.provide('credentials', { resolve: async () => ({ value: 'test-key', source: 'file' }) })
    const model = new Scripted([run('run-1', 'ask'), { text: 'Here is the comparison.' }, run('run-2', 'leave'), run('run-3', 'again'), { text: 'Done.' }])
    ctx.llm.registerAdapter(['scripted'], model)
    const plugin = ctx.plugin({
      name: 'jev-probe',
      apply: pluginCtx =>
        installJevTool(
          pluginCtx,
          () => ({ enabled: true, credential: 'TYPESAFE_API_KEY', model: 'jev-latest', endpoint, timeout: 4000 }),
          () => true,
        ),
    })
    await plugin.await()
    const main = (await ctx.agents.create({ sessionId: 'main', agentOptions: { provider: 'scripted', model: 'm' } })).agent

    main.followup(say('compare redis and memcached'))
    await main.whenIdle()
    assert.equal(model.requests.length, 2)
    // The model reaches the tool only from code, typed by the SDK the Host generates from the output schema.
    assert.deepEqual(names(model.requests[0].tools), ['run_code'])
    const [system] = model.requests[0].messages
    assert.equal(system.role, 'system')
    const outputs = system.content
      .map(block => block.text)
      .join('')
      .split('interface ToolOutputMap')[1]
    const declared = outputs.match(/jev_presentation_advice: \{[^}]*\}/)[0]
    assert.match(declared, /status: .*;\s+advice: string;\s+presentation\?: /)
    assert.doesNotMatch(declared, /confiden/i)
    // What the program received is the tool's whole value.
    assert.deepEqual(Object.keys(results.ask).sort(), ['advice', 'presentation', 'status'])
    assert.equal(results.ask.status, 'suggestion')
    assert.equal(results.ask.presentation, 'table')
    assert.match(results.ask.advice, /^You could consider a table \(Table\)/)
    // And what the next model request carries is the program's result, which repeats that value.
    const toolMessage = model.requests[1].messages.find(message => message.role === 'tool')
    const text = toolMessage.content.map(block => block.text).join('')
    assert.match(text, /You could consider a table/)
    assert.doesNotMatch(text, /0\.8|confidence/i)
    const dispatch = main.session.snapshotEvents().find(event => event.type === 'tool/ptc-dispatch')
    assert.deepEqual(dispatch.data.meta, { status: 'suggestion', presentation: 'table' })

    // A program that ends without awaiting its call cancels that request; the turn may still ask Jev.
    hold = true
    main.followup(say('now draw the request path'))
    const settled = main.whenIdle()
    await arrived
    hold = false
    await settled
    assert.equal(model.requests.length, 5)
    assert.equal(bodies.length, 3, 'the cancelled request and a new one in the same turn')
    assert.equal(results.again.status, 'suggestion')
    await plugin.dispose()
  } finally {
    await ctx.fiber.dispose()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
