/**
 * parcelas.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Adição manual de parcela a um acordo existente (mesmo NR/Código).
 *
 * Caso de uso que originou o serviço (BookPlay, 2026-07-08): cliente pagou
 * entrada no Pix e o restante virou boleto para outra data. O acordo da
 * entrada já ocupava o NR, então a segunda tabulação era bloqueada sem
 * alternativa. A parcela adicionada entra no mesmo `acordo_grupo_id` do
 * acordo existente — o trigger `trg_sync_nr_registros` apenas re-aponta
 * `nr_registros` para a nova linha, sem conflito.
 *
 * Usado pelas duas portas:
 *  • Porta A — tabulação bloqueada por NR próprio (AcordoNovoInline);
 *  • Porta B — botão "Adicionar parcela" no detalhe (AcordoDetalheInline).
 */
import { supabase, type Acordo } from '@/lib/supabase';
import { getTodayISO } from '@/lib/index';

export interface NovaParcelaInput {
  /** yyyy-MM-dd */
  vencimento: string;
  valor:      number;
  tipo:       string;
  status:     string;
}

export type AdicionarParcelaResultado =
  | { ok: true; novaParcela: Acordo; novoTotal: number }
  | { ok: false; erro: string };

/** Monta o payload da nova parcela copiando a identidade do acordo base. */
function payloadNovaParcela(
  base: Acordo,
  input: NovaParcelaInput,
  grupoId: string,
  numero: number,
  total: number,
): Record<string, unknown> {
  return {
    nome_cliente:          base.nome_cliente,
    nr_cliente:            base.nr_cliente,
    instituicao:           base.instituicao,
    whatsapp:              base.whatsapp,
    observacoes:           base.observacoes,
    estado_uf:             base.estado_uf ?? null,
    operador_id:           base.operador_id,
    empresa_id:            base.empresa_id,
    setor_id:              base.setor_id ?? null,
    data_cadastro:         getTodayISO(),
    acordo_grupo_id:       grupoId,
    numero_parcela:        numero,
    parcelas:              total,
    tipo_vinculo:          base.tipo_vinculo,
    vinculo_operador_id:   base.vinculo_operador_id,
    vinculo_operador_nome: base.vinculo_operador_nome,
    // Parcela adicionada tem valor próprio — fica fora do rateio de
    // valor_total e da regra dos 40% (PaguePlay).
    valor_total:           null,
    usou_quarenta_pct:     false,
    vencimento:            input.vencimento,
    valor:                 input.valor,
    tipo:                  input.tipo,
    status:                input.status,
    // Recebimento é atribuído ao vencimento (mesma regra do marcar-pago).
    ...(input.status === 'pago' ? { data_pagamento: input.vencimento } : {}),
  };
}

/** Maior numero_parcela e maior total declarado entre as linhas do grupo. */
function medirGrupo(
  linhas: Pick<Acordo, 'numero_parcela' | 'parcelas'>[],
  base: Acordo,
): { novoNumero: number; totalAtual: number } {
  const maiorNumero = Math.max(
    base.numero_parcela ?? 1,
    ...linhas.map(l => l.numero_parcela ?? 1),
  );
  const totalAtual = Math.max(
    base.parcelas ?? 1,
    ...linhas.map(l => l.parcelas ?? 1),
  );
  return { novoNumero: maiorNumero + 1, totalAtual };
}

/**
 * Garante que o acordo pertence a um grupo (acordos antigos podem não ter
 * acordo_grupo_id) e devolve o id do grupo.
 */
async function garantirGrupo(base: Acordo): Promise<{ grupoId: string } | { erro: string }> {
  if (base.acordo_grupo_id) return { grupoId: base.acordo_grupo_id };

  const grupoId = crypto.randomUUID();
  const { error } = await supabase
    .from('acordos')
    .update({ acordo_grupo_id: grupoId, numero_parcela: base.numero_parcela ?? 1 })
    .eq('id', base.id);
  if (error) return { erro: `Erro ao agrupar acordo: ${error.message}` };
  return { grupoId };
}

/**
 * Insere uma nova parcela no grupo do acordo informado e mantém o total de
 * `parcelas` das linhas do grupo consistente. Retorna a linha inserida (com
 * o join de perfis usado pelas tabelas) e o novo total do grupo.
 */
export async function adicionarParcelaAoGrupo(
  acordoBase: Acordo,
  input: NovaParcelaInput,
  opts: { isPaguePlay: boolean },
): Promise<AdicionarParcelaResultado> {
  if (!acordoBase?.id)        return { ok: false, erro: 'Acordo base não informado' };
  if (!acordoBase.empresa_id) return { ok: false, erro: 'Acordo sem empresa vinculada' };
  if (!input.vencimento)      return { ok: false, erro: 'Informe o vencimento da nova parcela' };
  if (!(input.valor > 0))     return { ok: false, erro: 'Informe um valor válido para a nova parcela' };

  const grupo = await garantirGrupo(acordoBase);
  if ('erro' in grupo) return { ok: false, erro: grupo.erro };
  const { grupoId } = grupo;

  const { data: linhasGrupo, error: errSel } = await supabase
    .from('acordos')
    .select('id, numero_parcela, parcelas')
    .eq('empresa_id', acordoBase.empresa_id)
    .eq('acordo_grupo_id', grupoId);
  if (errSel) return { ok: false, erro: `Erro ao consultar parcelas do acordo: ${errSel.message}` };

  const { novoNumero, totalAtual } = medirGrupo(
    (linhasGrupo ?? []) as Pick<Acordo, 'numero_parcela' | 'parcelas'>[],
    acordoBase,
  );
  const novoTotal = Math.max(novoNumero, totalAtual);

  const { data: inserida, error: errIns } = await supabase
    .from('acordos')
    .insert(payloadNovaParcela(acordoBase, input, grupoId, novoNumero, novoTotal) as never)
    .select('*, perfis(id, nome, email, perfil, setor_id)')
    .single();
  if (errIns) return { ok: false, erro: `Erro ao adicionar parcela: ${errIns.message}` };

  // Mantém o contador N/N das linhas antigas do grupo.
  if (novoTotal !== totalAtual) {
    const { error: errTotal } = await supabase
      .from('acordos')
      .update({ parcelas: novoTotal })
      .eq('empresa_id', acordoBase.empresa_id)
      .eq('acordo_grupo_id', grupoId)
      .neq('id', (inserida as Acordo).id);
    if (errTotal) console.warn('[parcelas.service] falha ao atualizar total do grupo:', errTotal.message);
  }

  // Espelha no acordo do operador vinculado (par Direto↔Extra), como o
  // reagendamento de parcelas já faz. Falha aqui não desfaz a parcela —
  // para operador comum o RLS pode recusar o insert no acordo do par.
  if (acordoBase.vinculo_operador_id) {
    try {
      await espelharParcelaNoVinculo(acordoBase, input, opts.isPaguePlay);
    } catch (e) {
      console.warn('[parcelas.service] falha ao espelhar parcela no vínculo:', e);
    }
  }

  return { ok: true, novaParcela: inserida as Acordo, novoTotal };
}

/**
 * Replica a parcela no grupo do operador vinculado (o outro lado do par
 * Direto↔Extra do mesmo NR), mantendo os dois painéis consistentes.
 */
async function espelharParcelaNoVinculo(
  base: Acordo,
  input: NovaParcelaInput,
  isPaguePlay: boolean,
): Promise<void> {
  const campoChave: 'instituicao' | 'nr_cliente' = isPaguePlay ? 'instituicao' : 'nr_cliente';
  const valorChave = (isPaguePlay ? base.instituicao : base.nr_cliente)?.trim();
  if (!valorChave || !base.empresa_id || !base.vinculo_operador_id) return;

  const { data: parRows } = await supabase
    .from('acordos')
    .select('*')
    .eq('empresa_id', base.empresa_id)
    .eq('operador_id', base.vinculo_operador_id)
    .eq(campoChave, valorChave)
    .order('numero_parcela', { ascending: false })
    .limit(1);

  const parBase = (parRows?.[0] ?? null) as Acordo | null;
  if (!parBase) return;

  const grupoPar = await garantirGrupo(parBase);
  if ('erro' in grupoPar) return;

  const { data: linhasPar } = await supabase
    .from('acordos')
    .select('id, numero_parcela, parcelas')
    .eq('empresa_id', base.empresa_id)
    .eq('acordo_grupo_id', grupoPar.grupoId);

  const { novoNumero, totalAtual } = medirGrupo(
    (linhasPar ?? []) as Pick<Acordo, 'numero_parcela' | 'parcelas'>[],
    parBase,
  );
  const novoTotal = Math.max(novoNumero, totalAtual);

  const { error: errIns } = await supabase
    .from('acordos')
    .insert(payloadNovaParcela(parBase, input, grupoPar.grupoId, novoNumero, novoTotal) as never);
  if (errIns) {
    console.warn('[parcelas.service] espelho do vínculo não inserido:', errIns.message);
    return;
  }

  if (novoTotal !== totalAtual) {
    await supabase
      .from('acordos')
      .update({ parcelas: novoTotal })
      .eq('empresa_id', base.empresa_id)
      .eq('acordo_grupo_id', grupoPar.grupoId)
      .neq('numero_parcela', novoNumero);
  }
}
