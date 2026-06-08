import type { BunPlugin } from 'bun'

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
        contents: `module.exports = globalThis.__esm["${args.path}"];`,
        loader: 'js'
      }
    })
  }
}

export default externalizeReact
