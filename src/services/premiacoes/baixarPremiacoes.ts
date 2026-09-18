/**
 * baixarPremiacoes.ts — o clique de «Baixar Excel» em Premiações e Comissões.
 *
 * A cola entre `planilhaPremiacoes` (o arquivo, puro) e o navegador. Registra
 * log pelo mesmo motivo do Fechamento: crachá, nome e valor a pagar de cada
 * pessoa saem do sistema e passam a circular.
 */
import { baixarArquivo, TIPO_XLSX } from '@/lib/baixarArquivo';
import { registrarLog } from '@/services/logs.service';
import {
  montarPlanilhaPremiacoes, nomeArquivoPremiacoes, rotuloPeriodo,
  type DadosPlanilhaPremiacoes,
} from './planilhaPremiacoes';

export async function baixarPremiacoes(
  dados: DadosPlanilhaPremiacoes,
  empresaId: string,
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const nome = nomeArquivoPremiacoes(dados);
    baixarArquivo(montarPlanilhaPremiacoes(dados), nome, TIPO_XLSX);

    const alvo = dados.setorNome ?? 'todos os setores';
    void registrarLog({
      acao: 'premiacoes_comissoes_baixado',
      categoria: 'financeiro',
      descricao: `Baixou Premiações e Comissões de ${rotuloPeriodo(dados.mes)} (${alvo}) em Excel`,
      empresaId,
      alvoTipo: 'premiacoes_comissoes',
      alvoRotulo: `${rotuloPeriodo(dados.mes)} — ${alvo}`,
      detalhes: {
        mes: dados.mes,
        setor: dados.setorNome,
        parcial: dados.parcial,
        pessoas_no_arquivo: dados.linhas.length,
        total_premiacao: dados.linhas.reduce((t, l) => t + (l.premiacao ?? 0), 0),
        total_comissao: dados.linhas.reduce((t, l) => t + (l.comissao ?? 0), 0),
        arquivo: nome,
      },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
