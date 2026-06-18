export const config = { colSpan: 2, rowSpan: 1 }

// `tabular-nums` compiles to `font-variant-numeric` — a utility the sibling view
// does NOT use, so the mixed-build isolation test can tell the two bundles apart.
export default function WMix() {
  return <div className="tabular-nums" />
}
