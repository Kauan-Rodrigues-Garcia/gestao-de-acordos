/**
 * formaPagamento — rótulo e cor canônicos da forma de pagamento do analítico.
 *
 * Fonte única usada por todas as telas do Analítico (cards, barras, badges,
 * tabelas). BookPlay traz o nome real em `forma_detalhe` (Boleto, Pix, Pix
 * Automático, Cartão de Crédito, Cartão Recorrente…); PaguePlay só distingue
 * `boleto_pix` × `cartao`, caindo no rótulo binário canônico.
 *
 * Centralizar evita a divergência histórica ("Pix/Boleto" num lugar,
 * "Boleto/Pix" noutro) e mantém a cor da forma estável entre componentes.
 */

/** Rótulo canônico: usa `forma_detalhe` quando presente; senão o binário. */
export function rotuloFormaPagamento(
  formaPagamento: string | null | undefined,
  formaDetalhe?: string | null,
): string {
  const detalhe = formaDetalhe?.trim();
  if (detalhe) return detalhe;
  return formaPagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix';
}

/** Cor estável por forma — cards, barras e badges usam a mesma. */
export function corFormaPagamento(rotulo: string): string {
  const r = rotulo.toLowerCase();
  if (r.includes('autom')) return '#ef4444';                          // Pix Automático
  if (r.includes('pix'))   return '#f59e0b';                          // Pix / Boleto·Pix
  if (r.includes('cart'))  return r.includes('recorr') ? '#8b5cf6' : '#3b82f6'; // Cartão (recorrente/crédito)
  if (r.includes('recorr')) return '#64748b';                         // Recorrente
  if (r.includes('banc'))  return '#14b8a6';                          // Boleto Bancário
  if (r.includes('negoc') || r.includes('boleto')) return '#22c55e';  // Boleto Negociação / Boleto
  return '#6366f1';                                                   // fallback
}
