/** Presentation of durable non-human messages claimed to begin a Turn. */
import type { ContextMessageNode } from '../contract/snapshot.ts'
import type { ChatKey } from '../locale.ts'

/** Existing primitive glyph selected for a Turn trigger's source family. */
export type TurnTriggerIcon =
  | 'agent' | 'child' | 'command' | 'github' | 'goal' | 'job' | 'parent' | 'plugin' | 'request' | 'schedule' | 'subagent' | 'team' | 'webhook'

/** The current Session's family as the Session list knows it: direct children by id, and the parent. */
export interface TurnTriggerLineage {
  /** Direct subagent children with their catalog label, when the parent catalog gave one. */
  readonly children: ReadonlyMap<string, string | undefined>
  /** The parent Session when the current Session is a subagent. */
  readonly parentId: string | undefined
}

const DETAIL_LIMIT = 60

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function field(source: Record<string, unknown>, key: string): string {
  return typeof source[key] === 'string' ? source[key] : ''
}

function firstText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const block = content.find(item => record(item).type === 'text')
  return field(record(block), 'text')
}

function clip(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > DETAIL_LIMIT ? `${line.slice(0, DETAIL_LIMIT - 1)}…` : line
}

/** A Session id as people see it in lists: the first eight characters after any `session-` prefix. */
export function shortSessionId(id: string): string {
  return id.replace(/^session-/, '').slice(0, 8)
}

/**
 * Describe a waking message using its recorded source and, for agent messages, the sender's place in the family.
 * @param node - durable context, including the original notification body.
 * @param lineage - the current Session's children and parent, when the Session list has them.
 * @returns localized title key, source-family icon, and a short detail naming the sender or command.
 */
export function turnTriggerDetails(node: ContextMessageNode, lineage?: TurnTriggerLineage): {
  title: ChatKey
  icon: TurnTriggerIcon
  detail?: string
} {
  const source = record(node.source)
  const kind = field(source, 'kind')
  const sender = field(source, 'senderSessionId')
  const childLabel = sender !== '' && lineage?.children.has(sender) === true
    ? lineage.children.get(sender) ?? shortSessionId(sender)
    : undefined
  switch (kind) {
    case 'goal':
      return { title: 'message.trigger.goal', icon: 'goal' }
    case 'agent-message': {
      // Agent Team relays use this kind too, with their own lead-in naming the member.
      const team = /^Team message from (.+?):\s*$/.exec(firstText(node.content).trim())
      if (team !== null) return { title: 'message.trigger.team', icon: 'team', detail: clip(team[1]!) }
      if (childLabel !== undefined) return { title: 'message.trigger.childReport', icon: 'child', detail: clip(childLabel) }
      if (sender !== '' && sender === lineage?.parentId) return { title: 'message.trigger.parent', icon: 'parent' }
      return { title: 'message.trigger.agent', icon: 'agent', ...sender !== '' ? { detail: shortSessionId(sender) } : {} }
    }
    case 'subagent-report':
      return { title: 'message.trigger.childReport', icon: 'child', ...sender !== '' ? { detail: clip(childLabel ?? shortSessionId(sender)) } : {} }
    case 'coordinator':
      return { title: 'message.trigger.parent', icon: 'parent' }
    case 'team-message':
      return { title: 'message.trigger.team', icon: 'team' }
    case 'subagent-settled':
      return { title: 'message.trigger.subagent', icon: 'subagent', ...sender !== '' ? { detail: clip(childLabel ?? shortSessionId(sender)) } : {} }
    case 'webhook': {
      const github = field(source, 'provider') === 'github'
      return { title: github ? 'message.trigger.github' : 'message.trigger.webhook', icon: github ? 'github' : 'webhook' }
    }
    case 'schedule':
      return { title: 'message.trigger.schedule', icon: 'schedule' }
    case 'tool-jobs': {
      // The summary leads with the tool that ran in the background; a shell job is a command the agent started.
      const summary = field(source, 'summary')
      const command = /^bash\s+(.+)$/s.exec(summary)
      return command !== null
        ? { title: 'message.trigger.command', icon: 'command', detail: clip(command[1]!) }
        : { title: 'message.trigger.job', icon: 'job', ...summary !== '' ? { detail: clip(summary) } : {} }
    }
    case 'cordis-host-runner':
      return { title: 'message.trigger.plugin', icon: 'plugin' }
    default:
      // Custom sources remain visible without attributing unrecorded identity or success.
      return { title: 'message.trigger.request', icon: 'request' }
  }
}
