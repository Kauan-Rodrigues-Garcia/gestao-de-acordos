/**
 * As cores de Pago e do EXTRA no Natal (ver `PixNatal.tsx`): Pago dourado,
 * presente entregue, e EXTRA vermelho de fita de presente com fio dourado.
 */
export const corPixNatal = {
  /**
   * Selo «Pago» da tabela: dourado CHEIO. O «A pagar» já é âmbar claro, de
   * contorno — dourado claro também, os dois viravam o mesmo selo.
   */
  pagoSelo: 'bg-[#E8B93A] text-[#3D2A00] border-[#C99A1E] dark:bg-[#E8B93A] dark:text-[#2A1C00]',
  /** Botão «Pagar» da tabela. */
  pagar: 'text-amber-700 dark:text-amber-400 border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20',
  /** Etiqueta EXTRA: fita vermelha de presente com fio dourado. */
  extra: 'bg-[#C8102E] text-white ring-1 ring-amber-300/70 shadow-sm dark:bg-[#D7263D]',
  /** Texto do «Marcar como Extra» ligado. */
  extraTexto: 'text-[#C8102E] dark:text-[#FF5A6E]',
} as const;
