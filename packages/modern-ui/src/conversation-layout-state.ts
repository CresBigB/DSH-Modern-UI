/** Browser-local conversation geometry. A narrow pane never overwrites the preferred desktop width. */
export const LAYOUT_WIDTHS = { reading: 680, standard: 840, wide: 1040 } as const
export type ConversationLayoutMode = keyof typeof LAYOUT_WIDTHS
export interface ConversationLayoutPreference { mode: ConversationLayoutMode; width?: number }
export const LAYOUT_STORAGE_KEY = 'modern-ui.conversation.layout.v1'
export const DEFAULT_LAYOUT: ConversationLayoutPreference = { mode: 'standard' }
export const MIN_LAYOUT_WIDTH = 480
export const MAX_LAYOUT_WIDTH = 1600

export function readLayoutPreference(raw: string | null): ConversationLayoutPreference {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw)
    if (value === null || typeof value !== 'object' || !('mode' in value)
      || !Object.hasOwn(LAYOUT_WIDTHS, String(value.mode))) return DEFAULT_LAYOUT
    const mode = value.mode as ConversationLayoutMode
    const width = 'width' in value ? value.width : undefined
    return typeof width === 'number' && Number.isFinite(width)
      ? { mode, width: Math.round(Math.min(MAX_LAYOUT_WIDTH, Math.max(MIN_LAYOUT_WIDTH, width))) }
      : { mode }
  } catch { return DEFAULT_LAYOUT }
}

/** Available is the scrollport's inner width, after the transcript's two padding gutters. */
export function resolveLayoutWidth(preference: ConversationLayoutPreference, available: number): number {
  return Math.max(0, Math.min(available, preference.width ?? LAYOUT_WIDTHS[preference.mode]))
}

export function draggedLayoutWidth(initial: number, delta: number, side: 'left' | 'right', available: number): number {
  const maximum = Math.min(MAX_LAYOUT_WIDTH, Math.max(0, available))
  return Math.round(Math.min(maximum, Math.max(Math.min(MIN_LAYOUT_WIDTH, maximum), initial + delta * (side === 'left' ? -2 : 2))))
}
