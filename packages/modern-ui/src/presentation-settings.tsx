/** Settings rows for the model-visible presentation and progressive-delivery prompts, and the live switches for the code-fence presenters. */
import type { Context } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CHAT_SETTINGS_NAMESPACE } from './vendor/chat/chat-settings.ts'
import { PreferenceRow } from './vendor/chat/client/settings/PreferenceRow.tsx'
import { PRESENTATION_LOCALE, presentationLocale, trackPresentation, type PresentationSettings } from './presentation-switches.ts'

/** Registration-side prompt switch. */
export interface PresentationRowInjected {
  hooks: {
    /** Whether the Host has the presentation prompt on, bound as usePrompt. */
    prompt: ObservableSnapshot<boolean>
    /** Whether the latest write failed, bound as useSaveFailed. */
    saveFailed: ObservableSnapshot<boolean>
  }
  /** Persist the prompt switch to the Modern UI entry config. */
  setPrompt: (enabled: boolean) => void
}

/** Full Settings-row props. */
export type PresentationRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<typeof PRESENTATION_LOCALE> & InjectFace<PresentationRowInjected>

/**
 * Render the presentation prompt switch; a failed write replaces the description with the failure.
 * @param props - Composed Settings slot props.
 * @returns The preference row.
 */
export function PresentationRow({ usePrompt, useSaveFailed, setPrompt, t }: PresentationRowProps) {
  const enabled = usePrompt(value => value)
  const saveFailed = useSaveFailed(value => value)
  return (
    <PreferenceRow
      title={t('settings.presentation.title')}
      description={t(saveFailed ? 'settings.presentation.saveFailed' : 'settings.presentation.description')}
      value={enabled ? 'on' : 'off'}
      selectedLabel={t(enabled ? 'settings.presentation.on' : 'settings.presentation.off')}
      options={[
        { id: 'off', label: t('settings.presentation.off') },
        { id: 'on', label: t('settings.presentation.on') },
      ]}
      onSelect={value => {
        setPrompt(value === 'on')
      }}
    />
  )
}

/** Registration-side progressive-delivery switch. */
export interface ProgressiveRowInjected {
  hooks: {
    /** Whether the Host has the progressive delivery guidance on, bound as useEnabled. */
    enabled: ObservableSnapshot<boolean>
    /** Whether the latest write failed, bound as useSaveFailed. */
    saveFailed: ObservableSnapshot<boolean>
  }
  /** Persist the progressive-delivery switch to the Modern UI entry config. */
  setEnabled: (enabled: boolean) => void
}

/** Full Settings-row props. */
export type ProgressiveRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<typeof PRESENTATION_LOCALE> & InjectFace<ProgressiveRowInjected>

/**
 * Render the progressive result delivery switch, independent of the components prompt.
 * @param props - Composed Settings slot props.
 * @returns The preference row.
 */
export function ProgressiveRow({ useEnabled, useSaveFailed, setEnabled, t }: ProgressiveRowProps) {
  const enabled = useEnabled(value => value)
  const saveFailed = useSaveFailed(value => value)
  return (
    <PreferenceRow
      title={t('settings.progressive.title')}
      description={t(saveFailed ? 'settings.presentation.saveFailed' : 'settings.progressive.description')}
      value={enabled ? 'on' : 'off'}
      selectedLabel={t(enabled ? 'settings.presentation.on' : 'settings.presentation.off')}
      options={[
        { id: 'off', label: t('settings.presentation.off') },
        { id: 'on', label: t('settings.presentation.on') },
      ]}
      onSelect={value => {
        setEnabled(value === 'on')
      }}
    />
  )
}

/**
 * Track the Host-backed switches and register the Settings rows.
 * @param ctx - client context with configForms, locale and slots.
 * @returns the live switches for the code-fence presenters.
 */
export function installPresentationSettings(ctx: Context): ObservableSnapshot<PresentationSettings> {
  const state = trackPresentation(ctx.configForms.get<{ presentation?: Partial<PresentationSettings> }>(CHAT_SETTINGS_NAMESPACE))
  ctx.effect(() => state.dispose)
  const prompt: ObservableSnapshot<boolean> = {
    getSnapshot: () => state.settings.getSnapshot().prompt,
    subscribe: listener => state.settings.subscribe(listener),
  }
  ctx.effect(() => ctx.locale.register(PRESENTATION_LOCALE, presentationLocale))
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'presentation-prompt',
        order: 18,
        locale: PRESENTATION_LOCALE,
        inject: (): PresentationRowInjected => ({ hooks: { prompt, saveFailed: state.saveFailed }, setPrompt: state.setPrompt }),
      },
      PresentationRow,
    ),
  )
  const progressive: ObservableSnapshot<boolean> = {
    getSnapshot: () => state.settings.getSnapshot().progressive,
    subscribe: listener => state.settings.subscribe(listener),
  }
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'progressive-results',
        // Above the components switch, so that switch and the Jev row under it stay together.
        order: 17.5,
        locale: PRESENTATION_LOCALE,
        inject: (): ProgressiveRowInjected => ({ hooks: { enabled: progressive, saveFailed: state.progressiveSaveFailed }, setEnabled: state.setProgressive }),
      },
      ProgressiveRow,
    ),
  )
  return state.settings
}
