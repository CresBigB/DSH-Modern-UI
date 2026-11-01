import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { hasOpenUIFence } from '../../../intelligent/client/openui-source.ts'
import { hasAssistantReplyContent } from './assistant-content.ts'

/** Current process range and finalized answer boundary derived from one Turn. */
export interface TurnProcessSpec {
  readonly turn: number
  /** Stable control-node anchor source, including currently ineligible evidence. */
  readonly controlAnchorSeq: number
  readonly processStartSeq: number
  readonly answerAnchorSeq: number | null
  readonly answerStep: number | null
  readonly inlineReasoning: boolean
  /** Reply-bearing durable Assistant messages outside the answer Steps. */
  readonly messageCount: number
  /** Durable non-subagent Tool calls recorded by this Turn. */
  readonly toolCallCount: number
  /** Tool calls whose configured name identifies a subagent delegation. */
  readonly subagentCount: number
}

/**
 * Compare immutable Turn-process specifications by their published fields.
 * @param left - previous specification.
 * @param right - next specification.
 * @returns whether both values describe the same process presentation.
 */
export function sameTurnProcessSpec(left: TurnProcessSpec, right: TurnProcessSpec): boolean {
  return left.turn === right.turn
    && left.controlAnchorSeq === right.controlAnchorSeq
    && left.processStartSeq === right.processStartSeq
    && left.answerAnchorSeq === right.answerAnchorSeq
    && left.answerStep === right.answerStep
    && left.inlineReasoning === right.inlineReasoning
    && left.messageCount === right.messageCount
    && left.toolCallCount === right.toolCallCount
    && left.subagentCount === right.subagentCount
}

/**
 * Whether a settled Step's reply ended a model response: reply content and no Tool call. A normal Turn has one, in
 * its last Step; input admitted afterwards, such as a finished subagent or a teammate message, opens further Steps.
 * @param blocks - the Step's settled Assistant blocks.
 * @returns whether the Step is a closing reply.
 */
export function isClosingReply(blocks: readonly AssistantBlock[]): boolean {
  return hasAssistantReplyContent(blocks) && !blocks.some(block => block.kind === 'tool-call')
}

/**
 * Whether a Step's reply carries rendered OpenUI components. A model asked to answer in stages writes a visualization,
 * then calls Tools before the next one, so the earlier segment shares its Step with a Tool call.
 * @param blocks - the Step's Assistant blocks.
 * @returns whether a text block holds a complete openui-lang fence.
 */
export function hasVisualReply(blocks: readonly AssistantBlock[]): boolean {
  return blocks.some(block => block.kind === 'text' && hasOpenUIFence(block.text))
}

/**
 * Whether Markdown text holds an ATX heading outside fenced code. Text the model writes between Tool calls never
 * opened a section in recorded sessions (progress notes and plans are plain sentences), while a delivered part of a
 * staged answer sits under a heading, possibly after one lead-in sentence. An unclosed fence is code to the end.
 * @param text - Assistant reply text.
 * @returns True when a heading line is present outside code.
 */
export function hasMarkdownSection(text: string): boolean {
  let fence: RegExp | null = null
  for (const line of text.split(/\r?\n/)) {
    if (fence !== null) {
      if (fence.test(line)) fence = null
      continue
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (open !== null) {
      fence = new RegExp(`^ {0,3}${open[1][0] === '`' ? '`' : '~'}{${open[1].length},}[ \\t]*$`)
      continue
    }
    if (/^ {0,3}#{1,6}[ \t]+\S/.test(line)) return true
  }
  return false
}

/**
 * Whether a Step's reply delivers a finished part of a staged answer: a section under a heading, written before the
 * Tool calls that gather the next part, so it shares its Step with them.
 * @param blocks - the Step's Assistant blocks.
 * @returns whether a text block holds a Markdown section.
 */
export function hasSectionReply(blocks: readonly AssistantBlock[]): boolean {
  return blocks.some(block => block.kind === 'text' && hasMarkdownSection(block.text))
}

/**
 * Whether a Step's reply is a delivered segment of the answer wherever it falls in the Turn: a visualization or a
 * section. Such a reply stays outside the folded process even when it shares its Step with Tool calls.
 * @param blocks - the Step's Assistant blocks.
 * @returns whether the reply delivers part of the answer.
 */
export function isAnswerSegment(blocks: readonly AssistantBlock[]): boolean {
  return hasVisualReply(blocks) || hasSectionReply(blocks)
}

/**
 * Whether an Assistant Step's reply belongs to the Turn's answer and stays outside the folded process: the answer
 * Step, a later closing reply, or any Step whose reply carries a visualization or a delivered section. Rows are
 * classified by Step, not anchor, because a streamed reply anchors at its first visible chunk, before its final
 * message.
 * @param spec - the Turn's process specification.
 * @param data - the Step's Assistant data.
 * @returns whether the Step's reply row is part of the answer.
 */
export function isAnswerStep(
  spec: Pick<TurnProcessSpec, 'answerStep'>,
  data: { readonly step: number; readonly blocks: readonly AssistantBlock[] },
): boolean {
  return spec.answerStep !== null
    && (data.step === spec.answerStep
      || (data.step > spec.answerStep && isClosingReply(data.blocks))
      || isAnswerSegment(data.blocks))
}

/**
 * Recognize the shipped subagent delegation name and its configured variants.
 * Control tools use distinct names such as `send_message` and `list_agents`.
 * @param name - durable Tool-call name.
 * @returns whether the call creates or forks a subagent.
 */
export function isSubagentDelegationTool(name: string): boolean {
  return name === 'subagent' || name.startsWith('subagent_')
}

/**
 * Keep live, stopped, and failed Turns open.
 * @param node - Node carrying the owning Turn.
 * @returns whether whole-Turn collapse is unavailable.
 */
export function turnProcessAlwaysOpen(node: ChatNode | undefined): boolean {
  const location = node?.location
  if (location?.kind !== 'turn' && location?.kind !== 'step') return false
  const reason = location.turn.end?.data.reason.kind
  return location.turn.status === 'open' || reason === 'aborted' || reason === 'interrupted' || reason === 'error'
}
