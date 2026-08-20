// CLI face of `moi ui-components` (see server/ui-components.ts for the
// engine and docs/moi-shadcn.md for the spec). Three verbs:
//
//   moi ui-components                → the curated catalog + installed state
//   moi ui-components add <name…>    → fetch, transform, write to .moi/ui/
//   moi ui-components docs <name…>   → official docs as markdown, on stdout
//
// The command is deliberately not smart: add never installs dependencies,
// never rebuilds, never edits existing files — it prints next steps and the
// agent owns them.
import { defineCommand } from 'citty'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'path'

import pc from './cli-pc'
import { resolveCwdWorkspace } from './cli-env'
import { MOI_PACKAGE_JSON } from './moi-scaffold'
import {
  UI_COMPONENTS,
  UI_COMPONENT_NAMES,
  UI_DOCS_BASE,
  fetchUiComponents,
  planUiWrites,
  resolveUiComponentRequest,
  suggestUiComponents,
  transformUiComponentSource
} from './ui-components'

function uiDirFor(workspacePath: string): string {
  return join(workspacePath, '.moi', 'ui')
}

function exitUnknownNames(unknown: string[]): never {
  for (const name of unknown) {
    const hints = suggestUiComponents(name)
    console.error(
      pc.red('✗') +
        ` "${name}" is not in the moi component set.` +
        (hints.length ? pc.dim(`  Did you mean: ${hints.join(', ')}?`) : '')
    )
  }
  console.error(pc.dim('\n  moi ui-components — the full catalog\n'))
  process.exit(1)
}

const add = defineCommand({
  meta: {
    name: 'add',
    description: 'Fetch components from the shadcn registry into .moi/ui/'
  },
  args: {
    name: {
      type: 'positional',
      required: true,
      description: 'Component names (see `moi ui-components`)'
    },
    force: {
      type: 'boolean',
      default: false,
      description: 'Overwrite existing files of the requested components'
    }
  },
  async run({ args }) {
    const request = resolveUiComponentRequest(args._)
    if (request.unknown.length > 0) exitUnknownNames(request.unknown)

    const entry = await resolveCwdWorkspace()
    const uiDir = uiDirFor(entry.path)

    let fetched
    try {
      fetched = await fetchUiComponents(request.registryItems)
    } catch (err) {
      console.error(
        '\n' +
          pc.red('✗') +
          ' Could not reach the shadcn registry (ui.shadcn.com). ' +
          'The command needs network access; offline use is not supported.\n' +
          pc.dim(`  ${(err as Error).message}\n`)
      )
      process.exit(1)
    }

    const plans = planUiWrites({
      files: fetched.files,
      requestedItems: request.registryItems,
      uiDir,
      exists: existsSync
    })

    // Hand-customized components are never silently overwritten: any requested
    // file that already exists fails the whole add unless --force. Existing
    // support files (utils, applet-portal, registry deps that rode along) are
    // kept as-is either way.
    const conflicts = plans.filter(plan => plan.exists && !plan.support)
    if (conflicts.length > 0 && !args.force) {
      console.error(
        '\n' +
          pc.red('✗') +
          ' Already installed: ' +
          conflicts.map(plan => pc.bold(plan.name)).join(', ') +
          '\n' +
          pc.dim('  Files in .moi/ui/ may carry your customizations.\n') +
          pc.dim('  Re-run with --force to overwrite them.\n')
      )
      process.exit(1)
    }

    await mkdir(uiDir, { recursive: true })
    const written: string[] = []
    const kept: string[] = []
    for (const plan of plans) {
      if (plan.exists && plan.support) {
        kept.push(plan.name)
        continue
      }
      const content = plan.name.endsWith('.tsx')
        ? await transformUiComponentSource(plan.name, plan.content)
        : plan.content
      await Bun.write(plan.path, content)
      written.push(plan.name)
    }

    // Deps the `moi init` scaffold already pre-seeds never need a mention;
    // registry specifiers may be versioned (`recharts@3.8.0`), so compare by
    // package name.
    const baseline = new Set(Object.keys(MOI_PACKAGE_JSON.dependencies))
    const deps = [...new Set([...fetched.dependencies, ...request.extraDeps])]
      .filter(spec => !baseline.has(spec.replace(/@[^@/]+$/, '')))
      .sort()

    console.log('\n' + pc.green('✓') + ' Added to ' + pc.bold('.moi/ui/') + ':')
    console.log(pc.dim('  ' + written.join(', ')))
    if (kept.length > 0) {
      console.log(pc.dim(`  kept existing: ${kept.join(', ')}`))
    }
    console.log('\nNext steps (yours):')
    if (deps.length > 0) {
      console.log(
        '  1. Install dependencies: ' + pc.bold(`cd .moi && bun install ${deps.join(' ')}`)
      )
      console.log('  2. Import relatively — ' + pc.bold(`import { … } from '../ui/<name>'`))
      console.log('  3. Rebuild: ' + pc.bold('moi bundle'))
    } else {
      console.log('  1. Import relatively — ' + pc.bold(`import { … } from '../ui/<name>'`))
      console.log('  2. Rebuild: ' + pc.bold('moi bundle'))
    }
    console.log(pc.dim(`\n  Component docs: moi ui-components docs ${request.entries[0]}\n`))
  }
})

const docs = defineCommand({
  meta: {
    name: 'docs',
    description: 'Print official component docs as markdown'
  },
  args: {
    name: {
      type: 'positional',
      required: true,
      description: 'Component names (see `moi ui-components`)'
    }
  },
  async run({ args }) {
    const request = resolveUiComponentRequest(args._)
    if (request.unknown.length > 0) exitUnknownNames(request.unknown)

    for (const name of request.entries) {
      const slug = UI_COMPONENTS[name].docsSlug ?? name
      const url = `${UI_DOCS_BASE}/${slug}.md`
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (request.entries.length > 1) console.log(`\n---\n# ${name}\n`)
        console.log(await res.text())
      } catch (err) {
        console.error(
          pc.red('✗') + ` Could not fetch docs for "${name}" (${url}): ${(err as Error).message}`
        )
        process.exitCode = 1
      }
    }
  }
})

function renderCatalog(uiDir: string, query?: string): void {
  const needle = query?.toLowerCase()
  const pad = Math.max(...UI_COMPONENT_NAMES.map(name => name.length)) + 2
  const rows: string[] = []
  for (const name of UI_COMPONENT_NAMES) {
    const entry = UI_COMPONENTS[name]
    if (needle && !name.includes(needle) && !entry.description.toLowerCase().includes(needle)) {
      continue
    }
    const installed = entry.registryItems.every(item => existsSync(join(uiDir, `${item}.tsx`)))
    rows.push(
      '  ' +
        (installed ? pc.green('✓ ') : '  ') +
        pc.cyan(name.padEnd(pad)) +
        pc.dim(entry.description)
    )
  }
  if (rows.length === 0) {
    console.log('\n' + pc.dim(`  Nothing matches "${query}".`) + '\n')
    return
  }
  console.log()
  console.log(rows.join('\n'))
  console.log(
    '\n' +
      pc.dim('  ✓ installed in .moi/ui/ · add: ') +
      pc.bold('moi ui-components add <name>') +
      pc.dim(' · docs: ') +
      pc.bold('moi ui-components docs <name>') +
      '\n'
  )
}

const list = defineCommand({
  meta: {
    name: 'list',
    description: 'The component catalog with installed state'
  },
  args: {
    q: {
      type: 'string',
      description: 'Filter by name or description'
    }
  },
  async run({ args }) {
    const entry = await resolveCwdWorkspace()
    renderCatalog(uiDirFor(entry.path), args.q)
  }
})

const uiComponentsSubCommands = { add, docs, list }

export const uiComponents = defineCommand({
  meta: {
    name: 'ui-components',
    description: 'Standard UI components for applets (curated shadcn set)'
  },
  subCommands: uiComponentsSubCommands,
  async run({ rawArgs }) {
    // citty invokes the parent run even after dispatching a subcommand — only
    // render the catalog when no subcommand ran (same pattern as `moi env`).
    const first = rawArgs.find(a => !a.startsWith('-'))
    if (first && Object.hasOwn(uiComponentsSubCommands, first)) return
    const entry = await resolveCwdWorkspace()
    renderCatalog(uiDirFor(entry.path))
  }
})
