/** Main header and body share IDs without coupling either component's lifetime. */
export function viewTabIds(sessionId: string, viewId: string) {
  const prefix = 'conversation-' + encodeURIComponent(JSON.stringify([sessionId, viewId]))
  return { tab: prefix + '-tab', panel: prefix + '-panel' }
}
