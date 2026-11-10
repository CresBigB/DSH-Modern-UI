import { useEffect } from 'react'
import type { ConversationSessionSlotProps } from '../contract/slots.ts'
import { resolveActiveView } from '../view-selection.ts'
import { blankConversation } from './session-phase.ts'
import { viewTabIds } from './view-tab-ids.ts'
import css from './ConversationRoot.module.css'

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft persisted while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function DefaultConversationViews({
  sessionId, view, useSession, useConversation, useConversationViews, inputActions, useStore, actions,
  renderSlot, bindDraftPersistence, openView, useInspectCall,
}: ConversationSessionSlotProps) {
  const tabs = useConversationViews(value => value)
  const inspectCall = useInspectCall(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const hasActiveTargets = useConversation(s => s.activeTargets.size > 0)
  const blank = useSession(s => blankConversation(s, hasActiveTargets))
  const viewRequest = useStore(s => s.viewRequest ?? null)

  useEffect(() => {
    const unbindDraftPersistence = bindDraftPersistence(actions.setDraft)
    inputActions.persistDraft()
    return () => { unbindDraftPersistence() }
    // The Session input owns content before this persistence writer is attached.
  }, [inputActions])

  if (blank) return null
  const viewId = view ?? active?.id
  return (
    <>
      {view === undefined && tabs.filter(tab => tab.id !== viewId).map(tab => (
        <div key={tab.id} id={viewTabIds(sessionId, tab.id).panel} role="tabpanel" aria-label={tab.label} hidden />
      ))}
      <div className={css.viewArea}
        id={view === undefined && viewId !== undefined ? viewTabIds(sessionId, viewId).panel : undefined}
        role="tabpanel"
        aria-labelledby={view === undefined && tabs.length > 1 && viewId !== undefined ? viewTabIds(sessionId, viewId).tab : undefined}
        aria-label={tabs.find(tab => tab.id === viewId)?.label ?? viewId}
        tabIndex={0}>
        {viewId !== undefined && renderSlot('conversation.view', {
          inspectCall,
          viewRequest,
          openView,
          completeViewRequest: actions.completeViewRequest,
        }, { only: viewId })}
      </div>
    </>
  )
}
