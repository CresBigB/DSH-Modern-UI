import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

// All supported browsers implement WOFF2. Keep every face, but do not inline two unused fallback copies.
export function modernKatexFonts(css) {
  let faces = 0
  const result = css.replace(/@font-face\{[^}]+\}/g, face => {
    const source = face.match(/src:([^;}]+)/)
    const woff2 = source?.[1].split(',').find(value => /\.woff2\)\s*format\(["']woff2["']\)/.test(value))
    if (!source || !woff2) throw new Error('KaTeX font face has no WOFF2 source; review the font build policy')
    faces++
    return face.replace(source[0], `src:${woff2}`)
  })
  if (!faces) throw new Error('KaTeX stylesheet has no font faces; review the font build policy')
  return result
}

// Keep the entire nested node_modules path, since the last segment alone loses the resolved version.
export function logicalBuildInput(root, input) {
  const prefix = input.match(/^(?:owned-css|inline-css):/)?.[0] ?? ''
  const physical = path.resolve(root, input.slice(prefix.length)).replaceAll('\\', '/')
  const dependency = physical.indexOf('/node_modules/')
  return prefix + (dependency < 0 ? path.relative(root, physical).replaceAll('\\', '/') : physical.slice(dependency + 1))
}

export async function recordMetafile(root, name, metafile) {
  const directory = path.join(root, '.artifacts/build-metafiles')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, `${name}.json`), JSON.stringify(metafile, null, 2) + '\n')
}

export function checkClientBudget(bytes, budget) {
  const result = { bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9, mtime: 0 }).length }
  for (const key of ['bytes', 'gzipBytes']) {
    if (result[key] > budget[key]) throw new Error(`Client ${key} budget exceeded: ${result[key]} > ${budget[key]}; inspect build-metrics.json`)
  }
  return result
}

export async function recordClientMetrics(root, metafile) {
  const pkg = path.join(root, 'packages/modern-ui')
  const bytes = await readFile(path.join(pkg, 'lib/client.js'))
  const budget = JSON.parse(await readFile(path.join(root, 'scripts/client-budget.json'), 'utf8'))
  const contributions = new Map()
  const identities = new Map()
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      if (!bytesInOutput) continue
      const physical = path.resolve(root, input.replace(/^(?:owned-css|inline-css):/, ''))
      let directory = path.dirname(physical)
      let identity = identities.get(directory)
      if (!identity) {
        const start = directory
        while (directory !== path.dirname(directory)) {
          try {
            const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
            if (manifest.name && manifest.version) {
              identity = `${manifest.name}@${manifest.version}`
              break
            }
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
          directory = path.dirname(directory)
        }
        identity ??= 'project'
        identities.set(start, identity)
      }
      contributions.set(identity, (contributions.get(identity) ?? 0) + bytesInOutput)
    }
  }
  const metrics = {
    node: process.versions.node,
    compression: { format: 'gzip', level: 9, mtime: 0 },
    client: { bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9, mtime: 0 }).length },
    budget,
    contributors: [...contributions]
      .map(([packageVersion, bytesInOutput]) => ({ packageVersion, bytesInOutput }))
      .sort((a, b) => b.bytesInOutput - a.bytesInOutput),
  }
  await writeFile(path.join(pkg, 'lib/build-metrics.json'), JSON.stringify(metrics, null, 2) + '\n')
  console.log(`Client: ${metrics.client.bytes} bytes; gzip level 9: ${metrics.client.gzipBytes} bytes`)
  checkClientBudget(bytes, budget)
  return metrics
}
