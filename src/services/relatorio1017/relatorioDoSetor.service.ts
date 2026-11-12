/**
 * relatorioDoSetor.service.ts — relatório do ERP que só um setor usa (o 1017).
 *
 * Leitura do cadastro (`setor_relatorios`), do último lote do mês e a gravação
 * pela RPC `fn_relatorio_setor_importar` (migration 20261112150000). A RPC é a
 * única porta de escrita: confere quem importa (líder do próprio setor ou
 * super admin), o mês fechado e o que o 59 já conta, e troca o mês do setor
 * pelo arquivo numa transação só.
 *
 * O DINHEIRO não sai daqui: as telas o recebem por `fn_ajustes_recebimento`,
 * junto do ajuste de recebimento do setor. Aqui é só o card e o histórico.
 */

import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { ehCodigoRelatorioDoSetor, type CodigoRelatorioDoSetor } from '@/lib/relatoriosDoSetor';
import { invalidarSomasDeAjuste } from '@/services/analitico/ajusteManual.service';
import { esquecerMesAnalitico } from '@/services/analitico/analitico.service';
import type { Linha1017 } from './relatorio1017Parser';

export interface SetorComRelatorio {
  setorId: string;
  relatorio: CodigoRelatorioDoSetor;
}

export interface LoteDoRelatorio {
  id: string;
  linhas: number;
  valorTotal: number;
  ignoradas59: number;
  valorIgnorado59: number;
  primeiroPagamento: string | null;
  ultimoPagamento: string | null;
  arquivoNome: string | null;
  importadoEm: string;
  importadoPorNome: string | null;
}

export interface ResultadoImportacao {
  loteId: string;
  linhas: number;
  valor: number;
  ignoradas59: number;
  valorIgnorado59: number;
  valorAnterior: number;
}

/** Os setores da empresa que usam relatório próprio, com o cadastro ativo. */
export async function listarSetoresComRelatorio(empresaId: string): Promise<SetorComRelatorio[]> {
  const { data, error } = await tabelaSemTipo<{ setor_id: string; relatorio: string; ativo: boolean }>('setor_relatorios')
    .select('setor_id, relatorio, ativo')
    .eq('empresa_id', empresaId);
  // Banco sem a migration (deploy antes da aplicação): ninguém usa, e a tela segue.
  if (error || !data) return [];
  return data
    .filter(l => l.ativo && ehCodigoRelatorioDoSetor(l.relatorio))
    .map(l => ({ setorId: l.setor_id, relatorio: l.relatorio as CodigoRelatorioDoSetor }));
}

/** A última importação do mês daquele setor, ou `null` se nunca importou. */
export async function ultimoLoteDoMes(
  setorId: string, relatorio: CodigoRelatorioDoSetor, mes: string,
): Promise<LoteDoRelatorio | null> {
  const { data, error } = await tabelaSemTipo<Record<string, unknown>>('relatorio_setor_lotes')
    .select('id, linhas, valor_total, ignoradas_59, valor_ignorado_59, primeiro_pagamento, '
      + 'ultimo_pagamento, arquivo_nome, importado_em, perfis(nome)')
    .eq('setor_id', setorId)
    .eq('relatorio', relatorio)
    .eq('mes_referencia', `${mes.slice(0, 7)}-01`)
    .order('importado_em', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const l = data[0];
  const perfil = l.perfis as { nome?: string } | null;
  return {
    id:                String(l.id),
    linhas:            Number(l.linhas) || 0,
    valorTotal:        Number(l.valor_total) || 0,
    ignoradas59:       Number(l.ignoradas_59) || 0,
    valorIgnorado59:   Number(l.valor_ignorado_59) || 0,
    primeiroPagamento: (l.primeiro_pagamento as string | null) ?? null,
    ultimoPagamento:   (l.ultimo_pagamento as string | null) ?? null,
    arquivoNome:       (l.arquivo_nome as string | null) ?? null,
    importadoEm:       String(l.importado_em),
    importadoPorNome:  perfil?.nome ?? null,
  };
}

/** Uma linha viva do relatório do setor (a do último lote do mês). */
export interface LinhaDoRelatorio {
  nr: string;
  codCliente: string | null;
  franquia: string | null;
  tipo: string | null;
  status: string | null;
  parcela: number | null;
  vencimento: string | null;
  pagamento: string;
  valor: number;
}

const PAGINA_LINHAS = 1000;
/** Teto de segurança: a RPC aceita 50.000 por mês. */
const MAX_PAGINAS = 50;

/**
 * Todas as linhas do mês daquele setor, para o detalhe visual. O PostgREST
 * corta em 1.000 por resposta: pagina por id até acabar.
 */
export async function listarLinhasDoMes(
  setorId: string, relatorio: CodigoRelatorioDoSetor, mes: string,
): Promise<{ linhas: LinhaDoRelatorio[]; erro: string | null }> {
  const linhas: LinhaDoRelatorio[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const de = p * PAGINA_LINHAS;
    const { data, error } = await tabelaSemTipo<Record<string, unknown>>('relatorio_setor_linhas')
      .select('nr_documento, cod_cliente, franquia, tipo, status, parcela, data_vencimento, data_pagamento, valor')
      .eq('setor_id', setorId)
      .eq('relatorio', relatorio)
      .eq('mes_referencia', `${mes.slice(0, 7)}-01`)
      .order('id', { ascending: true })
      .range(de, de + PAGINA_LINHAS - 1);
    if (error) return { linhas, erro: error.message };
    for (const l of data ?? []) {
      linhas.push({
        nr:         String(l.nr_documento),
        codCliente: (l.cod_cliente as string | null) ?? null,
        franquia:   (l.franquia as string | null) ?? null,
        tipo:       (l.tipo as string | null) ?? null,
        status:     (l.status as string | null) ?? null,
        parcela:    l.parcela == null ? null : Number(l.parcela),
        vencimento: (l.data_vencimento as string | null) ?? null,
        pagamento:  String(l.data_pagamento),
        valor:      Number(l.valor) || 0,
      });
    }
    if (!data || data.length < PAGINA_LINHAS) break;
  }
  return { linhas, erro: null };
}

/** Os códigos de erro da RPC, na língua de quem importa. */
export function traduzirErroImportacao(mensagem: string): string {
  if (/SEM_PERMISSAO/.test(mensagem)) return 'Só o líder do setor ou o super admin importa este relatório.';
  if (/RELATORIO_NAO_HABILITADO/.test(mensagem)) return 'Este setor não usa este relatório.';
  if (/MES_FECHADO/.test(mensagem)) return 'O mês está fechado. Só o super admin importa em mês fechado.';
  if (/FORA_DO_MES/.test(mensagem)) return 'O arquivo tem pagamento fora do mês escolhido. Exporte o relatório só do mês.';
  if (/LINHA_REPETIDA/.test(mensagem)) return 'O mesmo Nr. Documento aparece duas vezes no mesmo dia e parcela.';
  if (/LINHA_INCOMPLETA/.test(mensagem)) return 'Há linha sem Nr. Documento, Dt. Pagamento ou Valor.';
  if (/ARQUIVO_VAZIO/.test(mensagem)) return 'Nenhuma linha para importar.';
  if (/function|does not exist|schema cache/i.test(mensagem)) {
    return 'A importação ainda não está liberada no banco (migration 20261112150000).';
  }
  return mensagem;
}

/** Troca o mês do setor pelo arquivo. Erro já traduzido. */
export async function importarRelatorioDoSetor(params: {
  setorId: string;
  relatorio: CodigoRelatorioDoSetor;
  mes: string;            // 'yyyy-MM'
  arquivoNome: string;
  linhas: readonly Linha1017[];
}): Promise<{ data: ResultadoImportacao | null; error: string | null }> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>>('fn_relatorio_setor_importar', {
    p_setor_id:  params.setorId,
    p_relatorio: params.relatorio,
    p_mes:       params.mes.slice(0, 7),
    p_arquivo:   params.arquivoNome,
    p_linhas:    params.linhas,
  });
  if (error || !data) return { data: null, error: traduzirErroImportacao(error?.message ?? 'Falha ao importar.') };
  // O valor chega às telas pela leitura dos ajustes, guardada por 2 minutos:
  // quem importou vê na hora; os outros, pelo sinal «ajustes».
  invalidarSomasDeAjuste();
  esquecerMesAnalitico();   // a varredura do mês junta os ajustes e guarda 1 minuto
  return {
    data: {
      loteId:          String(data.lote_id),
      linhas:          Number(data.linhas) || 0,
      valor:           Number(data.valor) || 0,
      ignoradas59:     Number(data.ignoradas_59) || 0,
      valorIgnorado59: Number(data.valor_ignorado_59) || 0,
      valorAnterior:   Number(data.valor_anterior) || 0,
    },
    error: null,
  };
}
