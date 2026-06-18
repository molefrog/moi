export const config = { title: 'VMix' }

// `tracking-widest` compiles to `letter-spacing` — absent from the sibling
// widget, so each bundle is identifiable by its own utility.
export default function VMix() {
  return <div className="tracking-widest" />
}
