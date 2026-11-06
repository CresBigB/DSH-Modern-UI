import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

// These manifests record the raw bytes of the files they list (no newline normalization), so an edit that does not
// refresh its targetSha256 leaves the record describing a file that no longer exists in this tree. The vendor marks
// manifest lists file names only and is not checked here.
const pkg = path.resolve(import.meta.dirname, '../../packages/modern-ui')
const hostCompat = path.join(pkg, 'src/host-compat')
const manifests = [
  { file: 'provenance.json', base: pkg },
  { file: 'openui-upstream.json', base: pkg },
  { file: 'src/host-compat/PROVENANCE.json', base: hostCompat },
]

type Entry = { readonly target: string; readonly targetSha256: string }

function* entries(node: unknown, at: string): Generator<{ at: string; entry: Entry }> {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) yield* entries(item, `${at}[${index}]`)
  } else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.target === 'string' && typeof record.targetSha256 === 'string') yield { at, entry: record as Entry }
    for (const [key, value] of Object.entries(record)) yield* entries(value, `${at}/${key}`)
  }
}

describe('provenance target digests', () => {
  for (const { file, base } of manifests) {
    const manifest = path.join(pkg, file)
    test.skipIf(!existsSync(manifest))(`${file} matches the files it lists`, () => {
      const stale: string[] = []
      let count = 0
      for (const { at, entry } of entries(JSON.parse(readFileSync(manifest, 'utf8')), '')) {
        count += 1
        // provenance.json#host mirrors src/host-compat/PROVENANCE.json, whose targets are relative to src/host-compat.
        const target = path.join(at.startsWith('/host/') ? hostCompat : base, entry.target)
        const digest = existsSync(target) ? createHash('sha256').update(readFileSync(target)).digest('hex') : 'missing'
        if (digest !== entry.targetSha256) stale.push(`${at} ${entry.target}: recorded ${entry.targetSha256.slice(0, 12)}, file ${digest.slice(0, 12)}`)
      }
      expect(count).toBeGreaterThan(0)
      expect(stale).toEqual([])
    })
  }
})
