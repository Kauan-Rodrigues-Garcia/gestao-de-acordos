/**
 * desligamento.service.ts — acordos de usuário desligado perdem o vínculo.
 * ─────────────────────────────────────────────────────────────────────────
 * Regra (2026-07-28): quem é marcado como `desligado` deixa de "segurar" os
 * próprios acordos. Duas frentes:
 *
 *   1. NO MOMENTO DO DESLIGAMENTO (`liberarVinculosDeDesligado`)
 *      Desfaz o pareamento Direto/Extra. Ninguém ativo pode ficar pareado a
 *      um operador que saiu da empresa:
 *        • acordos DELE perdem `vinculo_operador_*`;
 *        • acordos de OUTROS que apontavam pra ele perdem a referência e, se
 *          eram EXTRA, são promovidos a DIRETO (mesma regra de
 *          `tratarExclusaoVinculo`) — inclusive assumindo o NR.
 *
 *   2. NA HORA DE TABULAR (`transferirAcordoDeDesligado`)
 *      Se o NR/Código está preso a um desligado, a tabulação do novo operador
 *      passa direto: o acordo antigo vai pra lixeira, é excluído, e o novo é
 *      gravado — SEM modal de autorização de líder.
 *
 * Por que a checagem de "está desligado?" é feita na hora de tabular, e não
 * marcada numa coluna no desligamento: assim vale também pra quem foi
 * desligado antes desta funcionalidade existir, sem precisar de backfill, e
 * não há flag que possa ficar desatualizada.
 *
 * Ver 20260723c_status_usuario.sql e [[tratarExclusaoVinculo]].
 */
import { supabase, type Acordo, type SituacaoUsuario } from '@/lib/supabase';
import { criarNotificacao } from '@/services/notificacoes.service';
import { enviarParaLixeira } from '@/services/lixeira.service';
import { transferirNr, type NrCampo } from '@/services/nr_registros.service';

/** Nome usado no lugar do líder autorizador nos registros automáticos. */
export const AUTOR_AUTOMATICO = 'Sistema — operador desligado';

/**
 * Situação de um operador. Devolve 'ativo' quando não encontra o perfil, para
 * que uma falha de leitura nunca libere transferência sem autorização.
 */
export async function situacaoDoOperador(operadorId: string): Promise<SituacaoUsuario> {
  if (!operadorId) return 'ativo';
  const { data, error } = await supabase
    .from('perfis')
    .select('situacao')
    .eq('id', operadorId)
    .maybeSingle();
  if (error || !data) return 'ativo';
  return ((data as { situacao?: string }).situacao as SituacaoUsuario) ?? 'ativo';
}

/** Atalho de leitura no ponto de decisão. */
export async function operadorEstaDesligado(operadorId: string): Promise<boolean> {
  return (await situacaoDoOperador(operadorId)) === 'desligado';
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Desfazer pareamento Direto/Extra no desligamento
// ─────────────────────────────────────────────────────────────────────────

export interface ResultadoLiberacao {
  /** Acordos do desligado que perderam `vinculo_operador_*`. */
  vinculosLimpos: number;
  /** Acordos de outros operadores promovidos de EXTRA para DIRETO. */
  extrasPromovidos: number;
}

/**
 * Desfaz os vínculos Direto/Extra de um operador desligado.
 *
 * Não mexe em `operador_id` nem apaga acordo nenhum: o recebimento do mês do
 * desligado continua contando nos totais de setor e equipe (é o que a
 * migration 20260723c define). O que sai é só o pareamento.
 */
export async function liberarVinculosDeDesligado(params: {
  perfilId:  string;
  empresaId: string;
  /** PaguePlay casa por `instituicao`; BookPlay por `nr_cliente`. */
  isPaguePlay: boolean;
}): Promise<ResultadoLiberacao> {
  const { perfilId, empresaId, isPaguePlay } = params;
  const saida: ResultadoLiberacao = { vinculosLimpos: 0, extrasPromovidos: 0 };
  if (!perfilId || !empresaId) return saida;

  const campo: NrCampo = isPaguePlay ? 'instituicao' : 'nr_cliente';

  // ── a. Acordos de OUTROS que apontam para o desligado ──────────────────
  // Precisam ser tratados antes de limpar os dele, senão perdemos a chave
  // (instituicao/nr_cliente) que liga os dois lados.
  const { data: apontamParaEle } = await supabase
    .from('acordos')
    .select('id, operador_id, tipo_vinculo, nr_cliente, instituicao')
    .eq('empresa_id', empresaId)
    .eq('vinculo_operador_id', perfilId);

  for (const a of (apontamParaEle ?? []) as Array<Partial<Acordo> & { id: string }>) {
    const ehExtra = (a.tipo_vinculo ?? 'direto') === 'extra';
    const patch: Record<string, unknown> = {
      vinculo_operador_id:   null,
      vinculo_operador_nome: null,
    };
    // EXTRA pareado a um desligado vira DIRETO: passa a ser o titular do NR.
    if (ehExtra) patch.tipo_vinculo = 'direto';

    const { error } = await supabase.from('acordos').update(patch).eq('id', a.id);
    if (error) {
      console.warn('[desligamento] falha ao limpar vínculo de terceiro:', error.message);
      continue;
    }

    if (!ehExtra || !a.operador_id) continue;
    saida.extrasPromovidos++;

    // Titularidade do NR acompanha a promoção.
    const chave = ((isPaguePlay ? a.instituicao : a.nr_cliente) ?? '').trim();
    if (chave) {
      const { data: perf } = await supabase
        .from('perfis').select('nome').eq('id', a.operador_id).maybeSingle();
      await transferirNr({
        empresaId,
        nrValue:          chave,
        campo,
        novoOperadorId:   a.operador_id,
        novoOperadorNome: (perf as { nome?: string } | null)?.nome ?? '',
        novoAcordoId:     a.id,
      });
    }

    try {
      await criarNotificacao({
        usuario_id: a.operador_id,
        empresa_id: empresaId,
        titulo:     'Seu acordo EXTRA virou DIRETO',
        mensagem:
          `O operador com quem você tinha vínculo foi desligado. ` +
          `Seu acordo ${chave ? `(${isPaguePlay ? 'Código' : 'NR'} ${chave}) ` : ''}` +
          `passou a ser DIRETO e você assumiu a titularidade.`,
      });
    } catch (e) {
      console.warn('[desligamento] falha ao notificar promoção de extra', e);
    }
  }

  // ── b. Acordos DELE que apontavam para outros ──────────────────────────
  const { error: errDele, count } = await supabase
    .from('acordos')
    .update({ vinculo_operador_id: null, vinculo_operador_nome: null }, { count: 'exact' })
    .eq('empresa_id', empresaId)
    .eq('operador_id', perfilId)
    .not('vinculo_operador_id', 'is', null);

  if (errDele) console.warn('[desligamento] falha ao limpar vínculos do desligado:', errDele.message);
  else saida.vinculosLimpos = count ?? 0;

  return saida;
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Tabular por cima de um desligado, sem autorização
// ─────────────────────────────────────────────────────────────────────────

export interface TransferenciaAutomatica {
  ok: boolean;
  erro?: string;
  /** Dados do acordo removido, para a mensagem de sucesso. */
  nomeClienteAnterior?: string;
}

/**
 * Move o acordo do desligado para a lixeira e o exclui, liberando o NR para o
 * novo operador. NÃO grava o acordo novo — quem chama segue com o próprio
 * fluxo de salvamento, que já sabe montar o payload.
 *
 * A lixeira registra `autorizado_por_nome` como sistema, deixando claro na
 * auditoria que não houve líder no meio.
 */
export async function transferirAcordoDeDesligado(params: {
  acordoAnteriorId: string;
  empresaId:        string;
  operadorAntId:    string;
  operadorAntNome:  string;
  novoOperadorId:   string;
  novoOperadorNome: string;
  /** 'NR' ou 'Código', só para o texto da notificação. */
  labelNr:  string;
  valorNr:  string;
}): Promise<TransferenciaAutomatica> {
  const {
    acordoAnteriorId, empresaId, operadorAntId, operadorAntNome,
    novoOperadorId, novoOperadorNome, labelNr, valorNr,
  } = params;

  const { data: anterior, error: errBusca } = await supabase
    .from('acordos')
    .select('id, nome_cliente, valor, vencimento, status, operador_id, empresa_id, nr_cliente, instituicao')
    .eq('id', acordoAnteriorId)
    .maybeSingle();

  if (errBusca) return { ok: false, erro: errBusca.message };
  if (!anterior) return { ok: false, erro: 'Acordo anterior não encontrado' };

  const acordo = anterior as Acordo;
  const valorFmt = acordo.valor != null
    ? `R$ ${Number(acordo.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—';

  await enviarParaLixeira({
    acordo,
    motivo:              'transferencia_nr',
    operadorNome:        operadorAntNome,
    autorizadoPorNome:   AUTOR_AUTOMATICO,
    transferidoParaId:   novoOperadorId,
    transferidoParaNome: novoOperadorNome,
  });

  const { error: errDel } = await supabase.from('acordos').delete().eq('id', acordoAnteriorId);
  if (errDel) return { ok: false, erro: errDel.message };

  await supabase.from('logs_sistema').insert({
    usuario_id:  novoOperadorId,
    acao:        'transferencia_nr_desligado',
    tabela:      'acordos',
    registro_id: acordoAnteriorId,
    empresa_id:  empresaId,
    detalhes: {
      nr:                     valorNr,
      nome_cliente:           acordo.nome_cliente ?? '—',
      valor:                  valorFmt,
      motivo:                 'operador anterior desligado',
      sem_autorizacao_lider:  true,
      operador_anterior:      operadorAntId,
      operador_anterior_nome: operadorAntNome,
      operador_novo:          novoOperadorId,
      operador_novo_nome:     novoOperadorNome,
      empresa_id:             empresaId,
    },
  }).then(({ error }) => {
    if (error) console.warn('[desligamento] falha ao registrar log:', error.message);
  });

  // O desligado não acessa mais o sistema, mas a notificação fica no histórico
  // e aparece pra liderança que consulta o perfil dele.
  //
  // try/catch e não .catch(): neste ponto o acordo antigo JÁ foi excluído, e
  // uma falha aqui não pode derrubar a operação — devolveríamos erro pro
  // chamador com o acordo já apagado, e ele não gravaria o novo.
  try {
    await criarNotificacao({
      usuario_id: operadorAntId,
      empresa_id: empresaId,
      titulo:     `${labelNr} "${valorNr}" reatribuído`,
      mensagem:
        `Como você está marcado como desligado, o ${labelNr} "${valorNr}" ` +
        `(${acordo.nome_cliente ?? '—'}) foi assumido por ${novoOperadorNome}. ` +
        `O acordo anterior foi movido para a lixeira. Valor: ${valorFmt}.`,
    });
  } catch (e) {
    console.warn('[desligamento] falha ao notificar operador desligado', e);
  }

  return { ok: true, nomeClienteAnterior: acordo.nome_cliente ?? undefined };
}
