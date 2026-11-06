/* The mark after the name: a small network, one input spreading to three and meeting in one
   lit output. Hollow rings, no crossing lines, so it stays legible at app-bar size. */
const HIDDEN = [8, 24, 40];

export function NameMark() {
  return <svg className="name-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    {HIDDEN.map((y) => <path key={y} d={`M4 24 L24 ${y} L44 24`} />)}
    <circle className="name-mark-node" cx="4" cy="24" r="4.4" />
    {HIDDEN.map((y) => <circle key={y} className="name-mark-node" cx="24" cy={y} r="4.4" />)}
    <circle className="name-mark-out" cx="44" cy="24" r="5" />
  </svg>;
}
