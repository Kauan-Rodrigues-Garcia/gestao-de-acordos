/**
 * baixarFechamentoOperadores.ts — o clique de «Baixar» da aba Fechamento.
 *
 * A cola entre `exportarFechamento` (o arquivo, puro) e o navegador. Registra log
 * de auditoria pelo mesmo motivo do relatório do Analítico: o arquivo sai do
 * sistema com nome, fechamento, meta e situação de cada operador, e passa a
 * circular. Saber quem baixou o quê e quando é o mínimo para responder por isso.
 *
 * Quem pode baixar é quem vê a aba (decisão de 14/09/2026): o arquivo não traz
 * nada além do que a tela já mostra a essa pessoa.
 */
import { baixarArquivo, TIPO_HTML, TIPO_XLSX } from '@/lib/baixarArquivo';
import { registrarLog } from '@/services/logs.service';
import {
  montarHtmlFechamentoOperadores, montarPlanilhaFechamento, nomeArquivoFechamentoOperadores,
  type DadosExportacaoFechamento,
} from './exportarFechamento';

export type FormatoFechamento = 'xlsx' | 'html';

export async function baixarFechamentoOperadores(
  dados: DadosExportacaoFechamento,
  formato: FormatoFechamento,
  empresaId: string,
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const nome = nomeArquivoFechamentoOperadores(dados, formato);
    if (formato === 'xlsx') {
      baixarArquivo(montarPlanilhaFechamento(dados), nome, TIPO_XLSX);
    } else {
      baixarArquivo(montarHtmlFechamentoOperadores(dados), nome, TIPO_HTML);
    }

    void registrarLog({
      acao: 'fechamento_operadores_baixado',
      categoria: 'financeiro',
      descricao: `Baixou o Fechamento de ${dados.mesRotulo} (${dados.setorNome ?? 'todos os setores'}) em ${formato === 'xlsx' ? 'Excel' : 'HTML'}`,
      empresaId,
      alvoTipo: 'fechamento_operadores',
      alvoRotulo: `${dados.mesRotulo} — ${dados.setorNome ?? 'Todos os setores'}`,
      detalhes: {
        mes: dados.mes,
        setor: dados.setorNome,
        formato,
        parcial: dados.parcial,
        operadores_no_arquivo: dados.linhas.length,
        faturamento_total: dados.resumo.faturamentoTotal,
        arquivo: nome,
      },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
