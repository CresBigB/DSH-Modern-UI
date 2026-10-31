import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { PreferenceRow } from './vendor/chat/client/settings/PreferenceRow.tsx'
import type { ConversationWidthControlsInputProps } from './vendor/conversation/client/contract/slots.ts'
import { DEFAULT_LAYOUT, LAYOUT_STORAGE_KEY, LAYOUT_WIDTHS, MAX_LAYOUT_WIDTH, MIN_LAYOUT_WIDTH, draggedLayoutWidth, readLayoutPreference, resolveLayoutWidth, type ConversationLayoutMode, type ConversationLayoutPreference } from './conversation-layout-state.ts'
import css from './conversation-layout.module.css'

export const layoutLabels = {
  zh: { label: '对话宽度', reading: '阅读', standard: '标准', wide: '宽屏', custom: '自定义', resize: '调整对话宽度', hint: '拖动两侧调宽；双击恢复当前档位。方向键微调，Home / End 到最小 / 最大宽度。' },
  en: { label: 'Chat width', reading: 'Reading', standard: 'Standard', wide: 'Wide', custom: 'Custom', resize: 'Resize conversation', hint: 'Drag either edge; double-click to restore the preset. Arrow keys adjust, Home / End select the minimum / maximum width.' },
  ja: { label: '会話の幅', reading: '読書', standard: '標準', wide: 'ワイド', custom: 'カスタム', resize: '会話の幅を調整', hint: '両端をドラッグ。ダブルクリックでプリセットに戻す。矢印キーで調整、Home / End で最小 / 最大。' },
  es: { label: 'Ancho del chat', reading: 'Lectura', standard: 'Estándar', wide: 'Amplio', custom: 'Personalizado', resize: 'Ajustar ancho de conversación', hint: 'Arrastra un borde; doble clic para restaurar. Flechas para ajustar, Home / End para mínimo / máximo.' },
  fr: { label: 'Largeur du chat', reading: 'Lecture', standard: 'Standard', wide: 'Large', custom: 'Personnalisé', resize: 'Redimensionner la conversation', hint: 'Faites glisser un bord ; double-clic pour rétablir. Flèches pour ajuster, Home / End pour minimum / maximum.' },
  de: { label: 'Chatbreite', reading: 'Lesen', standard: 'Standard', wide: 'Breit', custom: 'Angepasst', resize: 'Gesprächsbreite ändern', hint: 'Rand ziehen; Doppelklick setzt zurück. Pfeiltasten ändern die Breite, Home / End wählen Minimum / Maximum.' },
  ru: { label: 'Ширина чата', reading: 'Чтение', standard: 'Обычная', wide: 'Широкая', custom: 'Своя', resize: 'Изменить ширину диалога', hint: 'Перетащите край; двойной щелчок сбрасывает ширину. Стрелки изменяют ширину, Home / End — минимум / максимум.' },
  pt: { label: 'Largura do chat', reading: 'Leitura', standard: 'Padrão', wide: 'Amplo', custom: 'Personalizado', resize: 'Ajustar largura da conversa', hint: 'Arraste uma borda; clique duplo para restaurar. Setas ajustam, Home / End selecionam mínimo / máximo.' },
} as const
const language = createSnapshotStore<keyof typeof layoutLabels>('en')
const layoutDescriptions = {
  zh: '选择阅读、标准或宽屏，也可拖动对话两侧微调；仅保存在本机浏览器。',
  en: 'Choose Reading, Standard or Wide, or drag either conversation edge. Saved in this browser only.',
  ja: '読書・標準・ワイドを選択するか、会話の両端をドラッグして調整。このブラウザーにのみ保存されます。',
  es: 'Elige Lectura, Estándar o Amplio, o arrastra un borde. Se guarda solo en este navegador.',
  fr: 'Choisissez Lecture, Standard ou Large, ou faites glisser un bord. Enregistré uniquement dans ce navigateur.',
  de: 'Lesen, Standard oder Breit wählen oder einen Gesprächsrand ziehen. Nur in diesem Browser gespeichert.',
  ru: 'Выберите режим или перетащите край диалога. Настройка сохраняется только в этом браузере.',
  pt: 'Escolha Leitura, Padrão ou Amplo, ou arraste uma borda. Salvo apenas neste navegador.',
} as const
const preference = createSnapshotStore<ConversationLayoutPreference>(DEFAULT_LAYOUT)
let loaded = false

function loadPreference(): void {
  if (loaded) return
  loaded = true
  try { preference.set(readLayoutPreference(localStorage.getItem(LAYOUT_STORAGE_KEY))) } catch { /* Storage may be disabled. */ }
}

function savePreference(value: ConversationLayoutPreference, persist = true): void {
  preference.set(value)
  if (persist) try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(value)) } catch { /* Keep the current view usable without storage. */ }
}

function usePreference(): ConversationLayoutPreference {
  loadPreference()
  return useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
}

function useLabels() {
  return layoutLabels[useSyncExternalStore(language.subscribe, language.getSnapshot, language.getSnapshot)]
}

/** The General Settings row shares the existing preference control and the two drag handles' local state. */
export function ConversationLayoutSettings() {
  const current = usePreference()
  const labels = useLabels()
  const activeLanguage = useSyncExternalStore(language.subscribe, language.getSnapshot, language.getSnapshot)
  return <div data-conversation-layout-settings><PreferenceRow
    title={labels.label}
    description={layoutDescriptions[activeLanguage]}
    value={current.width === undefined ? current.mode : 'custom'}
    selectedLabel={current.width === undefined ? labels[current.mode] : `${labels.custom} · ${current.width}px`}
    options={Object.keys(LAYOUT_WIDTHS).map(id => ({ id, label: labels[id as ConversationLayoutMode] }))}
    onSelect={value => { savePreference({ mode: value as ConversationLayoutMode }) }}
  /></div>
}

/** A component in the public conversation Factory's widthControls slot; no Host mutation is involved. */
export function ConversationWidthControls({ container, phase }: ConversationWidthControlsInputProps) {
  const current = usePreference()
  const labels = useLabels()
  const [geometry, setGeometry] = useState({ available: 0, offset: 0 })
  const { available, offset } = geometry
  const actual = resolveLayoutWidth(current, available)
  const drag = useRef<{ x: number; initial: number; before: ConversationLayoutPreference; pointer: number } | null>(null)
  const pending = useRef<ConversationLayoutPreference | null>(null)
  const frame = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (container === null) return
    const scroll = container.querySelector<HTMLElement>(':scope > [data-conversation-scroll]') ?? container
    const measure = () => {
      // Match ChatView's padding: composer clearance + 16px on each edge. Measure the pane, not the window.
      const clearance = Number.parseFloat(getComputedStyle(container).getPropertyValue('--dsh-composer-side-clearance')) || 0
      const available = Math.max(0, scroll.clientWidth - 2 * (clearance + 16))
      const offset = scroll.getBoundingClientRect().left - container.getBoundingClientRect().left + scroll.clientWidth / 2 - container.clientWidth / 2
      setGeometry(previous => previous.available === available && previous.offset === offset ? previous : { available, offset })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroll)
    return () => { observer.disconnect() }
  }, [container])

  useLayoutEffect(() => {
    if (container === null || available === 0) return
    const names = ['--dsh-chat-content-width', '--dsh-composer-card-max-width', '--dsh-layout-center-offset'] as const
    const previous = names.map(name => [name, container.style.getPropertyValue(name), container.style.getPropertyPriority(name)] as const)
    for (const name of names) container.style.setProperty(name, `${name === '--dsh-layout-center-offset' ? offset : actual}px`)
    container.dataset.conversationLayout = current.mode
    return () => {
      for (const [name, value, priority] of previous) {
        if (value) container.style.setProperty(name, value, priority)
        else container.style.removeProperty(name)
      }
      delete container.dataset.conversationLayout
    }
  }, [container, actual, available, current.mode, offset])

  const clearFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }
  const finish = (cancel: boolean) => {
    const active = drag.current
    if (active === null) return
    clearFrame()
    drag.current = null
    savePreference(cancel ? active.before : pending.current ?? preference.getSnapshot())
    pending.current = null
    container?.removeAttribute('data-layout-dragging')
  }
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (drag.current !== null) savePreference(drag.current.before, false)
    container?.removeAttribute('data-layout-dragging')
  }, [container])

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, initial: actual, before: preference.getSnapshot(), pointer: event.pointerId }
    pending.current = null
    container?.setAttribute('data-layout-dragging', '')
  }
  const move = (event: PointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
    const active = drag.current
    if (active === null || active.pointer !== event.pointerId) return
    pending.current = { mode: active.before.mode, width: draggedLayoutWidth(active.initial, event.clientX - active.x, side, available) }
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      if (pending.current !== null) savePreference(pending.current, false)
    })
  }
  const key = (event: KeyboardEvent<HTMLDivElement>, side: 'left' | 'right') => {
    if (event.key === 'Escape') { finish(true); return }
    const step = event.shiftKey ? 40 : 8
    let width: number
    if (event.key === 'Home') width = Math.min(MIN_LAYOUT_WIDTH, available)
    else if (event.key === 'End') width = Math.min(MAX_LAYOUT_WIDTH, available)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      width = draggedLayoutWidth(actual, (event.key === 'ArrowLeft' ? -step : step) / 2, side, available)
    } else return
    event.preventDefault()
    savePreference({ mode: current.mode, width })
  }

  if (phase !== 'active' || actual === 0 || available < MIN_LAYOUT_WIDTH + 64) return null
  return <>{(['left', 'right'] as const).map(side => <div key={side} className={css.handle}
    data-conversation-width-handle={side} data-side={side} role="separator" tabIndex={0}
    aria-orientation="vertical" aria-label={labels.resize} aria-valuemin={MIN_LAYOUT_WIDTH}
    aria-valuemax={Math.min(MAX_LAYOUT_WIDTH, available)} aria-valuenow={Math.round(actual)} title={labels.hint}
    onPointerDown={start} onPointerMove={event => { move(event, side) }}
    onPointerUp={event => { move(event, side); finish(false) }} onPointerCancel={() => { finish(true) }}
    onLostPointerCapture={() => { finish(false) }} onKeyDown={event => { key(event, side) }}
    onWheel={event => {
      if (event.ctrlKey || event.deltaY === 0) return
      const scroll = container?.querySelector<HTMLElement>(':scope > [data-conversation-scroll]')
      if (scroll === null || scroll === undefined) return
      const unit = event.deltaMode === 1 ? Number.parseFloat(getComputedStyle(scroll).lineHeight) || 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
      scroll.scrollBy({ top: event.deltaY * unit })
    }}
    onDoubleClick={() => { savePreference({ mode: current.mode }) }}
  />)}</>
}

export function installConversationLayout(ctx: Context): void {
  ctx.effect(() => {
    const sync = () => {
      const active = ctx.locale.getLocale().active
      language.set(Object.hasOwn(layoutLabels, active) ? active as keyof typeof layoutLabels : 'en')
    }
    sync()
    const stop = ctx.locale.subscribe(sync)
    const onStorage = (event: StorageEvent) => {
      if (event.key === LAYOUT_STORAGE_KEY || event.key === null) preference.set(readLayoutPreference(event.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => { stop(); window.removeEventListener('storage', onStorage) }
  })
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'modern-conversation-layout', order: 15,
  }, ConversationLayoutSettings))
}
