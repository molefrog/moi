// CLI face of `moi ui-components` (see server/ui-components.ts for the
// engine and docs/moi-shadcn.md for the spec). Three verbs:
//
//   moi ui-components                → the curated catalog + installed state
//   moi ui-components add <name…>    → fetch, transform, write to .moi/ui/
//   moi ui-components docs <name…>   → official docs as markdown, on stdout
//
// The command is deliberately not smart: add never rebuilds and never edits
// existing files, and installs dependencies only when asked to (--install) —
// otherwise it prints next steps and the agent owns them.
import { defineCommand } from 'citty'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, relative } from 'path'

import pc from './cli-pc'
import { resolveCwdWorkspace } from './cli-env'
import { MOI_PACKAGE_JSON } from './moi-scaffold'
import {
  UI_COMPONENTS,
  UI_COMPONENT_NAMES,
  UI_DOCS_BASE,
  fetchUiComponents,
  partitionUiWrites,
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
    },
    install: {
      type: 'boolean',
      default: false,
      description: 'Run `bun install` in .moi/ for the printed dependencies'
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

    // Hand-customized components are never silently overwritten: without
    // --force a requested file that already exists is skipped and reported, so
    // a bulk add still installs everything new. Only when every requested
    // component already exists does the add fail. Existing support files
    // (utils, applet-portal, registry deps that rode along) are kept as-is
    // either way, even under --force.
    const partition = partitionUiWrites(plans, args.force)
    if (partition.allInstalled) {
      console.error(
        '\n' +
          pc.red('✗') +
          ' Already installed: ' +
          partition.skipInstalled.map(plan => pc.bold(plan.name)).join(', ') +
          '\n' +
          pc.dim('  Files in .moi/ui/ may carry your customizations.\n') +
          pc.dim('  Re-run with --force to overwrite them.\n')
      )
      process.exit(1)
    }

    await mkdir(uiDir, { recursive: true })
    const written: string[] = []
    for (const plan of partition.write) {
      const content = plan.name.endsWith('.tsx')
        ? await transformUiComponentSource(plan.name, plan.content)
        : plan.content
      await Bun.write(plan.path, content)
      written.push(plan.name)
    }
    const kept = partition.keepSupport.map(plan => plan.name)
    const skipped = partition.skipInstalled.map(plan => plan.name)

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
    if (skipped.length > 0) {
      console.log(
        pc.dim(
          `  already installed, kept: ${skipped.join(', ')} — re-run with --force to overwrite`
        )
      )
    }
    const moiDir = join(entry.path, '.moi')
    let installNeeded = deps.length > 0
    if (args.install) {
      // `bun install` with no extra deps still materializes the pre-seeded
      // baseline, which older workspaces may be missing — always run it.
      const proc = Bun.spawnSync(['bun', 'install', ...deps], {
        cwd: moiDir,
        stdout: 'inherit',
        stderr: 'inherit'
      })
      if (proc.exitCode !== 0) {
        console.error(
          '\n' +
            pc.red('✗') +
            ` bun install failed in ${pc.bold('.moi/')} — install the dependencies yourself:\n` +
            pc.dim(`  bun install ${deps.join(' ')}\n`)
        )
        process.exit(1)
      }
      console.log(
        pc.green('✓') +
          ' Installed dependencies in ' +
          pc.bold('.moi/') +
          (deps.length > 0 ? pc.dim(` (${deps.join(', ')})`) : '')
      )
      installNeeded = false
    }

    console.log('\nNext steps (yours):')
    if (installNeeded) {
      // The command runs from anywhere inside the workspace (resolveCwdWorkspace),
      // so point the install at the real `.moi/` relative to the caller's cwd —
      // a literal `cd .moi` is wrong from `.moi/` itself or a widgets/ subdir.
      const rel = relative(process.cwd(), moiDir)
      const cdPrefix = rel === '' ? '' : `cd ${/\s/.test(rel) ? JSON.stringify(rel) : rel} && `
      console.log(
        '  1. Install dependencies: ' +
          pc.bold(`${cdPrefix}bun install ${deps.join(' ')}`) +
          pc.dim(' (or re-run add with --install)')
      )
      console.log('  2. Import relatively — ' + pc.bold(`import { … } from '../ui/<name>'`))
      console.log('  3. Rebuild: ' + pc.bold('moi bundle'))
    } else {
      console.log('  1. Import relatively — ' + pc.bold(`import { … } from '../ui/<name>'`))
      console.log('  2. Rebuild: ' + pc.bold('moi bundle'))
    }
    console.log(pc.dim(`\n  Component docs: moi ui-components docs ${request.entries.join(' ')}\n`))
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
      pc.bold('moi ui-components add <name…>') +
      pc.dim(' · docs: ') +
      pc.bold('moi ui-components docs <name…>') +
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

// Exported so cli.ts can keep a static command shell (name + description, all
// the root help needs) and pull this module in only when a subcommand actually
// runs — see the lazy `uiComponents` there.
export const uiComponentsSubCommands = { add, docs, list }

// The bare `moi ui-components` behavior, factored out of the command object so
// cli.ts can invoke it from a static shell without importing this module until
// the command actually runs.
export async function runUiComponentsCatalog(rawArgs: string[]): Promise<void> {
  // citty invokes the parent run even after dispatching a subcommand — only
  // render the catalog when no subcommand ran (same pattern as `moi env`).
  const first = rawArgs.find(a => !a.startsWith('-'))
  if (first && Object.hasOwn(uiComponentsSubCommands, first)) return
  const entry = await resolveCwdWorkspace()
  renderCatalog(uiDirFor(entry.path))
}
