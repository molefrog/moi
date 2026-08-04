// Regenerate native desktop icons from the main client's canonical app icon.
// The source is deliberately enlarged with nearest-neighbor sampling first so
// the founders' pixel-art treatment stays crisp in large OS icon slots.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import sharp from 'sharp'

const ROOT = resolve(import.meta.dir, '..')
const SOURCE = join(ROOT, 'client', 'assets', 'favicon.png')
const OUTPUT = join(ROOT, 'desktop', 'src-tauri', 'icons')
const temporary = await mkdtemp(join(tmpdir(), 'moi-desktop-icons-'))

try {
  const enlarged = join(temporary, 'favicon-1024.png')
  await sharp(SOURCE).resize(1024, 1024, { kernel: sharp.kernel.nearest }).png().toFile(enlarged)

  await rm(OUTPUT, { recursive: true, force: true })
  await Bun.$`bunx --yes @tauri-apps/cli icon ${enlarged} --output ${OUTPUT}`

  // The desktop shell currently ships only macOS and Linux bundles. Keep the
  // cross-platform desktop set while dropping mobile-only generated trees.
  await rm(join(OUTPUT, 'android'), { recursive: true, force: true })
  await rm(join(OUTPUT, 'ios'), { recursive: true, force: true })
  console.log(`Generated desktop icons → ${OUTPUT}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
