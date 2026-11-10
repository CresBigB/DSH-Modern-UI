import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { artifactExposure, collectExposure, inspectRuntimeDependencies, resolvePackage } from '../../scripts/dependency-exposure.mjs'

describe('dependency exposure evidence', () => {
  test('does not attribute a patched root package to an affected nested package', () => {
    const root = path.resolve('fixture')
    const nested = 'node_modules/owner/node_modules/katex'
    const rootInput = 'node_modules/katex/dist/index.js'
    const nestedInput = `${nested}/dist/index.js`
    const siblingInput = `${nested}-extra/index.js`
    const data = {
      inputs: { [rootInput]: {}, [nestedInput]: {}, [siblingInput]: {} },
      outputs: { 'client.js': { inputs: { [rootInput]: { bytesInOutput: 100 }, [nestedInput]: { bytesInOutput: 0 }, [siblingInput]: { bytesInOutput: 15 } } } },
    }
    expect(artifactExposure(root, nested, [{ name: 'client', data }])).toEqual([
      { artifact: 'client', parsedInputs: [nestedInput], retainedOutputBytes: 0, parsedOnly: true },
    ])
    data.outputs['client.js'].inputs[nestedInput].bytesInOutput = 12
    expect(artifactExposure(root, nested, [{ name: 'client', data }])[0]).toMatchObject({ retainedOutputBytes: 12, parsedOnly: false })
  })

  test('resolves plugin and official transport from their own install locations despite hidden package exports', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dependency-exposure-'))
    const install = async (directory: string, name: string, version: string) => {
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version, exports: './index.js' }))
      await writeFile(path.join(directory, 'index.js'), '')
      return path.join(directory, 'package.json')
    }
    try {
      const plugin = await install(path.join(root, 'node_modules/plugin'), 'plugin', '1.0.0')
      const proxy = await install(path.join(root, 'node_modules/proxy'), 'proxy', '1.0.0')
      await install(path.join(root, 'node_modules/undici'), 'undici', '8.12.2')
      await install(path.join(root, 'node_modules/proxy/node_modules/undici'), 'undici', '8.11.2')
      expect(await resolvePackage(plugin, 'undici')).toMatchObject({ status: 'resolved', version: '8.12.2' })
      expect(await resolvePackage(proxy, 'undici')).toMatchObject({ status: 'resolved', version: '8.11.2' })
      expect(await resolvePackage(proxy, 'missing-exposure-fixture')).toMatchObject({ status: 'unknown' })
      const backend = await install(path.join(root, 'node_modules/@deepseek-ai/dsh'), '@deepseek-ai/dsh', '0.2.1-rc.4')
      const officialProxy = await install(path.join(root, 'node_modules/@deepseek-ai/dsh-http-proxy'), '@deepseek-ai/dsh-http-proxy', '0.2.1-rc.4')
      await writeFile(
        officialProxy,
        JSON.stringify({ name: '@deepseek-ai/dsh-http-proxy', version: '0.2.1-rc.4', exports: './index.js', dependencies: { undici: '8.11.2' } }),
      )
      await install(path.join(path.dirname(officialProxy), 'node_modules/undici'), 'undici', '8.11.2')
      await writeFile(plugin, JSON.stringify({ name: 'plugin', version: '1.0.0', dependencies: { undici: '8.12.2' } }))
      const runtime = await inspectRuntimeDependencies(plugin, backend)
      expect(runtime.plugin.find(item => item.name === 'undici')).toMatchObject({ version: '8.12.2', declared: true })
      expect(runtime.hostDependencies.find(item => item.owner.name === '@deepseek-ai/dsh-http-proxy')?.dependencies).toEqual([
        expect.objectContaining({ name: 'undici', version: '8.11.2', status: 'resolved' }),
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('requires explicit consumer paths without a development-root fallback', async () => {
    await expect(inspectRuntimeDependencies(undefined, undefined)).rejects.toThrow('Explicit pluginPackage and backendPackage paths are required')
    await expect(inspectRuntimeDependencies('plugin/package.json', '')).rejects.toThrow('Explicit pluginPackage and backendPackage paths are required')
  })

  test('fails the gate for retained affected input and undeclared host imports even when audit marks the package dev-only', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dependency-gate-'))
    const json = async (file: string, value: unknown) => {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(value))
    }
    try {
      const auditFile = path.join(root, 'audit.json')
      const affected = 'node_modules/owner/node_modules/affected'
      const input = `${affected}/index.js`
      await json(auditFile, {
        vulnerabilities: { affected: { dev: true, nodes: [affected], via: [{ url: 'https://example.test/GHSA-fixture', range: '<2.0.0' }] } },
      })
      await json(path.join(root, affected, 'package.json'), { name: 'affected', version: '1.0.0' })
      await json(path.join(root, 'packages/modern-ui/package.json'), { name: 'plugin', dependencies: {} })
      for (const name of ['client', 'host-main', 'host-compat']) {
        await json(path.join(root, '.artifacts/build-metafiles', `${name}.json`), {
          inputs: { [input]: {} },
          outputs: {
            'output.js': {
              inputs: { [input]: { bytesInOutput: name === 'client' ? 13 : 0 } },
              imports: name === 'host-compat' ? [{ path: 'undeclared-runtime', external: true }] : [],
            },
          },
        })
      }
      const report = await collectExposure({ root, auditFile })
      expect(report.gate.passed).toBe(false)
      expect(report.gate.vulnerableRetainedPaths).toEqual([{ advisory: 'GHSA-fixture', name: 'affected', path: affected, version: '1.0.0' }])
      expect(report.gate.missingRuntimeDeclarations).toEqual([{ artifact: 'host-compat', specifier: 'undeclared-runtime' }])
      expect(report.runtime.hostDependencies.every(item => item.owner.status === 'unknown')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
