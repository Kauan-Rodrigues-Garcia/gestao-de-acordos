/** O selo «Demonstração · nada é gravado» das telas da votação. */
export function SeloDemonstracao() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warning">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" aria-hidden="true" />
      Demonstração · nada é gravado
    </span>
  );
}
