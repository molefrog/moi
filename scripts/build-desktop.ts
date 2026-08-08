// Build the moi desktop app (Tauri v2 shell in desktop/).
//
// Orchestrates: standalone runtime tarball (unless one is already staged or
// passed via --runtime) → stage it as the Tauri resource → `tauri build`.
// The shell provisions ~/.moi from that tarball on first launch — see
// desktop/src-tauri/src/main.rs.
//
// Usage:
//   bun scripts/build-desktop.ts                    # full build, current platform
//   bun scripts/build-desktop.ts --runtime <tar.gz> # reuse an existing tarball
import { cp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'path'

import tailwind from 'bun-plugin-tailwind'

const ROOT = resolve(import.meta.dir, '..')
const DESKTOP = join(ROOT, 'desktop')
const RESOURCE = join(DESKTOP, 'src-tauri', 'resources', 'moi-runtime.tar.gz')
const BOOT_DIST = join(DESKTOP, 'dist')

const pkg = (await Bun.file(join(ROOT, 'package.json')).json()) as { version: string }

const runtimeFlag = process.argv.indexOf('--runtime')
let tarball: string
if (runtimeFlag !== -1) {
  tarball = resolve(process.argv[runtimeFlag + 1])
} else {
  const platform = `${process.platform}-${process.arch}`
  tarball = join(ROOT, 'dist-standalone', `moi-standalone-${pkg.version}-${platform}.tar.gz`)
  if (!(await Bun.file(tarball).exists())) {
    console.log('No runtime tarball found — building one first')
    await Bun.$`bun ${join(ROOT, 'scripts', 'build-standalone.ts')}`.cwd(ROOT)
  }
}

if (!(await Bun.file(tarball).exists())) {
  console.error(`Runtime tarball not found: ${tarball}`)
  process.exit(1)
}

// A manually supplied or stale runtime must not produce a desktop bundle whose
// advertised version differs from the payload it will provision on launch.
const payloadPackageText = await Bun.$`tar -xOzf ${tarball} moi-runtime/app/package.json`.text()
const payloadPackage = JSON.parse(payloadPackageText) as { version?: unknown }
if (payloadPackage.version !== pkg.version) {
  console.error(
    `Runtime payload version ${String(payloadPackage.version)} does not match package.json ${pkg.version}`
  )
  process.exit(1)
}

await mkdir(join(DESKTOP, 'src-tauri', 'resources'), { recursive: true })
await cp(tarball, RESOURCE)
console.log(`Staged runtime resource from ${tarball}`)

// Compile the pre-server boot page with the same Tailwind theme and favicon as
// the main client. Tauri receives plain static files and never maintains a
// separate desktop palette or type system.
await rm(BOOT_DIST, { recursive: true, force: true })
const boot = await Bun.build({
  entrypoints: [join(DESKTOP, 'ui', 'index.html')],
  outdir: BOOT_DIST,
  minify: true,
  sourcemap: 'none',
  plugins: [tailwind]
})
if (!boot.success) {
  console.error('Desktop boot page build failed:')
  for (const log of boot.logs) console.error('  ' + log.message)
  process.exit(1)
}
await Bun.write(join(BOOT_DIST, '.gitkeep'), '')
console.log(`Built desktop boot page → ${BOOT_DIST}`)

// tauri.conf.json reads its version directly from the root package.json, so
// main's existing package/tag version remains the only release version source.
await Bun.$`bunx --yes @tauri-apps/cli build`.cwd(DESKTOP)
