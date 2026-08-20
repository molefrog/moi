// Stands in for an installed ui component (`moi ui-components add` writes to
// `.moi/ui/`, a SIBLING of `widgets/`). Its classes appear nowhere in the
// widget source — they must reach the emitted CSS purely because this module
// is part of the bundle graph.
export function Panel() {
  return (
    <div className="bg-popover zoom-in-95 tracking-[0.137em]">
      <span className="slide-in-from-top-2">panel</span>
    </div>
  )
}
