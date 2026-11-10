import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { harness, projectStreamingText, realSession, source, stable, t } from '../tests/audit/helpers/conversation-harness.mjs'

// Usage: node scripts/profile-conversation.mjs [baseline-ref] [output-directory]
// Development React/jsdom fixture; remote, selector bridge and UI slots are simplified.
const root = path.resolve(import.meta.dirname, '..')
const baselineRef = process.argv[2] ?? '5b1acbd'
const outputDirectory = path.resolve(root, process.argv[3] ?? '.artifacts/audit-20261110')
await mkdir(outputDirectory, { recursive: true })
const results = []
for (const kind of ['root', 'continuable-child'])
  for (const baseline of [true, false])
    for (let trial = 0; trial < 5; trial++) {
      const h = await harness(
        baseline
          ? {
              loadSource: file =>
                execFileSync('git', ['show', baselineRef + ':' + path.relative(root, file).replaceAll('\\', '/')], { cwd: root, encoding: 'utf8' }),
            }
          : {},
      )
      const session = await realSession()
      if (kind === 'continuable-child') session.configureSubagent({ mode: 'continuable', parentSessionId: 'parent', childSessionId: 'session' }, true)
      session.handleRunning(true)
      session.acceptEventChange({ type: 'assistant-stream', frame: { type: 'start', attemptId: 'attempt', startedAfterSeq: 0, turn: 1, step: 1 } })
      session.acceptEventChange({
        type: 'assistant-stream',
        frame: { type: 'chunk', attemptId: 'attempt', index: 0, time: 0, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
      })
      await Promise.resolve()
      const useSession = h.bind(session)
      const useConversation = h.bind(source({ activeTargets: new Set(['chat']) }))
      const full = { dock: 0, chain: 0, view: 0 }
      const snapshots = {}
      const props = { sessionId: 'session', useSession, useConversation, useSessions: stable({ byId: { session: { blank: false, cwd: '/work' } } }) }
      function ThirdPartyView() {
        snapshots.view = useSession(s => s)
        full.view++
        return h.React.createElement('div', { 'data-streamed-text': '' }, projectStreamingText(h, session).text)
      }
      const body = {
        ...props,
        useConversationViews: stable([{ id: 'chat', label: 'Chat' }]),
        useInspectCall: stable(undefined),
        useStore: stable({ view: 'chat' }),
        inputActions: { persistDraft() {} },
        actions: { setDraft() {}, completeViewRequest() {} },
        bindDraftPersistence: () => () => {},
        openView() {},
        renderSlot: () => h.React.createElement(ThirdPartyView),
      }
      function Views() {
        return h.React.createElement(h.DefaultConversationViews, body)
      }
      const content = {
        ...props,
        variant: 'main',
        phase: 'active',
        hero: false,
        useSessionStatus: stable(new Map()),
        useWorkspaces: stable({ phase: 'ready', items: [] }),
        useInput: stable({ draft: 'draft' }),
        useComposerBlock: stable(undefined),
        selectWorkspace() {},
        t,
        useFactorySlot: name => (name === 'views' ? Views : () => null),
        renderSlot: (name, zone) => {
          if (name === 'conversation.input.dock') {
            full.dock++
            snapshots.dock = zone.session
          }
          return null
        },
        renderSlotChain: (_name, owner, options) => {
          full.chain++
          snapshots.chain = owner.session
          return options.fallback
        },
      }
      const main = {
        ...props,
        renderSlot: () => h.React.createElement(h.ConversationHeader, { ...props, renderSlot: () => null }),
        renderFactorySlot: (_name, owner) => h.React.createElement(h.ConversationContent, { ...content, ...owner }),
      }
      const commits = []
      const reactRoot = h.createRoot(h.document.getElementById('root'))
      try {
        await h.act(async () =>
          reactRoot.render(
            h.React.createElement(
              h.Profiler,
              { id: 'shell-and-extensions', onRender: (_id, phase, actualDuration) => commits.push({ phase, actualDuration }) },
              h.React.createElement(h.ConversationMainPanel, main),
            ),
          ),
        )
        for (const key of Object.keys(h.renderCounts)) h.renderCounts[key] = 0
        for (const key of Object.keys(full)) full[key] = 0
        commits.length = 0
        for (let index = 1; index <= 100; index++) {
          await h.act(async () => {
            session.acceptEventChange({
              type: 'assistant-stream',
              frame: { type: 'chunk', attemptId: 'attempt', index, time: index, chunk: { type: 'text-delta', index: 0, text: 'token' } },
            })
            await Promise.resolve()
          })
          assert.equal(h.document.querySelector('[data-streamed-text]').textContent, 'token'.repeat(index))
          for (const snapshot of Object.values(snapshots)) assert.equal(snapshot, session.getSnapshot())
        }
        assert.equal(projectStreamingText(h, session).process.turn, 1)
        results.push({
          kind,
          baseline,
          trial,
          renders: { ...h.renderCounts },
          fullSnapshotConsumerRenders: { ...full },
          commits: commits.length,
          verifiedTextLength: h.document.querySelector('[data-streamed-text]').textContent.length,
          reactActualDurationMs: commits.reduce((sum, value) => sum + value.actualDuration, 0),
        })
      } finally {
        await h.act(async () => reactRoot.unmount())
        await h.close()
      }
    }
const evidence = {
  baseline: baselineRef,
  node: process.version,
  react: '18.3.1 development profiler',
  environment:
    'Windows jsdom; official rc.4 Session class; real Chat assistant and turn-process business projections over accepted event windows, reduced single running Turn/Step location wiring; mocked remote/notification adapter and renderer selector hook; simplified UI slots, no Markdown or real device',
  samples:
    '100 independent legal rc.4 text-delta microtask flushes after start and block-start; five trials per root/continuable-child and revision; every assembled text prefix and full consumer snapshot identity verified',
  fixtureRevision: 'rc4-legal-chunks-with-chat-projections; timings supersede the invalid-payload fixture and are not directly comparable',
  results,
}
await writeFile(path.join(outputDirectory, 'conversation-profile.json'), JSON.stringify(evidence, null, 2))
for (const kind of ['root', 'continuable-child'])
  for (const baseline of [true, false]) {
    const group = results.filter(value => value.kind === kind && value.baseline === baseline)
    const durations = group.map(value => value.reactActualDurationMs).sort((a, b) => a - b)
    console.log(
      JSON.stringify({
        kind,
        baseline,
        renders: group[0].renders,
        consumers: group[0].fullSnapshotConsumerRenders,
        commits: group[0].commits,
        medianReactActualDurationMs: durations[2],
        min: durations[0],
        max: durations[4],
      }),
    )
  }

// Each isolated React bundle owns a Scheduler channel; all artifacts and cleanups are complete.
process.exit(0)
