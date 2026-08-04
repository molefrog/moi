// Build the standalone runtime tarball for the CURRENT platform:
//
//   moi-standalone-<version>-<platform>.tar.gz        (+ .sha256)
//   └── moi-runtime/
//       ├── bun            the exact bun running this script, pinned
//       └── app/           packed package + production node_modules
//
// The tree mirrors what `bun i -g moi-computer` produces, so every runtime
// path (agent SDK spawn, applet bundling with tailwind oxide, function
// workers, sharp) behaves identically to a normal install — nothing in
// server/ needs to know it's standalone. node_modules is platform-specific
// (sharp, oxide, the SDK's native CLI), so CI runs this once per target on a
// matching runner. Consumed by packaging/install.sh and `moi update`
// (server/standalone.ts).
//
// Usage: bun scripts/build-standalone.ts [--outdir dist-standalone]
import { cp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'path'

const ROOT = resolve(import.meta.dir, '..')
const outdirFlag = process.argv.indexOf('--outdir')
const OUT = resolve(ROOT, outdirFlag !== -1 ? process.argv[outdirFlag + 1] : 'dist-standalone')

const pkg = (await Bun.file(join(ROOT, 'package.json')).json()) as { version: string }
const platform = `${process.platform}-${process.arch}`
const name = `moi-standalone-${pkg.version}-${platform}`

const stage = join(OUT, '.stage')
const runtime = join(stage, 'moi-runtime')
const app = join(runtime, 'app')
await rm(stage, { recursive: true, force: true })
await mkdir(app, { recursive: true })

// `bun pm pack` runs prepack, which builds the client into dist/.
console.log(`Packing moi-computer ${pkg.version}`)
await Bun.$`bun pm pack --destination ${stage}`.cwd(ROOT).quiet()
await Bun.$`tar -xzf ${join(stage, `moi-computer-${pkg.version}.tgz`)} -C ${app} --strip-components=1`.quiet()

// Strip lifecycle scripts from the payload copy: `prepare` runs git config
// (fails outside a repo) and `prepack` would rebuild the client. The lockfile
// pins the exact dependency tree the repo tests against.
const appPkg = (await Bun.file(join(app, 'package.json')).json()) as Record<string, unknown>
delete appPkg.scripts
await Bun.write(join(app, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n')
await cp(join(ROOT, 'bun.lock'), join(app, 'bun.lock'))

console.log('Installing production dependencies')
await Bun.$`bun install --production --frozen-lockfile`.cwd(app).quiet()

// The bun executing this script becomes the payload's pinned runtime — build
// on the version you mean to ship (CI pins it via setup-bun).
await cp(process.execPath, join(runtime, 'bun'))
await Bun.$`chmod +x ${join(runtime, 'bun')}`.quiet()

console.log('Compressing')
const tarball = join(OUT, `${name}.tar.gz`)
await rm(tarball, { force: true })
await Bun.$`tar -czf ${tarball} -C ${stage} moi-runtime`.quiet()

const hasher = new Bun.CryptoHasher('sha256')
hasher.update(await Bun.file(tarball).arrayBuffer())
const sum = hasher.digest('hex')
await Bun.write(join(OUT, `${name}.tar.gz.sha256`), `${sum}  ${name}.tar.gz\n`)

await rm(stage, { recursive: true, force: true })

const size = (Bun.file(tarball).size / 1024 / 1024).toFixed(1)
console.log(`\n${name}.tar.gz  (${size} MB, bun ${Bun.version})`)
console.log(`sha256: ${sum}`)
