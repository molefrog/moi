import { toRichText } from '@tldraw/tlschema'

// Default props for every shape type the headless scratchpad writer creates
// (see scratchpad-executor.ts). Copied from each shape's `ShapeUtil.getDefaultProps()`
// in the `tldraw` package — which the server deliberately does not import, because
// its entry point drags in the React editor (see the executor's header comment).
// The values are static per tldraw version, and a test
// (`server/test/scratchpad-executor.test.ts`) asserts each entry still equals what
// the pinned `tldraw` returns, so a bump that changes a default fails loudly
// instead of writing records the browser would render differently.
export const SHAPE_DEFAULTS: Record<string, Record<string, unknown>> = {
  geo: {
    w: 100,
    h: 100,
    geo: 'rectangle',
    dash: 'draw',
    growY: 0,
    url: '',
    scale: 1,
    color: 'black',
    labelColor: 'black',
    fill: 'none',
    size: 'm',
    font: 'draw',
    align: 'middle',
    verticalAlign: 'middle',
    richText: toRichText('')
  },
  text: {
    color: 'black',
    size: 'm',
    w: 8,
    font: 'draw',
    textAlign: 'start',
    autoSize: true,
    scale: 1,
    richText: toRichText('')
  },
  note: {
    color: 'black',
    richText: toRichText(''),
    size: 'm',
    font: 'draw',
    align: 'middle',
    verticalAlign: 'middle',
    labelColor: 'black',
    growY: 0,
    fontSizeAdjustment: 1,
    url: '',
    scale: 1,
    textLastEditedBy: null
  },
  arrow: {
    kind: 'arc',
    elbowMidPoint: 0.5,
    dash: 'draw',
    size: 'm',
    fill: 'none',
    color: 'black',
    labelColor: 'black',
    bend: 0,
    start: { x: 0, y: 0 },
    end: { x: 2, y: 0 },
    arrowheadStart: 'none',
    arrowheadEnd: 'arrow',
    richText: toRichText(''),
    labelPosition: 0.5,
    font: 'draw',
    scale: 1
  },
  image: {
    w: 100,
    h: 100,
    assetId: null,
    playing: true,
    url: '',
    crop: null,
    flipX: false,
    flipY: false,
    altText: ''
  }
}
