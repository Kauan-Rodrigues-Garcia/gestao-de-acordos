/**
 * baixarCampeoes.ts — o botão «Baixar Excel» da Votação da Liderança
 * (11/11/2026). A planilha (`planilhaCampeoes`) carrega só no clique.
 */
import { baixarArquivo, TIPO_XLSX } from '@/lib/baixarArquivo';
import type { ApuracaoDaVotacao } from './banco';

export async function baixarCampeoes(retrato: ApuracaoDaVotacao): Promise<void> {
  const { dadosDaApuracao, montarPlanilhaCampeoes, nomeArquivoCampeoes } = await import('./planilhaCampeoes');
  const dados = dadosDaApuracao(retrato);
  baixarArquivo(montarPlanilhaCampeoes(dados), nomeArquivoCampeoes(dados), TIPO_XLSX);
}
