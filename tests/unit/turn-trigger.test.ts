import { describe, expect, test } from 'vitest'
import { shortSessionId, turnTriggerDetails, type TurnTriggerLineage } from '../../packages/modern-ui/src/vendor/chat/client/chat/turn-trigger.ts'

type Node = Parameters<typeof turnTriggerDetails>[0]
const node = (source: Record<string, unknown>, text = 'Body'): Node => ({ source, content: [{ type: 'text', text }], time: 0 }) as unknown as Node
const lineage: TurnTriggerLineage = {
  children: new Map([
    ['child-labelled', 'explore'],
    ['session-8f2c4d1e-aaaa', undefined],
  ]),
  parentId: 'parent-session',
}

describe('turn trigger attribution', () => {
  test('an agent message names who sent it within the family', () => {
    const relay = (sender: string, text = `Agent ${sender} sent a message: `) => node({ kind: 'agent-message', form: 'relay', senderSessionId: sender }, text)
    expect(turnTriggerDetails(relay('child-labelled'), lineage)).toEqual({ title: 'message.trigger.childReport', icon: 'child', detail: 'explore' })
    expect(turnTriggerDetails(relay('session-8f2c4d1e-aaaa'), lineage)).toEqual({ title: 'message.trigger.childReport', icon: 'child', detail: '8f2c4d1e' })
    expect(turnTriggerDetails(relay('parent-session'), lineage)).toEqual({ title: 'message.trigger.parent', icon: 'parent' })
    expect(turnTriggerDetails(relay('ef9e32c7-2e95-43ad'), lineage)).toEqual({ title: 'message.trigger.agent', icon: 'agent', detail: 'ef9e32c7' })
    // Without a loaded family the sender is still shown by id.
    expect(turnTriggerDetails(relay('ef9e32c7-2e95-43ad'))).toEqual({ title: 'message.trigger.agent', icon: 'agent', detail: 'ef9e32c7' })
  })

  test('an Agent Team relay is a team message naming the member', () => {
    const team = node({ kind: 'agent-message', form: 'relay', senderSessionId: 'child-labelled' }, 'Team message from reviewer:')
    expect(turnTriggerDetails(team, lineage)).toEqual({ title: 'message.trigger.team', icon: 'team', detail: 'reviewer' })
  })

  test('older relay kinds keep their direction', () => {
    expect(turnTriggerDetails(node({ kind: 'subagent-report', form: 'relay', senderSessionId: 'child-labelled' }), lineage)).toEqual({
      title: 'message.trigger.childReport',
      icon: 'child',
      detail: 'explore',
    })
    expect(turnTriggerDetails(node({ kind: 'coordinator', form: 'relay', senderSessionId: 'parent-session' }), lineage)).toEqual({
      title: 'message.trigger.parent',
      icon: 'parent',
    })
    expect(turnTriggerDetails(node({ kind: 'subagent-settled', form: 'notice', senderSessionId: 'session-427b1f5d-53e3' }))).toEqual({
      title: 'message.trigger.subagent',
      icon: 'subagent',
      detail: '427b1f5d',
    })
  })

  test('a background shell job is a command; other background jobs keep the generic title', () => {
    expect(turnTriggerDetails(node({ kind: 'tool-jobs', form: 'notice', summary: 'bash cd /work && npm test' }))).toEqual({
      title: 'message.trigger.command',
      icon: 'command',
      detail: 'cd /work && npm test',
    })
    const long = turnTriggerDetails(node({ kind: 'tool-jobs', form: 'notice', summary: `bash ${'x'.repeat(200)}` }))
    expect(long.detail).toHaveLength(60)
    expect(long.detail?.endsWith('…')).toBe(true)
    expect(turnTriggerDetails(node({ kind: 'tool-jobs', form: 'notice', summary: 'web_fetch https://example.com' }))).toEqual({
      title: 'message.trigger.job',
      icon: 'job',
      detail: 'web_fetch https://example.com',
    })
  })

  test('other sources keep their families and unknown ones stay unattributed', () => {
    expect(turnTriggerDetails(node({ kind: 'schedule' }))).toEqual({ title: 'message.trigger.schedule', icon: 'schedule' })
    expect(turnTriggerDetails(node({ kind: 'webhook', provider: 'github' }))).toEqual({ title: 'message.trigger.github', icon: 'github' })
    expect(turnTriggerDetails(node({ kind: 'plugin:custom' }))).toEqual({ title: 'message.trigger.request', icon: 'request' })
    expect(shortSessionId('session-7ba058ce-a9e0')).toBe('7ba058ce')
  })
})
