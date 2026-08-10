export type ChatAnnotationControls = {
  active: boolean
  starting: boolean
  onToggle: () => void
  onRemove: (localId: string) => void
}
