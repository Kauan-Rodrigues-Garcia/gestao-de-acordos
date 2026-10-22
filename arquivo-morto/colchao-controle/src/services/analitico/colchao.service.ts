import { supabase, type Database } from '@/lib/supabase';
import { registrarLog } from '@/services/logs.service';
import type { LinhaColchao } from './analiticoComum';
import type { OperadorResolvidoMap } from './analitico.service';

export type ColchaoForaMeta = Database['public']['Tables']['analitico_colchao_fora_meta']['Row'];

export interface ResultadoImportacaoColchao {
  inseridos: number;
  duplicados: number;
  erros: string[];
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function textoChave(valor: string): string {
  return valor.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Identidade estável da linha cumulativa do ERP.
 *
 * O mesmo NR pode aparecer em mais de uma parcela; por isso NR sozinho nunca é
 * usado como chave. A data e o valor fecham a identidade quando o relatório não
 * traz título/parcela.
 */
export function chaveDeduplicacaoColchao(linha: LinhaColchao): string {
  return JSON.stringify([
    textoChave(linha.operador_usuario),
    linha.codigo.trim(),
    linha.nr_documento.trim(),
    linha.titulo.trim(),
    linha.parcela.trim(),
    toISO(linha.data_pagamento),
    textoChave(linha.tpdoc_original),
    linha.valor_recebido.toFixed(2),
  ]);
}

/** Insere em lotes, ignorando linhas já vistas em importações cumulativas. */
export async function importarLoteColchao(
  empresaId: string,
  importadoPorId: string,
  loteId: string,
  linhas: LinhaColchao[],
  operadoresMap: OperadorResolvidoMap,
  setorImportacaoId?: string | null,
): Promise<ResultadoImportacaoColchao> {
  if (!linhas.length) return { inseridos: 0, duplicados: 0, erros: [] };

  const rows: Database['public']['Tables']['analitico_colchao_fora_meta']['Insert'][] = linhas.map(l => {
    const dataPagamento = toISO(l.data_pagamento);
    return {
      empresa_id: empresaId,
      setor_id: setorImportacaoId ?? null,
      operador_id: operadoresMap[l.operador_usuario] ?? null,
      operador_usuario: l.operador_usuario,
      equipe: l.equipe,
      codigo: l.codigo.trim(),
      nome_cliente: l.nome_cliente || null,
      nr_documento: l.nr_documento,
      titulo: l.titulo,
      parcela: l.parcela,
      forma_pagamento: l.forma_pagamento,
      tpdoc_original: l.tpdoc_original,
      tipo_comissao: l.tipo_comissao ?? null,
      valor_recebido: l.valor_recebido,
      total_ho: l.total_ho,
      data_pagamento: dataPagamento,
      mes_referencia: `${dataPagamento.slice(0, 7)}-01`,
      chave_deduplicacao: chaveDeduplicacaoColchao(l),
      lote_id: loteId,
      importado_por_id: importadoPorId,
    };
  });

  const CHUNK = 200;
  let inseridos = 0;
  let duplicados = 0;
  const erros: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('analitico_colchao_fora_meta')
      .upsert(chunk, {
        onConflict: 'empresa_id,chave_deduplicacao',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      erros.push(`Colchão — bloco ${i / CHUNK + 1}: ${error.message}`);
    } else {
      inseridos += data?.length ?? 0;
      duplicados += chunk.length - (data?.length ?? 0);
    }
  }

  void registrarLog({
    acao: erros.length ? 'importacao_falhou' : 'importacao_concluida',
    categoria: 'importacao',
    severidade: erros.length ? 'aviso' : 'info',
    descricao: `Importou Colchão fora da meta: ${inseridos} linha(s) nova(s), ${duplicados} já existente(s)`,
    empresaId,
    tabela: 'analitico_colchao_fora_meta',
    registroId: loteId,
    alvoTipo: 'importacao_analitico_colchao',
    alvoRotulo: 'Colchão fora da meta',
    origem: 'importacao',
    detalhes: {
      lote_id: loteId,
      linhas_no_arquivo: linhas.length,
      inseridos,
      duplicados,
      setor_importacao_id: setorImportacaoId ?? null,
      primeiros_erros: erros.slice(0, 20),
    },
    usuarioId: importadoPorId,
  });

  return { inseridos, duplicados, erros };
}

/** Revincula linhas antigas que ficaram órfãs porque o perfil ainda não existia. */
export async function revincularOrfaosColchao(
  empresaId: string,
  operadoresMap: OperadorResolvidoMap,
): Promise<void> {
  for (const [operadorUsuario, operadorId] of Object.entries(operadoresMap)) {
    if (!operadorId) continue;
    await supabase
      .from('analitico_colchao_fora_meta')
      .update({ operador_id: operadorId })
      .eq('empresa_id', empresaId)
      .eq('operador_usuario', operadorUsuario)
      .is('operador_id', null);
  }
}

/** Busca o mês inteiro sem perder linhas no limite padrão de 1.000 do PostgREST. */
export async function listarColchaoDoMes(
  empresaId: string,
  mes: string,
  setorId?: string | null,
  operadorId?: string | null,
): Promise<ColchaoForaMeta[]> {
  const PAGE = 1000;
  const resultado: ColchaoForaMeta[] = [];

  for (let inicio = 0; ; inicio += PAGE) {
    let query = supabase
      .from('analitico_colchao_fora_meta')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('mes_referencia', `${mes}-01`)
      .order('data_pagamento', { ascending: true })
      .order('id', { ascending: true })
      .range(inicio, inicio + PAGE - 1);

    if (setorId) query = query.eq('setor_id', setorId);
    if (operadorId) query = query.eq('operador_id', operadorId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const pagina = data ?? [];
    resultado.push(...pagina);
    if (pagina.length < PAGE) break;
  }

  return resultado;
}
