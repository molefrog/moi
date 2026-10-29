import { describe, expect, test } from 'bun:test'
import { packageManager } from '../../package.json'
import { assertDevRuntime } from './dev-runtime'

describe('development runtime', () => {
  test('rejects the runtime with the broken QueryClient re-export and explains recovery', () => {
    expect(() => assertDevRuntime('1.3.10')).toThrow('QueryClient is not a constructor')
    expect(() => assertDevRuntime('1.3.10')).toThrow('bun upgrade --version')
    expect(() => assertDevRuntime('1.3.10')).toThrow('restart `bun run dev`')
  })

  test('accepts the CI runtime and newer stable runtimes', () => {
    expect(() => assertDevRuntime(packageManager.slice('bun@'.length))).not.toThrow()
    expect(() => assertDevRuntime('99.0.0')).not.toThrow()
  })
})
