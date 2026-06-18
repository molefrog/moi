// Re-bind `globalThis.structuredClone` to the global object up front.
//
// Bun compiles `import { structuredClone } from '@tldraw/utils'; structuredClone(x)`
// into a namespace-member call — `utils.structuredClone(x)` — which invokes the
// native function with `this` set to the module namespace object. V8 brand-checks
// `structuredClone` against the global and throws "Illegal invocation", crashing
// tldraw on mount during its user-preferences init. tldraw captures
// `globalThis.structuredClone` once at module-eval time, so binding it here —
// imported before any tldraw module loads — makes the receiver irrelevant. Native
// structuredClone ignores `this` when called correctly, so this is transparent to
// every other caller.
if (typeof globalThis.structuredClone === 'function') {
  globalThis.structuredClone = globalThis.structuredClone.bind(globalThis)
}
