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
 *
 * Vale nas duas regras desde 06/11/2026. Na regra Cofen a parcela nova soma
 * no `valor_total` (ver `OpcoesAdicionarParcelas.somarNoTotal`): quem tabulou
 * só o valor da parcela lança a próxima no mesmo acordo.
 */
import { supabase, type Acordo } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { getTodayISO } from '@/lib/index';
import { ehFormaRecorrente } from '@/lib/formasRecorrentes';

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
  | {
      ok: true;
      novasParcelas: Acordo[];
      novoTotal: number;
      /** Só com `somarNoTotal`: o `valor_total` que o grupo passou a ter. */
      novoValorTotal?: number;
      /** A parcela que foi marcada como paga antes da inclusão, quando houve. */
      quitada?: { id: string; dataPagamento: string };
    }
  | { ok: false; erro: string };

/**
 * A parcela em aberto que precisa ser quitada antes da nova entrar.
 *
 * O grupo só tem uma parcela em aberto por vez (ver `adicionarParcelasAoGrupo`).
 * Quando o operador está lançando a próxima e a atual já foi paga, mas ainda
 * não foi marcada, o modal oferece marcar as duas coisas de uma vez.
 */
export interface QuitarAntes {
  parcelaId:     string;
  /** yyyy-MM-dd — vira também o vencimento (recebimento conta no vencimento). */
  dataPagamento: string;
}

export interface OpcoesAdicionarParcelas {
  isPaguePlay: boolean;
  /**
   * Regra Cofen (06/11/2026): a parcela nova SOMA no `valor_total` do acordo.
   *
   * Na Cofen o valor das parcelas sai de `valor_total` dividido pelas
   * `parcelas` (`calcularParcelas`). Quem tabulou só o valor da parcela e
   * agora lança a próxima precisa que o total cresça com ela — senão o acordo
   * diz «2 parcelas» e um total que é o de uma.
   *
   * Para o total continuar sendo a soma das parcelas, a inclusão só acontece
   * com o plano inteiro registrado (sem parcela prevista que ainda não virou
   * registro), sem parcela em aberto e com UMA parcela por vez — ela sempre
   * vira registro, com o valor digitado.
   */
  somarNoTotal?: boolean;
  /** Marca esta parcela como paga antes de incluir a nova. */
  quitarAntes?: QuitarAntes | null;
}

/**
 * Marca uma parcela como paga, do mesmo jeito que o botão de pago da lista:
 * `status`, `data_pagamento` e o vencimento na data do pagamento (recebimento
 * é atribuído ao vencimento). Banco antigo sem `data_pagamento` cai no par
 * status + vencimento, como na lista.
 */
export async function quitarParcela(
  parcelaId: string, dataPagamento: string,
): Promise<{ erro: string } | null> {
  let { error } = await supabase
    .from('acordos')
    .update({ status: 'pago', data_pagamento: dataPagamento, vencimento: dataPagamento } as never)
    .eq('id', parcelaId);
  if (error && (String(error.code) === '42703' || String(error.code) === '400'
      || error.message?.toLowerCase().includes('column'))) {
    ({ error } = await supabase
      .from('acordos')
      .update({ status: 'pago', vencimento: dataPagamento } as never)
      .eq('id', parcelaId));
  }
  return error ? { erro: error.message } : null;
}

/**
 * A frase de sucesso das duas portas (cadastro e detalhe). Fica aqui para as
 * duas dizerem a mesma coisa — o cadastro chegou a anunciar «0 parcelas
 * adicionadas» quando nada virava registro.
 */
export function mensagemDaInclusao(
  r: Extract<AdicionarLoteResultado, { ok: true }>,
  pedidas: number,
): string {
  const novas = r.novasParcelas;
  const quitou = r.quitada ? 'Parcela anterior marcada como paga. ' : '';
  if (novas.length === 0) {
    return `Acordo passou a ${r.novoTotal} parcelas. A próxima será registrada quando a atual for quitada.`;
  }
  const n = novas[0].numero_parcela ?? r.novoTotal;
  if (pedidas > 1) {
    return `${quitou}Parcela ${n}/${r.novoTotal} registrada. As demais entram conforme forem reagendadas.`;
  }
  return `${quitou}Parcela ${n}/${r.novoTotal} adicionada ao acordo!`;
}

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
 * `adicionarParcelasAoGrupo`, que materializa somente a próxima parcela.
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
  // A chave do par (NR ou Código) agora é decidida no servidor; o argumento
  // fica pela assinatura que as telas já usam.
  _opts: { isPaguePlay: boolean },
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
  // reagendamento de parcelas já faz. Falha aqui não desfaz a parcela.
  if (acordoBase.vinculo_operador_id) {
    await espelharParcelaNoVinculo((inserida as Acordo).id);
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
 * O total declarado recebe o lote inteiro, mas no banco nasce no máximo UMA
 * linha: a próxima, e somente quando o grupo não possui parcela pendente. Isso
 * vale igualmente para "Adicionar parcela" e para aumentar a quantidade na
 * edição do acordo. As demais continuam virtuais até a anterior ser quitada.
 *
 * Cada linha recebe seu próprio `numero_parcela`, seguindo o maior já existente
 * no grupo — as parcelas do lote não colidem entre si nem com as antigas.
 */
export async function adicionarParcelasAoGrupo(
  acordoBase: Acordo,
  inputs: readonly NovaParcelaInput[],
  opts: OpcoesAdicionarParcelas,
): Promise<AdicionarLoteResultado> {
  if (!acordoBase?.id)        return { ok: false, erro: 'Acordo base não informado' };
  if (!acordoBase.empresa_id) return { ok: false, erro: 'Acordo sem empresa vinculada' };
  if (!inputs.length)         return { ok: false, erro: 'Nenhuma parcela para adicionar' };
  for (const [i, p] of inputs.entries()) {
    if (!p.vencimento)  return { ok: false, erro: `Parcela ${i + 1}: informe o vencimento` };
    if (!(p.valor > 0)) return { ok: false, erro: `Parcela ${i + 1}: informe um valor válido` };
  }
  const somarNoTotal = !!opts.somarNoTotal;
  if (somarNoTotal && inputs.length > 1) {
    return { ok: false, erro: 'Neste acordo a parcela entra uma de cada vez.' };
  }

  // Quitar primeiro: é o que libera a parcela nova para virar registro. Se a
  // inclusão falhar depois, a parcela continua paga — e o erro diz isso.
  const quitar = opts.quitarAntes ?? null;
  if (quitar) {
    if (!quitar.dataPagamento) return { ok: false, erro: 'Informe a data do pagamento da parcela em aberto' };
    const e = await quitarParcela(quitar.parcelaId, quitar.dataPagamento);
    if (e) return { ok: false, erro: `Erro ao marcar a parcela em aberto como paga: ${e.erro}` };
  }
  const posQuitar = (quitar ? '(A parcela anterior já foi marcada como paga.) ' : '');
  const base: Acordo = quitar?.parcelaId === acordoBase.id
    ? { ...acordoBase, status: 'pago', data_pagamento: quitar.dataPagamento, vencimento: quitar.dataPagamento }
    : acordoBase;

  const grupo = await garantirGrupo(base);
  if ('erro' in grupo) return { ok: false, erro: posQuitar + grupo.erro };
  const { grupoId } = grupo;

  const { data: linhasGrupo, error: errSel } = await supabase
    .from('acordos')
    .select('id, numero_parcela, parcelas, status, valor')
    .eq('empresa_id', base.empresa_id)
    .eq('acordo_grupo_id', grupoId);
  if (errSel) return { ok: false, erro: `${posQuitar}Erro ao consultar parcelas do acordo: ${errSel.message}` };

  const linhas = (linhasGrupo ?? []) as Pick<Acordo, 'id' | 'numero_parcela' | 'parcelas' | 'status' | 'valor'>[];

  const { novoNumero, totalAtual } = medirGrupo(linhas, base);
  // O total declara o lote INTEIRO, mesmo quando nenhuma linha é materializada:
  // é ele que faz as parcelas que faltam aparecerem como virtuais no detalhe.
  const novoTotal = Math.max(novoNumero + inputs.length - 1, totalAtual);

  // Quantas viram registro AGORA: só a próxima — e só se não houver parcela
  // em aberto. Não existe mais um modo que materializa o lote inteiro: deixar
  // essa saída disponível foi o que permitiu a edição 1→15 criar 14 cobranças
  // futuras de uma vez.
  //
  // O grupo pode ainda não ter linha nenhuma no banco (acordo de uma parcela
  // só, sem `acordo_grupo_id` até agora), então o status da base entra na
  // conta junto com o das linhas lidas. A base que acabou de ser quitada entra
  // já como paga.
  const linhasComBase = linhas.some(l => l.id === base.id)
    ? linhas.map(l => (l.id === base.id ? { ...l, status: base.status } : l))
    : [...linhas, base];
  const emAberto = temParcelaEmAberto(linhasComBase);

  // Regra Cofen: a parcela nova soma no total, então ela PRECISA virar
  // registro — parcela virtual na Cofen tem o valor da divisão do total, não o
  // digitado. E o total só é a soma das parcelas se todas forem registros.
  let novoValorTotal: number | undefined;
  if (somarNoTotal) {
    if (emAberto) {
      return {
        ok: false,
        erro: `${posQuitar}A parcela atual deste acordo ainda está em aberto. `
          + 'Marque-a como paga para lançar a próxima.',
      };
    }
    if (novoNumero - 1 < totalAtual) {
      return {
        ok: false,
        erro: `${posQuitar}Este acordo já prevê ${totalAtual} parcelas e só ${novoNumero - 1} estão registradas. `
          + 'Lance a próxima pelo reagendamento da parcela paga, no detalhe do acordo.',
      };
    }
    // O total de antes: o declarado, quando existe (o acordo vindo do analítico
    // no meio do plano tem parcelas anteriores pagas que não são registro);
    // sem ele — quem tabulou só o valor da parcela —, a soma dos registros.
    const antesCentavos = base.valor_total != null
      ? Math.round(Number(base.valor_total) * 100)
      : linhasComBase.reduce((s, l) => s + Math.round(Number(l.valor ?? 0) * 100), 0);
    novoValorTotal = (antesCentavos + Math.round(inputs[0].valor * 100)) / 100;
  }

  // Sem virar registro agora, a forma recorrente não tem onde morar: o Pix
  // Automático seria registrado na aba Pix sem a linha de acordo
  // correspondente. Quem chega aqui pelo modal já foi barrado lá.
  if (emAberto && inputs.some(p => ehFormaRecorrente(p.tipo))) {
    return {
      ok: false,
      erro: 'PIX Automático / Cartão Recorrente só entra como próxima parcela depois que a atual for paga.',
    };
  }

  const aInserir = emAberto ? [] : inputs.slice(0, 1);

  let novas: Acordo[] = [];
  if (aInserir.length > 0) {
    const payloads = aInserir.map((input, i) => ({
      ...payloadNovaParcela(base, input, grupoId, novoNumero + i, novoTotal),
      // A linha nova já nasce com o total novo: o espelho do par Direto/Extra
      // copia o `valor_total` dela.
      ...(novoValorTotal !== undefined ? { valor_total: novoValorTotal } : {}),
    }));

    const { data: inseridas, error: errIns } = await supabase
      .from('acordos')
      .insert(payloads as never)
      .select('*, perfis(id, nome, email, perfil, setor_id)');
    if (errIns) return { ok: false, erro: `${posQuitar}Erro ao adicionar parcelas: ${errIns.message}` };

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
  // Na regra Cofen o `valor_total` do grupo vai junto, no mesmo UPDATE — o
  // gatilho do par Direto/Extra leva os dois para a outra metade.
  if (novoTotal !== totalAtual || novoValorTotal !== undefined) {
    const { error: errTotal } = await supabase
      .from('acordos')
      .update({
        parcelas: novoTotal,
        ...(novoValorTotal !== undefined ? { valor_total: novoValorTotal } : {}),
      } as never)
      .eq('empresa_id', base.empresa_id)
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

  // Espelha no par Direto↔Extra somente a parcela que de fato entrou. A falha
  // de um espelho não desfaz a inclusão.
  if (base.vinculo_operador_id) {
    for (const nova of novas) await espelharParcelaNoVinculo(nova.id);
  }

  return {
    ok: true,
    novasParcelas: novas,
    novoTotal,
    ...(novoValorTotal !== undefined ? { novoValorTotal } : {}),
    ...(quitar ? { quitada: { id: quitar.parcelaId, dataPagamento: quitar.dataPagamento } } : {}),
  };
}

/**
 * Replica a parcela no grupo do operador vinculado (o outro lado do par
 * Direto↔Extra do mesmo NR), mantendo os dois painéis consistentes.
 *
 * Pelo servidor (`fn_acordo_par_espelhar_parcela`, migration 20261030235500).
 * Era um INSERT no acordo do colega feito daqui, que a RLS recusa para
 * operador comum — e a recusa era engolida, então o par ficava sem a parcela
 * sem ninguém saber.
 */
async function espelharParcelaNoVinculo(novaId: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_acordo_par_espelhar_parcela', { p_nova_id: novaId });
  if (error) console.warn('[parcelas.service] espelho do vínculo não gravado:', error.message);
}
