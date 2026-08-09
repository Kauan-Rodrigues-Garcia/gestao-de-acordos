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

export type AdicionarLoteResultado =
  | { ok: true; novasParcelas: Acordo[]; novoTotal: number }
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

/**
 * Alguma parcela do grupo ainda está EM ABERTO (aguardando pagamento)?
 *
 * `verificar_pendente` é o único status em aberto: `pago` liquidou e
 * `nao_pago` encerrou (e já liberou o NR).
 *
 * É o que decide se uma parcela nova deve virar registro agora — ver
 * `adicionarParcelasAoGrupo`, modo `'proxima'`.
 */
export function temParcelaEmAberto(
  linhas: readonly { status?: string | null }[],
): boolean {
  return linhas.some(l => l.status === 'verificar_pendente');
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
 * Adiciona parcelas ao grupo.
 *
 * ## Declarar não é materializar
 *
 * O acordo declara `parcelas` (o "de N") e nem sempre tem N linhas no banco —
 * é o modelo que `linhasParcelas.ts` desenha, com as que faltam aparecendo como
 * virtuais. A regra da operação é que exista **uma parcela em aberto por vez**:
 * a próxima só vira registro quando a atual for quitada e reagendada.
 *
 * Daí os dois modos:
 *
 * | `modo` | Total declarado | Linhas criadas |
 * |---|---|---|
 * | `'todas'` (padrão) | +N | as N |
 * | `'proxima'` | +N | **1** se o grupo não tem parcela em aberto; **0** se tem |
 *
 * `'todas'` é usado por `aplicarQuantidade`, onde o operador está justamente
 * editando quais linhas existem. `'proxima'` é o botão "Adicionar parcela":
 * antes ele gravava as 10 de uma vez, o que enchia o acordo de parcelas em
 * aberto e contrariava o resto do sistema.
 *
 * Em `'todas'`, a inserção é UM comando e não um laço de N: com 10 parcelas,
 * um laço que falhasse na 6ª deixaria o grupo com metade das linhas e um
 * contador N/N mentindo. Ou entram todas, ou não entra nenhuma.
 *
 * Cada linha recebe seu próprio `numero_parcela`, seguindo o maior já existente
 * no grupo — as parcelas do lote não colidem entre si nem com as antigas.
 */
export async function adicionarParcelasAoGrupo(
  acordoBase: Acordo,
  inputs: readonly NovaParcelaInput[],
  opts: { isPaguePlay: boolean; modo?: 'todas' | 'proxima' },
): Promise<AdicionarLoteResultado> {
  if (!acordoBase?.id)        return { ok: false, erro: 'Acordo base não informado' };
  if (!acordoBase.empresa_id) return { ok: false, erro: 'Acordo sem empresa vinculada' };
  if (!inputs.length)         return { ok: false, erro: 'Nenhuma parcela para adicionar' };
  for (const [i, p] of inputs.entries()) {
    if (!p.vencimento)  return { ok: false, erro: `Parcela ${i + 1}: informe o vencimento` };
    if (!(p.valor > 0)) return { ok: false, erro: `Parcela ${i + 1}: informe um valor válido` };
  }

  const grupo = await garantirGrupo(acordoBase);
  if ('erro' in grupo) return { ok: false, erro: grupo.erro };
  const { grupoId } = grupo;

  const { data: linhasGrupo, error: errSel } = await supabase
    .from('acordos')
    .select('id, numero_parcela, parcelas, status')
    .eq('empresa_id', acordoBase.empresa_id)
    .eq('acordo_grupo_id', grupoId);
  if (errSel) return { ok: false, erro: `Erro ao consultar parcelas do acordo: ${errSel.message}` };

  const linhas = (linhasGrupo ?? []) as Pick<Acordo, 'numero_parcela' | 'parcelas' | 'status'>[];

  const { novoNumero, totalAtual } = medirGrupo(linhas, acordoBase);
  // O total declara o lote INTEIRO, mesmo quando nenhuma linha é materializada:
  // é ele que faz as parcelas que faltam aparecerem como virtuais no detalhe.
  const novoTotal = Math.max(novoNumero + inputs.length - 1, totalAtual);

  // Quantas viram registro AGORA. No modo 'proxima', só a próxima — e só se
  // não houver parcela em aberto: com uma pendente, adicionar outra criaria
  // duas cobranças vivas ao mesmo tempo.
  //
  // O grupo pode ainda não ter linha nenhuma no banco (acordo de uma parcela
  // só, sem `acordo_grupo_id` até agora), então o status da base entra na
  // conta junto com o das linhas lidas.
  const aInserir = opts.modo === 'proxima'
    ? (temParcelaEmAberto([...linhas, acordoBase]) ? [] : inputs.slice(0, 1))
    : inputs;

  let novas: Acordo[] = [];
  if (aInserir.length > 0) {
    const payloads = aInserir.map((input, i) =>
      payloadNovaParcela(acordoBase, input, grupoId, novoNumero + i, novoTotal),
    );

    const { data: inseridas, error: errIns } = await supabase
      .from('acordos')
      .insert(payloads as never)
      .select('*, perfis(id, nome, email, perfil, setor_id)');
    if (errIns) return { ok: false, erro: `Erro ao adicionar parcelas: ${errIns.message}` };

    // Um insert de várias linhas devolve array, mas o de UMA pode voltar como
    // objeto. Normalizar aqui evita que o caminho de uma parcela — o mais comum —
    // quebre num `.map` de algo que não é lista.
    novas = Array.isArray(inseridas)
      ? inseridas as Acordo[]
      : (inseridas ? [inseridas as Acordo] : []);
  }

  // Mantém o contador N/N das linhas do grupo.
  //
  // Atualiza o grupo INTEIRO, sem excluir as recém-inseridas: elas já nasceram
  // com `novoTotal`, então regravar o mesmo valor não muda nada. Excluí-las
  // exigiria filtrar por uma lista de ids — mais código para o mesmo efeito.
  if (novoTotal !== totalAtual) {
    const { error: errTotal } = await supabase
      .from('acordos')
      .update({ parcelas: novoTotal })
      .eq('empresa_id', acordoBase.empresa_id)
      .eq('acordo_grupo_id', grupoId);
    if (errTotal) {
      // Quando nada foi materializado, este UPDATE é o ÚNICO efeito da ação:
      // engoli-lo faria o botão "adicionar 10 parcelas" não fazer absolutamente
      // nada, em silêncio. Com linhas inseridas, o aviso basta — elas já
      // nasceram com o total certo.
      if (novas.length === 0) {
        return { ok: false, erro: `Erro ao atualizar o total de parcelas: ${errTotal.message}` };
      }
      console.warn('[parcelas.service] falha ao atualizar total do grupo:', errTotal.message);
    }
  }

  // Espelha no par Direto↔Extra as parcelas que de fato entraram — no modo
  // 'proxima' espelhar as 10 criaria no par o que não existe deste lado. A
  // falha de um espelho não desfaz o lote (para operador comum a RLS pode
  // recusar).
  if (acordoBase.vinculo_operador_id) {
    for (const input of aInserir) {
      try {
        await espelharParcelaNoVinculo(acordoBase, input, opts.isPaguePlay);
      } catch (e) {
        console.warn('[parcelas.service] falha ao espelhar parcela no vínculo:', e);
      }
    }
  }

  return { ok: true, novasParcelas: novas, novoTotal };
}

export interface ParcelaNumerada extends NovaParcelaInput {
  /** Posição EXATA no acordo — não é continuação do maior número existente. */
  numero: number;
}

export type CriarNumeradasResultado =
  | { ok: true; criadas: Acordo[] }
  | { ok: false; erro: string };

/**
 * Cria parcelas em posições determinadas do acordo.
 *
 * Diferente de `adicionarParcelasAoGrupo`, que empilha no fim: aqui o número de
 * cada parcela vem de fora. É o caso da tela de editar parcelas, onde um acordo
 * de 17 parcelas com 2 linhas no banco mostra as 15 que faltam — e materializar
 * a 9ª tem de gravar 9, não "a próxima da fila".
 *
 * O total (`parcelas`) NÃO muda: essas parcelas já eram contadas pelo acordo,
 * só não existiam como registro.
 */
export async function criarParcelasNumeradas(
  acordoBase: Acordo,
  entradas: readonly ParcelaNumerada[],
  opts: { camposExtras?: Record<string, unknown> } = {},
): Promise<CriarNumeradasResultado> {
  if (!acordoBase?.id)        return { ok: false, erro: 'Acordo base não informado' };
  if (!acordoBase.empresa_id) return { ok: false, erro: 'Acordo sem empresa vinculada' };
  if (!entradas.length)       return { ok: false, erro: 'Nenhuma parcela para criar' };
  for (const p of entradas) {
    if (!(p.numero > 0))  return { ok: false, erro: 'Parcela sem número válido' };
    if (!p.vencimento)    return { ok: false, erro: `Parcela ${p.numero}: informe o vencimento` };
    if (!(p.valor > 0))   return { ok: false, erro: `Parcela ${p.numero}: informe um valor válido` };
  }

  const grupo = await garantirGrupo(acordoBase);
  if ('erro' in grupo) return { ok: false, erro: grupo.erro };

  const total = Math.max(
    acordoBase.parcelas ?? 1,
    ...entradas.map(p => p.numero),
  );

  const payloads = entradas.map(p => ({
    ...payloadNovaParcela(acordoBase, p, grupo.grupoId, p.numero, total),
    // Entrada e afins vêm por fora: `payloadNovaParcela` zera `valor_total`
    // porque parcela avulsa fica fora de rateio, e no acordo com entrada esse
    // campo é do GRUPO inteiro.
    ...(opts.camposExtras ?? {}),
  }));

  const { data, error } = await supabase
    .from('acordos')
    .insert(payloads as never)
    .select('*, perfis(id, nome, email, perfil, setor_id)');
  if (error) return { ok: false, erro: `Erro ao criar parcelas: ${error.message}` };

  const criadas: Acordo[] = Array.isArray(data)
    ? data as Acordo[]
    : (data ? [data as Acordo] : []);
  return { ok: true, criadas };
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
