/** Browser-local conversation geometry. A narrow pane never overwrites the preferred desktop width. */
export const LAYOUT_WIDTHS = { reading: 680, standard: 840, wide: 1040 } as const
export type ConversationLayoutMode = keyof typeof LAYOUT_WIDTHS | 'custom'
export interface ConversationLayoutPreference {
  mode: ConversationLayoutMode
  customWidth?: number
}
export const LAYOUT_STORAGE_KEY = 'modern-ui.conversation.layout.v1'
export const DEFAULT_LAYOUT: ConversationLayoutPreference = { mode: 'standard' }
export const MIN_LAYOUT_WIDTH = 480
export const MAX_LAYOUT_WIDTH = 1600

export function readLayoutPreference(raw: string | null): ConversationLayoutPreference {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw)
    if (
      value === null ||
      typeof value !== 'object' ||
      !('mode' in value) ||
      typeof value.mode !== 'string' ||
      (value.mode !== 'custom' && !Object.hasOwn(LAYOUT_WIDTHS, String(value.mode)))
    )
      return DEFAULT_LAYOUT
    const mode = value.mode as ConversationLayoutMode
    // Accept widths saved by the initial three-preset preview without losing the user's adjustment.
    const legacyWidth = 'width' in value ? value.width : undefined
    const width = 'customWidth' in value ? value.customWidth : legacyWidth
    return typeof width === 'number' && Number.isFinite(width)
      ? { mode: 'customWidth' in value ? mode : 'custom', customWidth: Math.round(Math.min(MAX_LAYOUT_WIDTH, Math.max(MIN_LAYOUT_WIDTH, width))) }
      : { mode }
  } catch {
    return DEFAULT_LAYOUT
  }
}

/** Available is the scrollport's inner width, after the transcript's two padding gutters. */
export function resolveLayoutWidth(preference: ConversationLayoutPreference, available: number): number {
  const preferred = preference.mode === 'custom' ? (preference.customWidth ?? LAYOUT_WIDTHS.standard) : LAYOUT_WIDTHS[preference.mode]
  return Math.max(0, Math.min(available, preferred))
}

/** Presets leave the last custom width intact; the first custom adjustment starts at the current preset. */
export function selectLayoutMode(current: ConversationLayoutPreference, mode: ConversationLayoutMode): ConversationLayoutPreference {
  return mode === 'custom'
    ? { mode, customWidth: current.customWidth ?? (current.mode === 'custom' ? LAYOUT_WIDTHS.standard : LAYOUT_WIDTHS[current.mode]) }
    : { ...current, mode }
}

export function draggedLayoutWidth(initial: number, delta: number, side: 'left' | 'right', available: number): number {
  const maximum = Math.min(MAX_LAYOUT_WIDTH, Math.max(0, available))
  return Math.round(Math.min(maximum, Math.max(Math.min(MIN_LAYOUT_WIDTH, maximum), initial + delta * (side === 'left' ? -2 : 2))))
}
