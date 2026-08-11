const MAX_CAPTURE_EDGE = 1568
const ASSET_TIMEOUT_MS = 1_000
const CAPTURE_TIMEOUT_MS = 10_000

export function drawingCaptureScale(width: number, height: number, pixelRatio: number): number {
  const longEdge = Math.max(width, height)
  if (longEdge <= 0) return 1
  return Math.min(Math.max(pixelRatio, 1), MAX_CAPTURE_EDGE / longEdge)
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Annotation capture timed out')), ms)
  })
}

// Capture one visible DOM region into a canvas. This is deliberately unaware
// of workspaces, chat, and drawing so other flows can reuse it later.
export async function captureElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  const bounds = element.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Annotation target is not visible')
  }

  const { createContext, destroyContext, domToCanvas } = await import('modern-screenshot')
  const run = async () => {
    const context = await createContext(element, {
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      scale: drawingCaptureScale(bounds.width, bounds.height, window.devicePixelRatio),
      type: 'image/png',
      backgroundColor: getComputedStyle(element).backgroundColor,
      timeout: ASSET_TIMEOUT_MS,
      features: { restoreScrollPosition: true },
      style: { overflow: 'hidden' }
    })
    try {
      return await domToCanvas(context)
    } finally {
      destroyContext(context)
    }
  }

  return Promise.race([run(), rejectAfter(CAPTURE_TIMEOUT_MS)])
}
