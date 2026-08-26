export type EstadoMensagem = 'enviada' | 'entregue' | 'lida';

export function estadoMensagem(
  criadoEm: string,
  entregaDoOutro: string | null,
  leituraDoOutro: string | null,
): EstadoMensagem {
  if (leituraDoOutro && criadoEm <= leituraDoOutro) return 'lida';
  if (entregaDoOutro && criadoEm <= entregaDoOutro) return 'entregue';
  return 'enviada';
}
