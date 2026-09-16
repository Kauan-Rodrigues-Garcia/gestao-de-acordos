/**
 * baixarAcumulado.ts — o clique de «Baixar acumulado por mês» do Relatório PaguePlay.
 *
 * A cada clique busca de novo as DUAS modalidades no banco, e não reaproveita o
 * que a tela tem: a tela carrega só a modalidade aberta, e o pedido é que o
 * arquivo saia sempre com os valores atualizados daquele momento. Uma prévia
 * local de arquivo não salvo nunca entra na planilha.
 *
 * Registra log pelo mesmo motivo do Fechamento: o faturamento da empresa por
 * estado sai do sistema e passa a circular.
 */
import { baixarArquivo, TIPO_XLSX } from '@/lib/baixarArquivo';
import { registrarLog } from '@/services/logs.service';
import { montarAcumuladoMensal } from './acumuladoMensal';
import { carregarResumo } from './service';
import type { ResumoSalvo } from './modelo';
import { montarPlanilhaAcumulado, PALETA_CONCILIACAO, PALETA_PAGAMENTO, type AbaAcumulado } from './planilhaAcumulado';

const FUSO = 'America/Sao_Paulo';
const dataHora = (d: Date) => {
  const data = d.toLocaleDateString('pt-BR', { timeZone: FUSO });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  return `${data} às ${hora}`;
};

function nota(resumo: ResumoSalvo, geradoEm: Date): string {
  const importacao = resumo.ultimaImportacao ? `última importação em ${dataHora(new Date(resumo.ultimaImportacao))}` : 'nenhuma importação salva';
  return `Gerado em ${dataHora(geradoEm)}  ·  ${importacao}  ·  mês pela coluna Data (competência)  ·  valores em R$`;
}

export function abasAcumulado(pagamento: ResumoSalvo, conciliacao: ResumoSalvo, geradoEm: Date): AbaAcumulado[] {
  return [
    {
      nome: 'Acumulado por mês',
      titulo: 'Acumulado por mês',
      subtitulo: 'PaguePlay  ·  Relatório de pagamento  ·  por estado (COREN)',
      nota: nota(pagamento, geradoEm),
      paleta: PALETA_PAGAMENTO,
      anos: montarAcumuladoMensal(pagamento.grupos),
    },
    {
      nome: 'Sem cartão de crédito',
      titulo: 'Acumulado por mês (sem cartão de crédito)',
      subtitulo: 'PaguePlay  ·  Relatório de conciliação  ·  por estado (COREN)',
      nota: nota(conciliacao, geradoEm),
      paleta: PALETA_CONCILIACAO,
      anos: montarAcumuladoMensal(conciliacao.grupos),
    },
  ];
}

export const nomeArquivoAcumulado = (hoje: string) => `pagueplay-acumulado-por-mes-${hoje}.xlsx`;

export async function baixarAcumuladoMensal(empresaId: string): Promise<void> {
  const [pagamento, conciliacao] = await Promise.all([
    carregarResumo(empresaId, 'pagamento'),
    carregarResumo(empresaId, 'conciliacao'),
  ]);
  const geradoEm = new Date();
  const abas = abasAcumulado(pagamento, conciliacao, geradoEm);
  const nome = nomeArquivoAcumulado(pagamento.hoje);
  baixarArquivo(montarPlanilhaAcumulado(abas, 'PaguePlay · Acumulado por mês', geradoEm), nome, TIPO_XLSX);

  const [abaPagamento, abaConciliacao] = abas;
  void registrarLog({
    acao: 'relatorio_pagueplay_acumulado_baixado',
    categoria: 'financeiro',
    descricao: 'Baixou o Acumulado por mês do Relatório PaguePlay em Excel (pagamento e conciliação)',
    empresaId,
    alvoTipo: 'relatorio_pagueplay',
    alvoRotulo: 'Acumulado por mês',
    detalhes: {
      arquivo: nome,
      anos_pagamento: abaPagamento.anos.map(a => a.ano),
      anos_conciliacao: abaConciliacao.anos.map(a => a.ano),
      total_pagamento_centavos: abaPagamento.anos.reduce((s, a) => s + a.total, 0),
      total_conciliacao_centavos: abaConciliacao.anos.reduce((s, a) => s + a.total, 0),
    },
  });
}
