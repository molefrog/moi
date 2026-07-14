import type { BunPlugin } from 'bun'

// Bun's Tailwind rebuild can re-emit these package entrypoints even when their
// source did not change. Without an HMR boundary the update reaches main.tsx,
// where TanStack's re-export graph may be observed halfway through replacement.
// Self-accepting the stable entrypoints keeps the existing QueryClient alive and
// lets the actual React component update stop at its Fast Refresh boundary.
const stableDependencyEntry =
  /[\\/]node_modules[\\/]@tanstack[\\/](?:react-query|query-core)[\\/]build[\\/]modern[\\/]index\.js$/

const acceptHmrDependencies: BunPlugin = {
  name: 'accept-hmr-dependencies',
  setup(build) {
    build.onLoad({ filter: stableDependencyEntry }, async args => ({
      contents:
        (await Bun.file(args.path).text()) + '\nif (import.meta.hot) import.meta.hot.accept();\n',
      loader: 'js'
    }))
  }
}

export default acceptHmrDependencies
