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
import { transferirNr, type NrCampo } from '@/services/nr_registros.service';

/**
 * Nome gravado no lugar do líder autorizador quando a transferência sai pela
 * base "dono desligado". Quem escreve é a RPC — este valor existe aqui só para
 * o teste conferir que os dois lados dizem a mesma coisa.
 */
export const AUTOR_AUTOMATICO = 'Sistema — operador desligado';

/**
 * Situação de um operador.
 *
 * Vai por RPC, não por SELECT direto: a policy `perfis_select` deixa o operador
 * ler só a PRÓPRIA linha, então consultar a situação de outro operador voltava
 * vazio e o desvio de desligado nunca disparava. `fn_situacao_operador` é
 * SECURITY DEFINER e escopada por empresa.
 *
 * Devolve 'ativo' quando não encontra ou falha, para que erro de leitura nunca
 * libere transferência sem autorização. O servidor confere de novo na hora de
 * transferir — isto aqui só decide qual tela mostrar.
 */
export async function situacaoDoOperador(operadorId: string): Promise<SituacaoUsuario> {
  if (!operadorId) return 'ativo';
  const { data, error } = await supabase.rpc('fn_situacao_operador', {
    p_operador_id: operadorId,
  });
  if (error || !data) return 'ativo';
  return (data as SituacaoUsuario) ?? 'ativo';
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

/** Retorno cru da RPC de transferência. */
export interface RetornoTransferencia {
  ok:                 boolean;
  erro?:              string;
  base?:              'dono_desligado' | 'lider';
  operador_anterior?: string;
  operador_ant_nome?: string;
  nome_cliente?:      string | null;
  valor?:             number | null;
  vencimento?:        string | null;
  status?:            string | null;
  nr?:                string | null;
}

/** Mensagens amigáveis para os códigos de erro devolvidos pela RPC. */
const ERROS: Record<string, string> = {
  sem_sessao:            'Sessão expirada. Faça login novamente.',
  acordo_inexistente:    'O acordo anterior não existe mais — ele pode já ter sido removido.',
  empresa_negada:        'Este acordo é de outra empresa.',
  destinatario_invalido: 'O operador de destino não pertence a esta empresa.',
  nao_autorizado:        'Sem autorização para assumir este acordo.',
};

export function mensagemErroTransferencia(codigo?: string): string {
  return (codigo && ERROS[codigo]) || codigo || 'Falha ao transferir o acordo';
}

/**
 * Executa a transferência no servidor.
 *
 * `token` opcional: quando informado, a RPC é chamada COM AQUELE token em vez
 * da sessão atual. É assim que a autorização por líder funciona — o formulário
 * autentica o líder por senha, recebe o token e o repassa aqui. Passar só o id
 * do líder não serviria: qualquer operador saberia um id e burlaria a senha.
 *
 * Sem token, vale a sessão atual e a única base aceita é "dono desligado".
 */
export async function transferirAcordoNoServidor(params: {
  acordoId:        string;
  novoOperadorId?: string;
  motivo?:         'transferencia_nr' | 'troca_extra';
  token?:          string;
}): Promise<RetornoTransferencia> {
  const { acordoId, novoOperadorId, motivo = 'transferencia_nr', token } = params;
  const corpo = {
    p_acordo_id:        acordoId,
    p_novo_operador_id: novoOperadorId ?? null,
    p_motivo:           motivo,
  };

  if (!token) {
    const { data, error } = await supabase.rpc('fn_transferir_acordo_nr', corpo);
    if (error) return { ok: false, erro: error.message };
    return (data as RetornoTransferencia) ?? { ok: false, erro: 'resposta_vazia' };
  }

  // Com token de líder: fetch direto, para não trocar a sessão do operador.
  const url  = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/fn_transferir_acordo_nr`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        apikey:          anon,
        Authorization:   `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
    });
    if (!res.ok) return { ok: false, erro: `Erro na transferência (${res.status})` };
    return (await res.json()) as RetornoTransferencia;
  } catch {
    return { ok: false, erro: 'Falha de rede ao transferir o acordo' };
  }
}

/**
 * Assume para si o acordo de um operador desligado.
 *
 * O trabalho pesado (lixeira, exclusão, log) roda na RPC: nem o SELECT nem o
 * DELETE do acordo alheio passam pela RLS do operador. NÃO grava o acordo novo
 * — quem chama segue com o próprio fluxo de salvamento, que sabe montar o
 * payload e tem permissão de inserir para si mesmo.
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
    acordoAnteriorId, empresaId, operadorAntId,
    novoOperadorId, novoOperadorNome, labelNr, valorNr,
  } = params;

  const r = await transferirAcordoNoServidor({
    acordoId:       acordoAnteriorId,
    novoOperadorId: novoOperadorId,
  });
  if (!r.ok) return { ok: false, erro: mensagemErroTransferencia(r.erro) };

  const valorFmt = r.valor != null
    ? `R$ ${Number(r.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—';

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
        `(${r.nome_cliente ?? '—'}) foi assumido por ${novoOperadorNome}. ` +
        `O acordo anterior foi movido para a lixeira. Valor: ${valorFmt}.`,
    });
  } catch (e) {
    console.warn('[desligamento] falha ao notificar operador desligado', e);
  }

  return { ok: true, nomeClienteAnterior: r.nome_cliente ?? undefined };
}
