/**
 * O morcego do tema especial (Batman), no lugar dos ícones do lucide.
 *
 * Desenhado a partir do print que o Cleber mandou em 05/10/2026: asas largas
 * com as bordas de baixo recortadas, orelhas e ombros redondos. A cor vem de
 * `currentColor` (o tom da faixa, em `somAmbiente.css`).
 */
export function IconeBatman({ className }: { className?: string }) {
  return (
    <svg viewBox="0 -8 100 56" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M50 39.5 C48.5 36 46.5 33 44 31 C42 25 34 22 28 23.5 C25 19 19 18.5 13.5 21 C12 17 7 14 0 13
        C8 11.5 20 11 30 10.5 Q34 10 35.5 8.6 C36 4 40 4 42 7.6 Q44 8.5 45.8 6.5 L47 0.5 L48.6 6 L50 6
        L51.4 6 L53 0.5 L54.2 6.5 Q56 8.5 58 7.6 C60 4 64 4 64.5 8.6 Q66 10 70 10.5 C80 11 92 11.5 100 13
        C93 14 88 17 86.5 21 C81 18.5 75 19 72 23.5 C66 22 58 25 56 31 C53.5 33 51.5 36 50 39.5 Z" />
    </svg>
  );
}
