export type ChatAnnotationControls = {
  active: boolean
  starting: boolean
  onStart: () => void
  onRemove: (localId: string) => void
}
