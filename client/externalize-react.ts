import type { BunPlugin } from 'bun'

// React is not bundled into the app. Each of these specifiers is replaced with a
// read from `globalThis.__esm`, which the preload in index.html fills by
// importing them through the importmap (→ the locally-vendored ESM served at
// /vendor/react, see scripts/build-vendor.ts). This keeps ONE React instance
// shared between the host app and every applet/widget (which resolve the same
// importmap) — bundling React in would give each its own copy and break hooks.
const esmModules = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client'
]

const externalizeReact: BunPlugin = {
  name: 'externalize-react',
  setup(build) {
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, args => {
      if (esmModules.includes(args.path)) {
        return { path: args.path, namespace: 'esm' }
      }
    })

    build.onLoad({ filter: /.*/, namespace: 'esm' }, args => {
      return {
        contents:
          `module.exports = globalThis.__esm["${args.path}"];` +
          // Self-accept under HMR: the exports are identical on every
          // re-evaluation (a read of the same global), so a hot update must
          // stop here instead of propagating up to the entry and forcing a
          // full page reload. No-op outside the dev server.
          `if (import.meta.hot) import.meta.hot.accept();`,
        loader: 'js'
      }
    })
  }
}

export default externalizeReact
