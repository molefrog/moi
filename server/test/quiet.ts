import { afterEach, beforeEach, spyOn } from 'bun:test'

type ConsoleMethod = 'log' | 'warn' | 'error'

/**
 * Mute console output that the enclosing tests provoke on purpose — error
 * paths, bundler progress, third-party logging (tldraw prints its own
 * `console.error` before we turn a migration failure into a real message).
 * Unexpected output still prints, because only the named methods are muted.
 *
 * Registers hooks in the current scope, so call it at the top of a file or
 * inside the `describe` that needs it.
 */
export function silenceConsole(...methods: ConsoleMethod[]): void {
  const muted: ConsoleMethod[] = methods.length > 0 ? methods : ['log', 'warn', 'error']
  let spies: { mockRestore(): void }[] = []

  beforeEach(() => {
    spies = muted.map(method => spyOn(console, method).mockImplementation(() => {}))
  })

  afterEach(() => {
    for (const spy of spies) spy.mockRestore()
    spies = []
  })
}
