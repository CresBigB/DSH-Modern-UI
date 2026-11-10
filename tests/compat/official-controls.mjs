import assert from 'node:assert/strict'
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
/** Check exact selectors against the consumer's actual official release, without a test runner. */
export async function runOfficialControlsChecks(backendPackage, options = {}) {
  const driver = createRequire(path.join(process.env.COMPAT_TEST_DRIVER ?? root, 'package.json'))
  const ts = driver('typescript')
  const backend = realpathSync(backendPackage)
  const consumer = createRequire(backend)
  const version = JSON.parse(readFileSync(backend, 'utf8')).version
  const frontend = consumer.resolve('@deepseek-ai/dsh-web-frontend/package.json')
  assert.equal(JSON.parse(readFileSync(frontend, 'utf8')).version, version)
  const queue = [backend]
  const packages = new Map()
  while (queue.length) {
    const filename = realpathSync(queue.shift())
    if (packages.has(filename)) continue
    const metadata = JSON.parse(readFileSync(filename, 'utf8'))
    packages.set(filename, metadata)
    const local = createRequire(filename)
    for (const name of Object.keys(metadata.dependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/'))) {
      queue.push(local.resolve(name + '/package.json'))
    }
  }
  const files = []
  function collect(directory, owner) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) collect(filename, owner)
      else if (/\.(?:js|css)$/.test(entry.name)) files.push({ owner, filename, text: readFileSync(filename, 'utf8') })
    }
  }
  for (const [filename, metadata] of packages) {
    if (!/^@deepseek-ai\/dsh-(?:web-frontend|client)/.test(metadata.name)) continue
    const directory = path.dirname(filename)
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ['lib', 'dist'].includes(entry.name)) collect(path.join(directory, entry.name), metadata)
    }
  }
  const css = readFileSync(options.cssPath ?? path.join(root, 'packages/modern-ui/src/official-controls.css'), 'utf8')
  const selectors = [...css.matchAll(/body\[data-modern-official-controls\]([^{}]+)\{/g)].map(match => match[1])
  const classes = [...new Set(selectors.flatMap(selector => [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1])))].sort()
  const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  assert.equal(classes.length, 49, 'Review and document every change to the private selector contract')
  for (const name of classes) {
    const rule = new RegExp('\\.' + escapeRegex(name) + '(?![\\w-])')
    const mapping = new RegExp('(?:["\\\'][\\w$-]+["\\\']|[\\w$]+)\\s*[:=]\\s*["\\\']' + escapeRegex(name) + '["\\\']')
    const styles = files.filter(file => file.text.includes(name) && rule.test(file.text))
    const runtime = files.filter(file => file.filename.endsWith('.js') && file.text.includes(name) && mapping.test(file.text))
    assert.ok(styles.length, `${version}: missing official CSS class ${name}`)
    assert.ok(runtime.length, `${version}: missing published runtime mapping ${name}`)
    for (const file of [...styles, ...runtime]) assert.equal(file.owner.version, version, `${name}: mixed official package ${file.owner.name}`)
  }

  // Older hosts ship primitives inside the Web frontend rather than as a runtime dependency.
  // Inspect that release's actual built React calls for the selector-relevant DOM contract.
  let switches = 0
  let accountMenus = 0
  for (const file of files.filter(file => file.filename.endsWith('.js'))) {
    if (!file.text.includes('_switch_1ik0f_5') && !file.text.includes('yHnPSG_signedOutMenu')) continue
    const source = ts.createSourceFile(file.filename, file.text, ts.ScriptTarget.Latest, true)
    const properties = node => new Map(node.properties.filter(ts.isPropertyAssignment).map(property => [property.name.text, property.initializer]))
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.arguments.length >= 2 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === 'button' &&
        ts.isObjectLiteralExpression(node.arguments[1])
      ) {
        const props = properties(node.arguments[1])
        if (props.get('role')?.text === 'switch') {
          assert.ok(props.has('aria-checked') && props.has('aria-label') && props.has('disabled'), 'Switch state and naming attributes')
          assert.ok(/\.switch\b/.test(props.get('className')?.getText(source)), 'Switch class is applied to button')
          const child = props.get('children')
          assert.ok(child && ts.isCallExpression(child) && child.arguments[0]?.text === 'span', 'Switch thumb remains a direct span child')
          const thumb = properties(child.arguments[1]).get('className')
          assert.ok(thumb && /\.thumb\b/.test(thumb.getText(source)), 'Thumb class is applied to the direct span')
          switches++
        }
      }
      if (ts.isPropertyAssignment(node) && node.name.text === 'listClassName' && /\.signedOutMenu\b/.test(node.initializer.getText(source))) accountMenus++
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.ok(switches > 0, 'Published button switch structure must be present')
  assert.ok(accountMenus > 0, 'Published account Menu must apply signedOutMenu to its list')
  const published = files.map(file => file.text).join('\n')
  assert.ok(/signedOutMenu\[role=menu\]/.test(published))
  assert.ok(/signedOutMenu \[role=menuitem\]/.test(published))
  assert.ok(
    selectors.every(selector => !selector.includes('[class*=')),
    'No broad substring matching',
  )
  return { version, classes, structures: { switches, accountMenus } }
}
