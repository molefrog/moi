import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'path'

import { buildApplet } from '../bundler/build-applet'
import { applyUiSourcePatches, transformUiComponentSource } from '../ui-components'

// The drawer is fetched from the shadcn registry like every other component,
// then patched at install to dock to the applet area (UI_SOURCE_PATCHES).
// Nothing upstream tests that combination, so these tests do: the pristine
// registry source goes through the real transform pipeline, and the patched
// output is bundled as a workspace widget and typechecked against the actual
// @base-ui/react types.
//
// `registry-drawer.tsx.txt` is a byte-exact snapshot of the upstream
// registry/base-nova/ui/drawer.tsx — the patch anchors must match it
// verbatim. When upstream drifts, `add` fails loudly at install; the fix is
// updating UI_SOURCE_PATCHES and this snapshot together. It lives next to
// this test, NOT in `__fixtures__`: that directory is the `@source` Tailwind
// scans for every fixture build, and the snapshot's class tokens would leak
// into unrelated fixtures' emitted CSS.
const REGISTRY_DRAWER = join(import.meta.dir, 'registry-drawer.tsx.txt')

// utils.ts as the registry ships it — its clsx ClassValue signature is what
// lets `cn(className)` accept Base UI's state-function classNames.
const UTILS_SOURCE = `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`

// Uses the patched drawer the way an applet would: a master-detail inspector
// docked right (swipeDirection decides the edge), plus a default bottom sheet
// with snap points and the swipe handle.
const WIDGET_SOURCE = `import * as React from 'react'

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '../ui/drawer'

export default function InspectorWidget() {
  const [selected, setSelected] = React.useState<string | null>(null)
  return (
    <div className="h-full w-full p-4">
      <button onClick={() => setSelected('boldstart')}>Boldstart Ventures</button>
      <Drawer
        swipeDirection="right"
        open={selected !== null}
        onOpenChange={open => !open && setSelected(null)}
      >
        <DrawerContent aria-label="Investor details">
          <DrawerHeader>
            <DrawerTitle>{selected}</DrawerTitle>
            <DrawerDescription>Fund · New York, NY</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <DrawerClose>Close</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <Drawer showSwipeHandle snapPoints={[0.5, 1]}>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent aria-label="Bottom drawer" />
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
let pristine: string
let patched: string

// The scoped stylesheet registered by the bundle's injectCss prologue (same
// extraction as build-applet.test.ts).
function injectedCss(js: string): string {
  const match = js.match(/^\(css => \{[\s\S]*?\}\)\((".*")\);/m)
  return match ? (JSON.parse(match[1]) as string) : ''
}

beforeAll(async () => {
  pristine = await Bun.file(REGISTRY_DRAWER).text()
  // The full install pipeline: moi patch + icon/menu transforms + import
  // rewrite + portal codemod — exactly what `add drawer` writes.
  patched = await transformUiComponentSource('drawer.tsx', pristine)

  root = mkdtempSync(join(import.meta.dir, 'drawer-fixture-'))
  mkdirSync(join(root, 'ui'), { recursive: true })
  mkdirSync(join(root, 'widgets'), { recursive: true })
  await Promise.all([
    Bun.write(join(root, 'ui', 'utils.ts'), UTILS_SOURCE),
    Bun.write(join(root, 'ui', 'drawer.tsx'), patched),
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

describe('drawer applet-scoping patch', () => {
  test('portals into the applet mount container instead of document.body', () => {
    expect(patched).toContain('closest("[data-applet]")')
    expect(patched).toContain('container={container}')
    // The aliased portal must slip past the portal codemod — an AppletPortal
    // wrapper would re-scope styles but lose the point of the container.
    expect(patched).toContain('<DrawerPortalPrimitive')
    expect(patched).not.toContain('AppletPortal')
  })

  test('positions against the applet area, not the page viewport', () => {
    // Every fixed surface (backdrop, viewport, popup) turned absolute, and
    // viewport units turned container-relative.
    expect(patched).not.toMatch(/\bfixed\b/)
    expect(patched).not.toContain('dvh')
    expect(patched).toContain('pointer-events-none absolute inset-0 z-50 overflow-hidden')
    expect(patched).toContain('--drawer-content-max-height:calc(100%-6rem)')
  })

  test('flips modality defaults but keeps them as props', () => {
    expect(patched).toContain('modal = false')
    expect(patched).toContain('disablePointerDismissal = true')
    expect(patched).toContain('disablePointerDismissal={disablePointerDismissal}')
  })

  test('keeps everything else upstream: gestures, snap points, transforms', () => {
    for (const upstream of [
      'DrawerSwipeHandle',
      'snapPoints={snapPoints}',
      '--drawer-swipe-progress',
      '--drawer-swipe-movement-x',
      'data-[swipe-direction=right]:right-0'
    ]) {
      expect(patched).toContain(upstream)
    }
    // And the standard pipeline still ran: relative imports, no aliases.
    expect(patched).toContain(`from "./utils"`)
    expect(patched).not.toContain('@/registry')
  })

  test('refuses to apply when the upstream source drifted', () => {
    const drifted = pristine.replace('modal = true', 'modal: modalProp = true')
    expect(() => applyUiSourcePatches('drawer.tsx', drifted)).toThrow(/applet-scoping patch/)
    // Unpatched files pass through untouched.
    expect(applyUiSourcePatches('button.tsx', 'const x = 1\n')).toBe('const x = 1\n')
  })
})

describe('patched drawer in an applet build', () => {
  test('bundles as a workspace widget with scoped, applet-anchored styles', async () => {
    const result = await buildApplet(join(root, 'widgets', 'inspector.tsx'))
    const css = injectedCss(result.js)

    expect(result.js).toContain('closest("[data-applet]")')

    // Tailwind emitted the drawer's classes (the ui/ dir is reached through
    // the module graph, not @source) and scoped them to the mount container.
    expect(css).toContain('[data-applet="widget:inspector"]')
    for (const probe of [
      'pointer-events-none',
      String.raw`data-\[swipe-direction\=right\]`,
      String.raw`data-\[swipe-axis\=x\]`,
      'data-ending-style',
      'data-starting-style',
      '--drawer-content-width'
    ]) {
      expect(css).toContain(probe)
    }
  }, 30_000)

  test('typechecks against the real @base-ui/react drawer API', () => {
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
