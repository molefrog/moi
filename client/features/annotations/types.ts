export type AnnotationPoint = {
  x: number
  y: number
}

export type AnnotationStroke = {
  points: AnnotationPoint[]
}

export type AnnotationHistory = {
  past: AnnotationStroke[][]
  present: AnnotationStroke[]
  future: AnnotationStroke[][]
}

// The editable part of an annotation draft. The screenshot is captured again
// when the layer opens, so composer state only needs the small vector document.
export type AnnotationDocument = {
  width: number
  height: number
  history: AnnotationHistory
}

export type ChatAnnotationControls = {
  active: boolean
  starting: boolean
  finish: () => void
  onToggle: () => void
  onRemove: (localId: string) => void
}
