export type ChatAnnotationControls = {
  active: boolean
  finish: () => void
  onToggle: () => void
  onRemove: (localId: string) => void
}
