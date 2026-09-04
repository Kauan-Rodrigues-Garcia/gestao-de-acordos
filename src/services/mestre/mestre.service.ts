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

/**
 * Onde o recebimento de uma equipe conta.
 *
 * O ERP põe a equipe no grupo de quem exportou o relatório, e nem sempre é ali
 * que ela deve contar — `DIGITAL BRUNNO` chega no Play 5 sem ser Play 5.
 *
 *   proprio        fica no setor do grupo. Padrão; ninguém mexeu em nada.
 *   outro_setor    SAI do grupo e conta no setor escolhido.
 *   somente_geral  SAI do grupo e não conta em setor nenhum — só no total da
 *                  empresa. Para o dinheiro que existe e não é de ninguém.
 */
export type DestinoEquipe = 'proprio' | 'outro_setor' | 'somente_geral';

/**
 * Um grupo do relatório, com o dinheiro separado em direto e extra.
 *
 * ## A regra, e o erro que ela corrige
 *
 * Um pagamento pode ter DOIS operadores: um direto e um extra. Quando um deles
 * é do receptivo, o ERP emite a mesma cobrança nas duas pernas — `Integral` em
 * quem cobrou direto, `Extra` no receptivo. O dinheiro já está nos dois
 * relatórios de propósito: é rateio de comissão, não transferência.
 *
 *   recebido_proprio  TUDO o que o grupo cobrou. Nada sai daqui.
 *   contrib_integral  o Integral que outro grupo cobrou para este. SOMA — é o
 *                     único que não está no relatório do setor.
 *   contrib_extra     o Extra que outro grupo cobrou para este. NÃO soma: o
 *                     setor já tem esse pagamento como direto.
 *   recebido_total    recebido_proprio + contrib_integral
 *
 * Medido em agosto/2026, Play 5: das 221 linhas Integral que o receptivo
 * carimbou para ele, ZERO estão no relatório do Play 5 — por isso somam. Das
 * 425 Extra, 248 casam linha a linha com o relatório do Play 5 — por isso não.
 *
 *   Play 5 = 361.768,85 + 38.656,52 = R$ 400.425,37
 *
 * ⚠️ Somar `recebido_total` de todos os grupos dá MAIS que o total do arquivo,
 * e isso está certo: o Extra é a mesma cobrança em duas pernas, e as duas
 * contam. A diferença é exatamente o Extra carimbado.
 */
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
  /** Tudo o que o grupo cobrou. Nada é subtraído. */
  recebido_proprio: number;
  integral_proprio: number;
  extra_proprio: number;
  /** Integral vindo de outro grupo. O único que soma. */
  contrib_integral: number;
  /** Extra vindo de outro grupo. Informativo — o setor já o tem como direto. */
  contrib_extra: number;
  /** Equipes deste grupo movidas para fora. Saem do total dele. */
  saiu_outro_setor: number;
  saiu_somente_geral: number;
  recebido_total: number;
  /** Deste grupo, carimbado para outros. Informativo: continua no total daqui. */
  para_outros_integral: number;
  para_outros_extra: number;
  /** Composto cujo destino não casou com grupo nenhum. Visível, nunca some. */
  sem_destino: number;
  colchao_valor: number;
  /** `SubgrupoEquipe = ATESTADOS|FERIAS`. Conta no total, e aparece à parte. */
  atestado_valor: number;
  equipes: number;
  cobradoras: number;
  dias: number;
  primeira_aparicao: string | null;
  ultima_aparicao: string | null;
}

/** De onde vem (ou para onde vai) o dinheiro de um grupo. Zero não aparece. */
export interface OrigemDoGrupo {
  origem: 'proprio' | 'contribuicao' | 'para_outro' | 'sem_destino';
  /** O outro grupo envolvido: de onde veio, ou para onde foi. */
  cod_outro: string | null;
  rotulo: string | null;
  tipo: 'Integral' | 'Extra';
  /** Esta linha entra no total do setor? O Extra vindo de fora não entra. */
  soma: boolean;
  linhas: number;
  valor: number;
}

export interface EquipeDoMestre {
  nome_subgrupo: string;
  /** Falso para ATESTADOS|FERIAS, LIDERANÇA, SUPERVISORES e o vazio. */
  e_equipe: boolean;
  linhas: number;
  recebido: number;
  integral_valor: number;
  extra_valor: number;
  cobradoras: number;
  equipe_id: string | null;
  equipe_nome: string | null;
  estado: EstadoVinculo;
  destino: DestinoEquipe;
  destino_setor_id: string | null;
  destino_setor_nome: string | null;
  primeira_aparicao: string | null;
  ultima_aparicao: string | null;
}

/** O número final de um setor, já com as equipes que saíram e as que vieram. */
export interface SetorDoMestre {
  setor_id: string;
  setor_nome: string;
  dos_grupos: number;
  recebido_movido: number;
  total: number;
  grupos: number;
}

/**
 * Um operador de uma equipe do relatório.
 *
 * `perfil_id` é o casamento AUTOMÁTICO com o cadastro — `Cobradora` contra
 * `perfis.usuario` em minúsculo, a mesma regra de `resolverOperadores`. Ele é
 * calculado na leitura e **não grava nada**: enquanto o mestre está em
 * conferência, vincular sozinho seria mudar cadastro de gente com base num
 * número que ainda pode mudar.
 */
export interface OperadorDaEquipe {
  cobradora: string;
  linhas: number;
  recebido: number;
  integral_valor: number;
  extra_valor: number;
  colchao_valor: number;
  nrs: number;
  dias: number;
  perfil_id: string | null;
  perfil_nome: string | null;
  perfil_ativo: boolean | null;
  equipe_atual: string | null;
  setor_atual: string | null;
}

/** Uma linha do relatório, no nível do acordo. */
export interface LinhaDoOperador {
  nr_documento: string;
  parcela: string;
  titulo: string;
  cliente: string;
  cod_cli: string;
  empresa_erp: string;
  tp_doc: string;
  tipo_venda: string | null;
  dt_lig: string | null;
  dt_pgto: string;
  dias_atraso: number | null;
  recebido: number;
  tipo: string;
  colchao: boolean;
  setor_carimbado: string;
  linha_num: number;
}

/** Quantos operadores de cada equipe casaram com o cadastro. */
export interface VinculoOperadores {
  nome_subgrupo: string;
  operadores: number;
  vinculados: number;
  sem_cadastro: number;
}

export type ProblemaOperador = 'sem_cadastro' | 'sem_equipe' | 'equipe_errada' | 'setor_errado';

export interface OperadorDivergente {
  cobradora: string;
  nome_subgrupo: string;
  recebido: number;
  problema: ProblemaOperador;
  perfil_id: string | null;
  perfil_nome: string | null;
  equipe_atual: string | null;
  equipe_esperada: string | null;
}

export interface ComparacaoSetor {
  cod_grupo_filtro: string;
  rotulo: string;
  setor_id: string | null;
  setor_nome: string | null;
  estado: EstadoVinculo;
  mestre_total: number;
  mestre_proprio: number;
  mestre_contribuido: number;
  sistema_total: number;
  sistema_linhas: number;
  diferenca: number;
}

export interface SetorSemGrupo {
  setor_id: string;
  setor_nome: string;
  sistema_total: number;
  sistema_linhas: number;
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

/**
 * `numeric` do Postgres chega como STRING no supabase-js.
 *
 * Somar sem converter concatena: `"100" + "50"` daria `"10050"` num total. É
 * silencioso e passa por qualquer teste que não olhe o número.
 */
const n = (v: unknown): number => Number(v) || 0;

export async function buscarResumoGrupos(empresaId: string, mes: string): Promise<GrupoDoMestre[]> {
  const { data, error } = await rpcSemTipo<GrupoDoMestre[]>('fn_mestre_resumo_grupos', {
    p_empresa_id: empresaId, p_mes: mes,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(g => ({
    ...g,
    linhas:               n(g.linhas),
    recebido_proprio:     n(g.recebido_proprio),
    integral_proprio:     n(g.integral_proprio),
    extra_proprio:        n(g.extra_proprio),
    contrib_integral:     n(g.contrib_integral),
    contrib_extra:        n(g.contrib_extra),
    saiu_outro_setor:     n(g.saiu_outro_setor),
    saiu_somente_geral:   n(g.saiu_somente_geral),
    recebido_total:       n(g.recebido_total),
    para_outros_integral: n(g.para_outros_integral),
    para_outros_extra:    n(g.para_outros_extra),
    sem_destino:          n(g.sem_destino),
    colchao_valor:        n(g.colchao_valor),
    atestado_valor:       n(g.atestado_valor),
    equipes:              n(g.equipes),
    cobradoras:           n(g.cobradoras),
    dias:                 n(g.dias),
  }));
}

export async function buscarOrigensDoGrupo(
  empresaId: string, mes: string, codGrupo: string,
): Promise<OrigemDoGrupo[]> {
  const { data, error } = await rpcSemTipo<OrigemDoGrupo[]>('fn_mestre_origens_do_grupo', {
    p_empresa_id: empresaId, p_mes: mes, p_cod: codGrupo,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(o => ({ ...o, linhas: n(o.linhas), valor: n(o.valor) }));
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
    linhas:         n(e.linhas),
    recebido:       n(e.recebido),
    integral_valor: n(e.integral_valor),
    extra_valor:    n(e.extra_valor),
    cobradoras:     n(e.cobradoras),
  }));
}

export async function buscarOperadoresDaEquipe(
  empresaId: string, mes: string, codGrupo: string, subgrupo: string,
): Promise<OperadorDaEquipe[]> {
  const { data, error } = await rpcSemTipo<OperadorDaEquipe[]>('fn_mestre_operadores_da_equipe', {
    p_empresa_id: empresaId, p_mes: mes, p_cod: codGrupo, p_subgrupo: subgrupo,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(o => ({
    ...o,
    linhas:         n(o.linhas),
    recebido:       n(o.recebido),
    integral_valor: n(o.integral_valor),
    extra_valor:    n(o.extra_valor),
    colchao_valor:  n(o.colchao_valor),
    nrs:            n(o.nrs),
    dias:           n(o.dias),
  }));
}

export async function buscarLinhasDoOperador(
  empresaId: string, mes: string, codGrupo: string, cobradora: string, subgrupo?: string | null,
): Promise<LinhaDoOperador[]> {
  const { data, error } = await rpcSemTipo<LinhaDoOperador[]>('fn_mestre_linhas_do_operador', {
    p_empresa_id: empresaId, p_mes: mes, p_cod: codGrupo,
    p_cobradora: cobradora, p_subgrupo: subgrupo ?? null, p_limite: 300,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(l => ({
    ...l, recebido: n(l.recebido),
    dias_atraso: l.dias_atraso === null ? null : n(l.dias_atraso),
    linha_num: n(l.linha_num),
  }));
}

export async function buscarVinculoOperadores(
  empresaId: string, mes: string, codGrupo: string,
): Promise<VinculoOperadores[]> {
  const { data, error } = await rpcSemTipo<VinculoOperadores[]>('fn_mestre_vinculo_operadores', {
    p_empresa_id: empresaId, p_mes: mes, p_cod: codGrupo,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(v => ({
    ...v, operadores: n(v.operadores), vinculados: n(v.vinculados), sem_cadastro: n(v.sem_cadastro),
  }));
}

/**
 * Move o recebimento de uma equipe para fora do setor do grupo.
 *
 * É o único ponto da aba que muda como o dinheiro é atribuído — e mesmo assim
 * não toca no relatório: a linha continua onde o ERP a pôs, e o que muda é
 * onde ela CONTA. O histórico registra cada mudança.
 */
export async function moverEquipe(params: {
  empresaId: string;
  codGrupo: string;
  subgrupo: string;
  destino: DestinoEquipe;
  setorId?: string | null;
}): Promise<void> {
  const { error } = await rpcSemTipo('fn_mestre_destino_equipe', {
    p_empresa_id: params.empresaId,
    p_cod:        params.codGrupo,
    p_subgrupo:   params.subgrupo,
    p_destino:    params.destino,
    p_setor_id:   params.destino === 'outro_setor' ? (params.setorId ?? null) : null,
  });
  if (error) throw new Error(error.message);
}

/** Quanto cada setor recebeu, já com o que saiu e o que veio de outro grupo. */
export async function buscarResumoSetores(
  empresaId: string, mes: string,
): Promise<SetorDoMestre[]> {
  const { data, error } = await rpcSemTipo<SetorDoMestre[]>('fn_mestre_resumo_setores', {
    p_empresa_id: empresaId, p_mes: mes,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(s => ({
    ...s,
    dos_grupos:      n(s.dos_grupos),
    recebido_movido: n(s.recebido_movido),
    total:           n(s.total),
    grupos:          n(s.grupos),
  }));
}

export async function vincularEquipe(params: {
  empresaId: string;
  codGrupo: string;
  subgrupo: string;
  equipeId: string | null;
  estado: EstadoVinculo;
}): Promise<void> {
  const { error } = await rpcSemTipo('fn_mestre_vincular_equipe', {
    p_empresa_id: params.empresaId,
    p_cod:        params.codGrupo,
    p_subgrupo:   params.subgrupo,
    p_equipe_id:  params.estado === 'vinculado' ? params.equipeId : null,
    p_estado:     params.estado,
  });
  if (error) throw new Error(error.message);
}

/** Vazio enquanto nenhuma equipe do grupo estiver vinculada — é o esperado. */
export async function buscarOperadoresDivergentes(
  empresaId: string, mes: string, codGrupo: string,
): Promise<OperadorDivergente[]> {
  const { data, error } = await rpcSemTipo<OperadorDivergente[]>('fn_mestre_operadores_divergentes', {
    p_empresa_id: empresaId, p_mes: mes, p_cod: codGrupo,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(o => ({ ...o, recebido: n(o.recebido) }));
}

/** Fase 2: o mestre contra `analitico_recebimentos`. Só leitura dos dois lados. */
export async function compararSetores(empresaId: string, mes: string): Promise<ComparacaoSetor[]> {
  const { data, error } = await rpcSemTipo<ComparacaoSetor[]>('fn_mestre_comparar_setores', {
    p_empresa_id: empresaId, p_mes: mes,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(c => ({
    ...c,
    mestre_total:       n(c.mestre_total),
    mestre_proprio:     n(c.mestre_proprio),
    mestre_contribuido: n(c.mestre_contribuido),
    sistema_total:      n(c.sistema_total),
    sistema_linhas:     n(c.sistema_linhas),
    diferenca:          n(c.diferenca),
  }));
}

/** Setor com dinheiro no sistema que nenhum grupo do 59 aponta. */
export async function buscarSetoresSemGrupo(empresaId: string, mes: string): Promise<SetorSemGrupo[]> {
  const { data, error } = await rpcSemTipo<SetorSemGrupo[]>('fn_mestre_setores_sem_grupo', {
    p_empresa_id: empresaId, p_mes: mes,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(s => ({
    ...s, sistema_total: n(s.sistema_total), sistema_linhas: n(s.sistema_linhas),
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
