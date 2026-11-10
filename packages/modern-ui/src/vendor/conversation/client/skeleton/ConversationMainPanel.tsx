import type { ConversationSlotProps } from '../contract/slots.ts'
import { mainPanelPhase } from './session-phase.ts'
import css from './ConversationRoot.module.css'
import { ConversationWidthControls } from '../../../../conversation-layout.tsx'

const CONTENT_SLOTS = { widthControls: ConversationWidthControls }

/**
 * Render the existing main Conversation frame around the extracted content.
 * @param props - the original `main.conversation` Slot props.
 * @returns the root, Header, and responsive content without gutter overlays.
 */
export function ConversationMainPanel(props: ConversationSlotProps) {
  const { sessionId, useSession, useSessions, useConversation, renderSlot, renderFactorySlot } = props
  const hasActiveTargets = useConversation(s => s === undefined ? undefined : s.activeTargets.size > 0)
  const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)
  const phase = useSession(s => mainPanelPhase(sessionId, s, hasActiveTargets, summaryBlank))
    ?? (sessionId === undefined || summaryBlank === true ? 'hero' : 'active')
  const hero = phase === 'hero'

  return (
    <div className={css.root} data-phase={phase}>
      {renderSlot('conversation.header', {})}
      {renderFactorySlot('conversation.content', {
        variant: 'main',
        phase,
        hero,
      }, { slots: CONTENT_SLOTS })}
    </div>
  )
}
