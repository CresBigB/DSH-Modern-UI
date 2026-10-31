import { describe, expect, test } from 'vitest'
import { DEFAULT_LAYOUT, draggedLayoutWidth, readLayoutPreference, resolveLayoutWidth } from '../../packages/modern-ui/src/conversation-layout-state.ts'

describe('conversation layout preferences', () => {
  test('invalid or older browser storage falls back without preventing the conversation from opening', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{"mode":"unknown"}', '{"mode":"__proto__"}']) expect(readLayoutPreference(raw)).toEqual(DEFAULT_LAYOUT)
    expect(readLayoutPreference('{"mode":"wide","width":"900"}')).toEqual({ mode: 'wide' })
    expect(readLayoutPreference('{"mode":"wide","width":1e300}')).toEqual({ mode: 'wide', width: 1600 })
  })

  test('shrinking a pane does not discard the preferred width when there is room again', () => {
    const preference = readLayoutPreference('{"mode":"wide","width":1200}')
    expect(resolveLayoutWidth(preference, 330)).toBe(330)
    expect(resolveLayoutWidth(preference, 1400)).toBe(1200)
    expect(preference.width).toBe(1200)
  })

  test('dragging either side expands about the same centered axis and stays inside the pane', () => {
    expect(draggedLayoutWidth(840, 60, 'right', 1300)).toBe(960)
    expect(draggedLayoutWidth(840, -60, 'left', 1300)).toBe(960)
    expect(draggedLayoutWidth(840, 500, 'right', 1100)).toBe(1100)
    expect(draggedLayoutWidth(840, -500, 'right', 1100)).toBe(480)
    expect(draggedLayoutWidth(840, 0, 'right', 280)).toBe(280)
  })
})
