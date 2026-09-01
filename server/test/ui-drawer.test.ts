import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'path'

import { buildApplet } from '../bundler/build-applet'
import { DRAWER_SOURCE } from '../ui-components'

// The drawer is the one moi-authored ui component: DRAWER_SOURCE never passes
// through the registry transform pipeline, so nothing checks it compiles until
// a workspace installs it. These tests are that check — the embedded source is
// written into a real `.moi/`-shaped fixture, bundled like a workspace widget,
// and typechecked against the actual @base-ui/react types.
//
// `utils.ts` is the registry's own cn (its ClassValue signature is what makes
// `cn(className)` accept Base UI's state-function classNames); `button.tsx` is
// a stub with the prop surface the drawer's close button uses.
const UTILS_SOURCE = `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`

const BUTTON_SOURCE = `import * as React from 'react'

type ButtonProps = React.ComponentProps<'button'> & {
  variant?: string
  size?: string
}

export function Button({ variant, size, ...props }: ButtonProps) {
  return <button {...props} />
}
`

// Exercises every exported part and both prop extensions (side, overlay,
// showCloseButton) plus the flipped-default root prop.
const WIDGET_SOURCE = `import * as React from 'react'

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerTitle,
  DrawerTrigger
} from '../ui/drawer'

export default function InspectorWidget() {
  const [selected, setSelected] = React.useState<string | null>(null)
  void DrawerOverlay
  return (
    <div className="h-full w-full p-4">
      <button onClick={() => setSelected('boldstart')}>Boldstart Ventures</button>
      <Drawer open={selected !== null} onOpenChange={open => !open && setSelected(null)}>
        <DrawerContent side="right" overlay>
          <DrawerHeader>
            <DrawerTitle>{selected}</DrawerTitle>
            <DrawerDescription>Fund · New York, NY</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <DrawerClose>Close</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <Drawer disablePointerDismissal={false}>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent side="bottom" showCloseButton={false} aria-label="Bottom drawer" />
      </Drawer>
    </div>
  )
}
`

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    lib: ['ESNext', 'DOM', 'DOM.Iterable']
  },
  include: ['ui', 'widgets']
})

// Inside the repo so imports resolve against the repo's node_modules — the
// same packages MOI_PACKAGE_JSON pre-seeds into workspaces.
let root: string

// The scoped stylesheet registered by the bundle's injectCss prologue (same
// extraction as build-applet.test.ts).
function injectedCss(js: string): string {
  const match = js.match(/^\(css => \{[\s\S]*?\}\)\((".*")\);/m)
  return match ? (JSON.parse(match[1]) as string) : ''
}

beforeAll(async () => {
  root = mkdtempSync(join(import.meta.dir, 'drawer-fixture-'))
  mkdirSync(join(root, 'ui'), { recursive: true })
  mkdirSync(join(root, 'widgets'), { recursive: true })
  await Promise.all([
    Bun.write(join(root, 'ui', 'utils.ts'), UTILS_SOURCE),
    Bun.write(join(root, 'ui', 'button.tsx'), BUTTON_SOURCE),
    Bun.write(join(root, 'ui', 'drawer.tsx'), DRAWER_SOURCE),
    Bun.write(join(root, 'widgets', 'inspector.tsx'), WIDGET_SOURCE),
    Bun.write(join(root, 'tsconfig.json'), TSCONFIG)
  ])
  // Same warmup as build-applet.test.ts: under `bun test` the first Bun.build
  // in a process with this option combo fails to resolve the entry; swallow
  // one throwaway build in case this file runs first.
  await buildApplet(join(root, 'widgets', 'inspector.tsx')).catch(() => {})
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('drawer ui component', () => {
  test('bundles as a workspace widget with scoped, applet-anchored styles', async () => {
    const result = await buildApplet(join(root, 'widgets', 'inspector.tsx'))
    const css = injectedCss(result.js)

    // The runtime mechanism: the drawer portals into the applet's own mount
    // container rather than document.body.
    expect(result.js).toContain('closest("[data-applet]")')

    // Tailwind emitted the drawer's classes (the ui/ dir is reached through
    // the module graph, not @source) and scoped them to the mount container.
    expect(css).toContain('[data-applet="widget:inspector"]')
    for (const probe of [
      'pointer-events-none',
      // Side geometry ships as plain classes (see drawerSideClasses).
      String.raw`w-3\/4`,
      String.raw`max-h-3\/4`,
      'inset-y-0',
      'data-ending-style',
      'data-starting-style'
    ]) {
      expect(css).toContain(probe)
    }

    // (No `position: fixed` absence check on the emitted CSS: Tailwind's
    // scanner also walks vendor sources in the module graph, where the bare
    // word `fixed` occurs — the DRAWER_SOURCE invariant below covers it.)
  }, 30_000)

  test('typechecks against the real @base-ui/react dialog API', () => {
    // Resolved through package.json (typescript does not export its bin
    // paths) and run under bun — same trick as SHADCN_VOCABULARY_PATHS.
    const tsc = join(
      dirname(Bun.resolveSync('typescript/package.json', import.meta.dir)),
      'bin',
      'tsc'
    )
    const proc = Bun.spawnSync(['bun', tsc, '-p', join(root, 'tsconfig.json')], {
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const output = proc.stdout.toString() + proc.stderr.toString()
    expect(output.trim()).toBe('')
    expect(proc.exitCode).toBe(0)
  }, 60_000)
})

describe('DRAWER_SOURCE invariants', () => {
  test('ships in final form — nothing for the transform pipeline to do', () => {
    // Relative sibling imports and Tabler icons only.
    expect(DRAWER_SOURCE).toContain(`from "./utils"`)
    expect(DRAWER_SOURCE).toContain(`from "./button"`)
    expect(DRAWER_SOURCE).toContain(`from "@tabler/icons-react"`)
    expect(DRAWER_SOURCE).not.toContain('@/registry')
    expect(DRAWER_SOURCE).not.toContain('IconPlaceholder')
    expect(DRAWER_SOURCE).not.toContain('lucide')
  })

  test('keeps the applet-scoped contract', () => {
    // Portals into the applet mount container — the portal codemod must never
    // rewrite this into an AppletPortal (planUiWrites marks it pretransformed).
    expect(DRAWER_SOURCE).toContain('<DrawerPrimitive.Portal')
    expect(DRAWER_SOURCE).toContain('container={container}')
    expect(DRAWER_SOURCE).not.toContain('AppletPortal')
    // Never modal: a modal dialog locks scroll and inerts the host app.
    expect(DRAWER_SOURCE).toContain('modal={false}')
    expect(DRAWER_SOURCE).toContain(`Omit<DrawerPrimitive.Root.Props, "modal">`)
    // Positions against the applet container, never the viewport.
    expect(DRAWER_SOURCE).not.toMatch(/\bfixed\b/)
  })
})
