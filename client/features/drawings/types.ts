export type ChatAnnotationControls = {
  active: boolean
  finish: () => Promise<void>
  onToggle: () => void
  onRemove: (localId: string) => void
}
