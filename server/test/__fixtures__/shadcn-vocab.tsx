// Exercises the shadcn styling vocabulary the synthetic Tailwind entry inlines
// from tw-animate-css and shadcn/tailwind.css — utility classes and variants
// installed ui components (.moi/ui/) rely on. Tailwind emits only what it can
// resolve, so if the inlining regresses these compile to nothing and this
// widget renders half-styled with no build error.
export default function ShadcnVocab() {
  return (
    <div className="scroll-fade overflow-y-auto">
      <div
        data-open
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-100 data-open:animate-in data-closed:animate-out"
      >
        enter
      </div>
      <div className="animate-accordion-down">accordion</div>
      <div className="bg-chart-1">chart</div>
    </div>
  )
}
