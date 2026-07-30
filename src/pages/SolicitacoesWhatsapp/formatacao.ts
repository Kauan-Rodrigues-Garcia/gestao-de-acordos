/**
 * formatacao.ts — helpers de exibição da aba de Solicitações de WhatsApp.
 *
 * Vivem fora dos arquivos de componente porque são usados por mais de um deles
 * (o chat e o card), e misturar export de função com export de componente
 * quebra o fast refresh do Vite.
 */

/** "Maria Aparecida da Silva" → "Maria". O chat trata as pessoas pelo 1º nome. */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'Usuário';
}

/** Iniciais para o avatar sem foto: "Ana Paula" → "AP". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}
