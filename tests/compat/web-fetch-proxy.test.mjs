import { afterAll, beforeAll, test } from 'vitest'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'
import { HttpFetchProvider } from '../../packages/modern-ui/src/host-compat/web-fetch-http/index.mjs'

// A proxied request is resolved by the proxy, so the provider cannot check its addresses itself. Names that can only
// reach this machine or the local network are refused before anything is sent to a proxy that would reach them.
const limits = { maxResponseBytes: 65_536, maxBodyChars: 65_536, timeoutMs: 5_000, maxRedirects: 0, userAgent: 'modern-ui-test' }
let connections = 0
const sockets = new Set()
let proxy
let restore

beforeAll(async () => {
  proxy = createServer(socket => {
    connections += 1
    sockets.add(socket)
    socket.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n')
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  // The launcher passes its layered environment: name → the value and where it came from.
  const env = new Map([['http_proxy', { value: `http://127.0.0.1:${proxy.address().port}` }]])
  restore = await installProxyFromEnvironment(env, () => {})
})

afterAll(async () => {
  await restore?.()
  // The proxy agent keeps its connection alive; close it from this side so the server can stop.
  for (const socket of sockets) socket.destroy()
  await new Promise(resolve => proxy.close(resolve))
})

test('a proxied fetch refuses local names without contacting the proxy', async () => {
  const provider = new HttpFetchProvider(limits)
  for (const url of ['http://nas.local/', 'http://printer.home.arpa/', 'http://db.internal/', 'http://router/', 'http://nas.local./']) {
    await assert.rejects(provider.fetch({ url }), error => error.code === 'WEB_BLOCKED_URL', url)
  }
  assert.equal(connections, 0)
})

test('a proxied fetch of a public name still goes through the proxy', async () => {
  const provider = new HttpFetchProvider(limits)
  const before = connections
  await assert.rejects(provider.fetch({ url: 'http://example.com/' }), error => error.code !== 'WEB_BLOCKED_URL')
  assert.equal(connections, before + 1)
})
