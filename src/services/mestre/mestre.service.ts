/**
 * mestre.service.ts — a carga do relatório 59 e a leitura da aba.
 *
 * ## A carga é em três tempos, e isso não é burocracia
 *
 *   1. `fn_mestre_abrir_lote`     — nasce um lote `aberto`, que não conta para nada
 *   2. `fn_mestre_inserir_linhas` — o arquivo entra em pedaços
 *   3. `fn_mestre_promover_lote`  — numa transação só, o retrato do mês é trocado
 *
 * Se a rede cair no meio do passo 2, o lote fica `aberto` e o mês continua
 * mostrando o retrato anterior, inteiro. Nada de meio arquivo no ar. É por isso
 * que a promoção é separada da inserção.
 *
 * ## Por que não `insert` direto da tela
 *
 * São ~51 mil linhas por mês. Em chunk de 200 pelo cliente seriam ~255
 * requisições, e cada uma paga RLS por linha. A RPC recebe o pedaço como JSONB
 * e faz um `insert ... select` só — 34 requisições, e o trabalho no banco.
 *
 * ## O hash
 *
 * A rotina do ERP reescreve o arquivo do servidor mesmo sem dado novo (visto 3×
 * em 25/08/2026, conteúdo idêntico). `mtime` mente; o hash do conteúdo não. Ele
 * viaja junto do lote para que "esta carga mudou alguma coisa?" tenha resposta.
 */

import { tabelaSemTipo, rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { LinhaMestre59 } from './mestre59Parser';

/**
 * Quantas linhas por requisição.
 *
 * 1.500 × ~28 campos dá algo perto de 700 KB de JSON — grande o bastante para
 * o arquivo inteiro caber em ~34 idas, pequeno o bastante para não esbarrar em
 * limite de corpo de requisição nem segurar a barra de progresso parada.
 */
const LINHAS_POR_REQUISICAO = 1500;

export type EstadoLote = 'aberto' | 'vigente' | 'substituido' | 'descartado';
export type EstadoVinculo = 'novo' | 'vinculado' | 'ignorado';

export interface GrupoDoMestre {
  cod_grupo_filtro: string;
  /** Nome como veio no arquivo deste mês. Vazio se o grupo não veio. */
  nome_no_relatorio: string;
  /** Último nome que o cadastro guardou. Serve quando o mês não trouxe o grupo. */
  nome_cadastrado: string;
  setor_id: string | null;
  setor_nome: string | null;
  estado: EstadoVinculo;
  linhas: number;
  recebido: number;
  colchao_valor: number;
  extra_valor: number;
  equipes: number;
  cobradoras: number;
  dias: number;
  primeira_aparicao: string | null;
  ultima_aparicao: string | null;
}

export interface EquipeDoMestre {
  nome_subgrupo: string;
  linhas: number;
  recebido: number;
  cobradoras: number;
  primeira_aparicao: string | null;
  ultima_aparicao: string | null;
  estado: EstadoVinculo;
}

export interface LoteDoMestre {
  id: string;
  mes: string;
  arquivo_nome: string;
  arquivo_hash: string;
  linhas: number;
  total_recebido: number;
  estado: EstadoLote;
  importado_em: string;
  promovido_em: string | null;
  substituido_em: string | null;
}

export interface EventoDoMestre {
  id: number;
  tipo: string;
  cod_grupo_filtro: string | null;
  rotulo: string | null;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
}

export interface ResultadoPromocao {
  lote_id: string;
  mes: string;
  linhas: number;
  total_recebido: number;
  substituiu: string | null;
  grupos_novos: number;
  grupos_sumiram: number;
  grupos_voltaram: number;
  equipes_novas: number;
  equipes_sumiram: number;
}

/** SHA-256 do conteúdo, em hex. Ver o cabeçalho sobre por que não `mtime`. */
export async function hashDoConteudo(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Só o que a RPC consome — `linha_num` entra, o resto do tipo fica de fora. */
function paraPayload(l: LinhaMestre59) {
  return {
    setor:                l.setor,
    cod_grupo_filtro:     l.cod_grupo_filtro,
    nome_grupo_filtro:    l.nome_grupo_filtro,
    cod_grupo:            l.cod_grupo,
    cod_grupo_representa: l.cod_grupo_representa,
    setor_orig:           l.setor_orig,
    cobradora:            l.cobradora,
    operador_orig:        l.operador_orig,
    subgrupo_equipe:      l.subgrupo_equipe,
    cliente:              l.cliente,
    cod_cli:              l.cod_cli,
    titulo:               l.titulo,
    nr_documento:         l.nr_documento,
    parcela:              l.parcela,
    empresa_erp:          l.empresa_erp,
    tipo_venda:           l.tipo_venda,
    tp_doc:               l.tp_doc,
    colchao:              l.colchao,
    tipo:                 l.tipo,
    dt_lig:               l.dt_lig,
    prev_pgto:            l.prev_pgto,
    dt_pgto:              l.dt_pgto,
    dias:                 l.dias,
    dias_atraso:          l.dias_atraso,
    dias_ligacao_baixa:   l.dias_ligacao_baixa,
    recebido:             l.recebido,
    linha_num:            l.linha_num,
  };
}

export interface ProgressoCarga {
  enviadas: number;
  total: number;
  fase: 'abrindo' | 'enviando' | 'promovendo';
}

/**
 * Sobe o arquivo inteiro e promove o lote.
 *
 * Falha em qualquer ponto do envio deixa o lote `aberto` e tenta descartá-lo —
 * o mês continua com o retrato anterior. Se nem o descarte funcionar, o lote
 * fica `aberto` e visível na lista, que é melhor do que sumir levando 50 mil
 * linhas órfãs junto.
 */
export async function importarMestre59(params: {
  empresaId: string;
  mes: string;                  // 'yyyy-MM'
  arquivoNome: string;
  conteudo: string;
  linhas: readonly LinhaMestre59[];
  onProgresso?: (p: ProgressoCarga) => void;
}): Promise<ResultadoPromocao> {
  const { empresaId, mes, arquivoNome, conteudo, linhas, onProgresso } = params;
  if (linhas.length === 0) throw new Error('Nada para importar: o arquivo não tem linhas válidas.');

  onProgresso?.({ enviadas: 0, total: linhas.length, fase: 'abrindo' });
  const hash = await hashDoConteudo(conteudo);

  const { data: loteId, error: errAbrir } = await rpcSemTipo<string>('fn_mestre_abrir_lote', {
    p_empresa_id: empresaId,
    p_mes:        mes,
    p_arquivo:    arquivoNome,
    p_hash:       hash,
  });
  if (errAbrir || !loteId) throw new Error(errAbrir?.message ?? 'Não foi possível abrir o lote.');

  try {
    let enviadas = 0;
    for (let i = 0; i < linhas.length; i += LINHAS_POR_REQUISICAO) {
      const pedaco = linhas.slice(i, i + LINHAS_POR_REQUISICAO).map(paraPayload);
      const { error } = await rpcSemTipo('fn_mestre_inserir_linhas', {
        p_lote_id: loteId,
        p_linhas:  pedaco,
      });
      if (error) throw new Error(`Envio (linhas ${i + 1}–${i + pedaco.length}): ${error.message}`);
      enviadas += pedaco.length;
      onProgresso?.({ enviadas, total: linhas.length, fase: 'enviando' });
    }

    onProgresso?.({ enviadas: linhas.length, total: linhas.length, fase: 'promovendo' });
    const { data, error } = await rpcSemTipo<ResultadoPromocao>('fn_mestre_promover_lote', { p_lote_id: loteId });
    if (error || !data) throw new Error(error?.message ?? 'Promoção do lote não devolveu resultado.');
    return data;
  } catch (e) {
    // O lote aberto não afeta nenhuma leitura, mas deixá-lo para trás encheria
    // a tabela de retratos pela metade a cada tentativa que falhou.
    await rpcSemTipo('fn_mestre_descartar_lote', { p_lote_id: loteId }).catch(() => {});
    throw e;
  }
}

export async function buscarResumoGrupos(empresaId: string, mes: string): Promise<GrupoDoMestre[]> {
  const { data, error } = await rpcSemTipo<GrupoDoMestre[]>('fn_mestre_resumo_grupos', {
    p_empresa_id: empresaId, p_mes: mes,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(g => ({
    ...g,
    linhas:        Number(g.linhas) || 0,
    recebido:      Number(g.recebido) || 0,
    colchao_valor: Number(g.colchao_valor) || 0,
    extra_valor:   Number(g.extra_valor) || 0,
    equipes:       Number(g.equipes) || 0,
    cobradoras:    Number(g.cobradoras) || 0,
    dias:          Number(g.dias) || 0,
  }));
}

export async function buscarResumoEquipes(
  empresaId: string, mes: string, codGrupo: string,
): Promise<EquipeDoMestre[]> {
  const { data, error } = await rpcSemTipo<EquipeDoMestre[]>('fn_mestre_resumo_equipes', {
    p_empresa_id: empresaId, p_mes: mes, p_cod: codGrupo,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(e => ({
    ...e,
    linhas:     Number(e.linhas) || 0,
    recebido:   Number(e.recebido) || 0,
    cobradoras: Number(e.cobradoras) || 0,
  }));
}

export async function vincularGrupo(params: {
  empresaId: string;
  codGrupo: string;
  setorId: string | null;
  estado: EstadoVinculo;
  observacao?: string | null;
}): Promise<void> {
  const { error } = await rpcSemTipo('fn_mestre_vincular_grupo', {
    p_empresa_id: params.empresaId,
    p_cod:        params.codGrupo,
    p_setor_id:   params.estado === 'vinculado' ? params.setorId : null,
    p_estado:     params.estado,
    p_observacao: params.observacao ?? null,
  });
  if (error) throw new Error(error.message);
}

/** As cargas de um mês, da mais recente para a mais antiga. */
export async function buscarLotes(empresaId: string, mes: string): Promise<LoteDoMestre[]> {
  const { data, error } = await tabelaSemTipo<LoteDoMestre>('mestre_lotes')
    .select('id, mes, arquivo_nome, arquivo_hash, linhas, total_recebido, estado, importado_em, promovido_em, substituido_em')
    .eq('empresa_id', empresaId)
    .eq('mes', `${mes}-01`)
    .order('importado_em', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map(l => ({
    ...l,
    linhas:         Number(l.linhas) || 0,
    total_recebido: Number(l.total_recebido) || 0,
  }));
}

export async function buscarEventos(empresaId: string, limite = 60): Promise<EventoDoMestre[]> {
  const { data, error } = await tabelaSemTipo<EventoDoMestre>('mestre_eventos')
    .select('id, tipo, cod_grupo_filtro, rotulo, detalhes, criado_em')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data ?? [];
}
