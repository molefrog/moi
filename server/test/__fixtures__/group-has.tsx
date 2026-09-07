// Tailwind `group-has-*` / `peer-has-*` utilities, which compile to the
// `:is(…:has(…) *)` shape the Tailwind plugin rewrites (tailwind-plugin.ts).
// Built both as a widget (build-applet.test.ts) and through group-has.css.
export default function GroupHas() {
  return (
    <div className="group/input-group">
      <input />
      <span className="group-has-[>input]/input-group:pt-2 peer-has-checked:hidden">x</span>
    </div>
  )
}
