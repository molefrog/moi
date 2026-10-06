// Add a default here to register an experimental startup feature. The CLI and
// browser config both use these keys.
export const EXPERIMENTAL_DEFAULTS = {
  collab: false
} satisfies Record<string, false>

export type ExperimentalFeatures = { [Key in keyof typeof EXPERIMENTAL_DEFAULTS]: boolean }
export type ExperimentalFeature = keyof ExperimentalFeatures

export const EXPERIMENTAL_FEATURES = Object.keys(EXPERIMENTAL_DEFAULTS) as ExperimentalFeature[]

export function experimentalFlagName(feature: string): string {
  return `experimental-${feature.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`
}
