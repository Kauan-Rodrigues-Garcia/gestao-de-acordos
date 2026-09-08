export type EstadoMensagem = 'pendente' | 'erro' | 'enviada' | 'entregue' | 'lida';

export function estadoMensagem(
  criadoEm: string,
  entregaDoOutro: string | null,
  leituraDoOutro: string | null,
  estadoLocal?: 'pendente' | 'erro',
): EstadoMensagem {
  if (estadoLocal) return estadoLocal;
  if (leituraDoOutro && criadoEm <= leituraDoOutro) return 'lida';
  if (entregaDoOutro && criadoEm <= entregaDoOutro) return 'entregue';
  return 'enviada';
}
