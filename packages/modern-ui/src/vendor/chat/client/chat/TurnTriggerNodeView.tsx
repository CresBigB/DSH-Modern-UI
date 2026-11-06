/** A notice explaining a non-human Turn trigger, styled like the reasoning row it sits beside. */
import { useId, useMemo, useState, type ComponentType } from 'react'
import { DisclosureRow, IconAgentPresetOutlineRegular, IconBranchOutlineRegular, IconClockOutlineRegular, IconCodeOutlineRegular, IconContextInjectionOutlineRegular, IconCordisPluginOutlineRegular, IconGoalOutlineRegular, IconGlobeOutlineRegular, IconChevronUpOutlineRegular, IconQueueOutlineRegular, IconUsersOutlineRegular, IconWorkspaceTreeOutlineRegular } from '@iroha1145/dsh-modern-ui/primitives'
import { IconPaperPlaneOutlineRegular, type IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeViewProps } from '../contract/slots.ts'
import { formatMessageClock } from './message-chrome.ts'
import { NoticeBody } from './ContextBody.tsx'
import { turnTriggerDetails, type TurnTriggerIcon, type TurnTriggerLineage } from './turn-trigger.ts'
import css from './TurnTriggerNodeView.module.css'

const TRIGGER_ICONS: Record<TurnTriggerIcon, ComponentType<IconProps>> = {
  request: IconContextInjectionOutlineRegular,
  goal: IconGoalOutlineRegular,
  agent: IconPaperPlaneOutlineRegular,
  child: IconWorkspaceTreeOutlineRegular,
  parent: IconChevronUpOutlineRegular,
  team: IconUsersOutlineRegular,
  subagent: IconAgentPresetOutlineRegular,
  github: IconBranchOutlineRegular,
  webhook: IconGlobeOutlineRegular,
  schedule: IconClockOutlineRegular,
  command: IconCodeOutlineRegular,
  job: IconQueueOutlineRegular,
  plugin: IconCordisPluginOutlineRegular,
}

type TurnTriggerProps = Pick<ChatNodeViewProps<'turn-trigger'>, 'node' | 't' | 'sessionId' | 'useSessions'>

/** Render recorded trigger attribution above the whole-Turn disclosure. */
export function TurnTriggerNodeView({ node, t, sessionId, useSessions }: TurnTriggerProps) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  // Stable store references; the lineage is derived from them only when they change.
  const catalog = useSessions(state => state.projectionsBySession[sessionId]?.values.subagentCatalog)
  const byId = useSessions(state => state.byId)
  const lineage = useMemo<TurnTriggerLineage>(() => {
    const children = new Map<string, string | undefined>()
    for (const entry of catalog ?? []) children.set(entry.id, entry.label)
    // An unread parent catalog still leaves listed children, which carry their parent.
    for (const row of Object.values(byId)) {
      if (row.origin === 'subagent' && row.parentId === sessionId && !children.has(row.id)) children.set(row.id, undefined)
    }
    const self = byId[sessionId]
    return { children, parentId: self?.origin === 'subagent' ? self.parentId : undefined }
  }, [byId, catalog, sessionId])
  const details = turnTriggerDetails(node.data, lineage)
  const TriggerIcon = TRIGGER_ICONS[details.icon]
  const date = new Date(node.data.time)
  const time = formatMessageClock(node.data.time, t)
  return (
    <section className={css.root} data-turn-trigger data-trigger-icon={details.icon} data-expanded={open || undefined}>
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        icon={<TriggerIcon />}
        title={t(details.title)}
        open={open}
        expandable
        expandOnRowClick
        keepContentWhenOpen
        collapsedContent={details.detail !== undefined ? <span className={css.detail}>{details.detail}</span> : undefined}
        headerAccessory={<time className={css.time} dateTime={date.toISOString()}>{time}</time>}
        onToggle={() => { setOpen(!open) }}
      >
        <div id={bodyId} className={css.body}>
          <p className={css.explanation}>{t('message.trigger.explanation')}</p>
          <div className={css.content}><NoticeBody content={node.data.content} source={node.data.source} t={t} /></div>
        </div>
      </DisclosureRow>
    </section>
  )
}
