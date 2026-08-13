/**
 * transferenciaUsuario.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mover uma pessoa de setor ou de empresa, sem perder o rastro nem o dinheiro.
 *
 * ## O que existia antes (e por que não servia)
 *
 * "Transferir" era mudar o campo Setor ou Empresa no modal de editar usuário, e
 * cada um fazia uma coisa diferente, calado:
 *
 *   • SETOR   → zerava `equipe_id` e mais nada. Os acordos ficavam carimbados no
 *               setor antigo (`acordos.setor_id` alimenta o Dashboard, o Painel
 *               Líder e o `useAnalytics`) e contavam lá para sempre. Os clones
 *               em `equipe_operadores_clones` também ficavam, então a pessoa
 *               seguia somando no setor emprestado.
 *   • EMPRESA → apagava SEMPRE os acordos da anterior, sem perguntar.
 *
 * Nenhum dos dois deixava registro, então não havia como desfazer.
 *
 * ## As duas escolhas, e o que cada uma faz
 *
 * **Levar os acordos** (só troca de setor): tudo vai junto — as tabulações
 * mudam de setor com a pessoa e os VÍNCULOS ficam de pé. Caso raro, para quando
 * o setor inteiro de alguém muda de nome na prática.
 *
 * **Chegar limpo** (padrão, e o único caminho na troca de empresa): baixa o
 * relatório das tabulações, apaga o histórico e libera os NRs para outros
 * tabularem. Mesmo caminho da exclusão de usuário (20260805c) — e a mesma ordem
 * é a garantia: **o relatório é gerado e baixado ANTES de qualquer DELETE**. Se
 * ele falhar, nada é apagado e dá para tentar de novo, em vez de descobrir que
 * se perdeu o que não se conseguiu ler.
 *
 * ## Troca de empresa é sempre limpa
 *
 * Levar acordo de uma empresa para a outra significaria mover registro de
 * cliente entre dois CNPJs: `acordos.empresa_id`, mais `nr_registros` (que tem
 * UNIQUE por empresa e pode colidir), mais `tag_ids` apontando para tags que a
 * empresa nova não tem. Decisão de 13/08/2026: não existe essa opção.
 *
 * ## O que NÃO sai, nunca
 *
 * `analitico_recebimentos` e `diario_recebimentos`. O recebimento é do
 * relatório do ERP, não da pessoa — ele continua no total da empresa e no do
 * setor. Na equipe, quem cuida é o fantasma (`fantasmaTransferencia.ts`).
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import {
  buscarAcordosDoUsuario, baixarRelatorioAcordos, traduzirErro,
} from './exclusaoUsuario.service';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface AlvoTransferencia {
  perfilId: string;
  nome: string;
  usuario: string | null;
  origemEmpresaId: string;
  origemSetorId: string | null;
  origemEquipeId: string | null;
  destinoEmpresaId: string;
  destinoSetorId: string | null;
}

/** O que a transferência vai encontrar — mostrado ANTES de confirmar. */
export interface PreviaTransferencia {
  tipo: 'setor' | 'empresa';
  acordos: number;
  clones: number;
  /**
   * Motivo para NÃO deixar confirmar. `null` = caminho livre.
   *
   * O caso real: `perfis` tem UNIQUE (usuario, empresa_id) e o login
   * `robson_cofen` existe nas DUAS empresas hoje. Sem esta checagem, transferir
   * esse login estoura com erro cru do Postgres depois de a tela já ter dito
   * que ia dar certo.
   */
  impedimento: string | null;
}

export type ResultadoTransferencia =
  | {
      status: 'ok';
      transferenciaId: string | null;
      acordosApagados: number;
      acordosMovidos: number;
      clonesRemovidos: number;
      relatorio: string | null;
      /** Registro falhou mas a transferência aconteceu — não há desfazer. */
      avisoRegistro: string | null;
    }
  | { status: 'falha'; mensagem: string };

/**
 * Clone guardado para o desfazer recolocar.
 *
 * A assinatura de índice existe porque a coluna é JSONB e o tipo gerado exige
 * `Json` — sem ela o objeto não é atribuível, apesar de ser JSON válido.
 */
interface CloneSalvo {
  equipe_id: string;
  conta_recebimento: boolean;
  [chave: string]: Json;
}

/** 'yyyy-MM' de hoje — o mês em que o fantasma vale. */
function mesDeHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function tipoDaTransferencia(alvo: AlvoTransferencia): 'setor' | 'empresa' {
  return alvo.origemEmpresaId !== alvo.destinoEmpresaId ? 'empresa' : 'setor';
}

// ── Prévia ───────────────────────────────────────────────────────────────────

/**
 * Quanto seria movido, e se dá para mover.
 *
 * A tela mostra os números na confirmação em vez de um "tem certeza?" genérico
 * — mesma escolha de `resumoExclusao`. Falha de leitura NÃO vira impedimento:
 * ela deixa os contadores em zero e a confirmação segue, porque o caminho de
 * escrita tem as próprias travas e um erro de rede aqui não é motivo para
 * travar a operação inteira.
 */
export async function preverTransferencia(
  alvo: AlvoTransferencia,
): Promise<PreviaTransferencia> {
  const tipo = tipoDaTransferencia(alvo);

  const [acordosRes, clonesRes, colisao] = await Promise.all([
    supabase.from('acordos').select('id', { count: 'exact', head: true })
      .eq('operador_id', alvo.perfilId).eq('empresa_id', alvo.origemEmpresaId),
    supabase.from('equipe_operadores_clones').select('id', { count: 'exact', head: true })
      .eq('operador_id', alvo.perfilId),
    checarColisaoDeLogin(alvo, tipo),
  ]);

  return {
    tipo,
    acordos: acordosRes.count ?? 0,
    clones:  clonesRes.count ?? 0,
    impedimento: colisao,
  };
}

/** `null` = pode transferir. Texto = o que impede, em português. */
async function checarColisaoDeLogin(
  alvo: AlvoTransferencia, tipo: 'setor' | 'empresa',
): Promise<string | null> {
  if (tipo !== 'empresa' || !alvo.usuario) return null;

  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome')
    .eq('usuario', alvo.usuario)
    .eq('empresa_id', alvo.destinoEmpresaId)
    .neq('id', alvo.perfilId)
    .maybeSingle();

  // Sem permissão para ler a outra empresa é o caso comum de quem não é
  // super_admin. Deixar passar: o índice único barra no banco de qualquer jeito,
  // e `executarTransferencia` traduz o erro.
  if (error || !data) return null;

  return `O login "${alvo.usuario}" já pertence a ${
    (data as { nome: string }).nome
  } na empresa de destino. Renomeie um dos dois antes de transferir.`;
}

// ── Execução ─────────────────────────────────────────────────────────────────

/**
 * Faz a transferência inteira.
 *
 * A ordem não é arbitrária — cada passo só acontece depois que o anterior deixou
 * de poder falhar de um jeito que perca dado:
 *
 *   1. relatório (quando vai chegar limpo) — falhou aqui, NADA foi tocado;
 *   2. `perfis`: empresa, setor, equipe. É a mudança que a tela promete;
 *   3. clones — guardados antes de sair, para o desfazer recolocar;
 *   4. acordos: apagar (limpo) ou recarimbar o setor (levar);
 *   5. registro. Por último de propósito: ele grava `acordos_apagados`, que só
 *      existe depois do passo 4.
 *
 * Falhar no passo 5 não desfaz nada — a transferência aconteceu. O retorno diz
 * isso em `avisoRegistro`, e a tela mostra: sem registro não há desfazer, e o
 * admin precisa saber disso na hora, não no dia em que tentar desfazer.
 */
export async function executarTransferencia(params: {
  alvo: AlvoTransferencia;
  /** Só vale para troca de setor. Empresa é sempre limpa. */
  levarAcordos: boolean;
  executadoPorId: string | null;
}): Promise<ResultadoTransferencia> {
  const { alvo, executadoPorId } = params;
  const tipo = tipoDaTransferencia(alvo);
  // Empresa nunca leva: mover acordo entre CNPJs não é uma opção deste produto.
  const levarAcordos = tipo === 'setor' && params.levarAcordos;

  // Setor de destino é obrigatório. Sem ele a pessoa fica fora de TODO painel
  // escopado por setor — some do analítico, do Painel Líder e das metas — e é um
  // estado que ninguém escolhe de propósito. A tela também trava o botão; a
  // trava vive aqui porque é aqui que a escrita acontece.
  if (!alvo.destinoSetorId) {
    return {
      status: 'falha',
      mensagem: 'Escolha o setor de destino. Transferir sem setor deixaria o usuário '
        + 'fora de todos os painéis por setor.',
    };
  }

  // ── 1. Relatório, antes de qualquer DELETE ────────────────────────────────
  let relatorio: string | null = null;
  if (!levarAcordos) {
    try {
      const acordos = await buscarAcordosDoUsuario(alvo.perfilId, alvo.origemEmpresaId);
      if (acordos.length) {
        relatorio = await baixarRelatorioAcordos(
          alvo.nome, acordos, tipo === 'empresa' ? 'empresa-anterior' : 'setor-anterior',
        );
      }
    } catch (e) {
      return {
        status: 'falha',
        mensagem: 'Não foi possível gerar o relatório das tabulações, então NADA foi '
          + `transferido. ${e instanceof Error ? e.message : ''}`.trim(),
      };
    }
  }

  // ── 2. O perfil muda de lugar ─────────────────────────────────────────────
  const moveu = await moverPerfil(alvo, tipo);
  if (moveu.erro) return { status: 'falha', mensagem: moveu.erro };

  // ── 3. Clones ─────────────────────────────────────────────────────────────
  const clonesRemovidos = await limparClones(alvo.perfilId);

  // ── 4. Acordos ────────────────────────────────────────────────────────────
  let acordosApagados = moveu.acordosApagados;
  let acordosMovidos  = 0;
  if (levarAcordos) {
    acordosMovidos = await recarimbarSetorDosAcordos(alvo);
  } else if (tipo === 'setor') {
    // Mesmo com zero acordos próprios a RPC precisa rodar: o perfil pode ser o
    // DIRETO/EXTRA referenciado por um acordo de outra pessoa. A migration
    // 20260813f limpa esse vínculo sobrevivente na mesma transação do DELETE.
    const apagados = await apagarAcordos(alvo);
    if (apagados.erro) {
      // O perfil JÁ mudou. Dizer as duas coisas: a transferência valeu, a
      // limpeza não — senão o admin acha que nada aconteceu e repete.
      return {
        status: 'falha',
        mensagem: `Usuário transferido, mas as tabulações anteriores NÃO foram apagadas. `
          + `${apagados.erro} O relatório${relatorio ? ` (${relatorio})` : ''} já foi baixado.`,
      };
    }
    acordosApagados = apagados.total;
  }

  // ── 5. Registro ───────────────────────────────────────────────────────────
  const registro = await registrarTransferencia({
    alvo, tipo, levarAcordos, acordosApagados, relatorio,
    clonesRemovidos, executadoPorId,
  });

  return {
    status: 'ok',
    transferenciaId: registro.id,
    acordosApagados,
    acordosMovidos,
    clonesRemovidos: clonesRemovidos.length,
    relatorio,
    avisoRegistro: registro.erro,
  };
}

/**
 * Move o perfil — por caminhos diferentes conforme atravesse ou não a empresa.
 *
 * ## Por que dois caminhos
 *
 * `perfis` tem o trigger `block_empresa_id_update`, que recusa QUALQUER mudança
 * de `empresa_id`. Ele é anterior a esta feature e está certo no que protege:
 * `empresa_id` é a fronteira entre os dois CNPJs. O efeito colateral é que a
 * troca de empresa nunca funcionou neste projeto — o campo "Empresa" do modal
 * de editar usuário existia desde 05/08/2026 e sempre morria nessa linha.
 *
 *   • **mesma empresa** → UPDATE direto. O trigger não dispara (o valor não
 *     muda) e a RLS de `perfis` faz o trabalho dela: `perfis_admin_all` para
 *     administrador, `perfis_lider_update` para líder/elite/gerência dentro do
 *     próprio setor. Passar isto para uma função SECURITY DEFINER significaria
 *     reescrever essas regras à mão — e errar uma delas abre o que a RLS fecha.
 *   • **outra empresa** → `fn_transferencia_mover_empresa` (20260813c). Ela liga
 *     uma chave local à transação que o trigger reconhece, confere super_admin,
 *     confere que o setor é DA empresa de destino e checa a colisão de login.
 *     Precisa ser SECURITY DEFINER de qualquer jeito: o WITH CHECK de
 *     `perfis_admin_all` exige `empresa_id = fn_user_empresa_id()`, então a
 *     escrita com a empresa NOVA seria recusada mesmo com o trigger liberado.
 */
async function moverPerfil(
  alvo: AlvoTransferencia, tipo: 'setor' | 'empresa',
): Promise<{ erro: string | null; acordosApagados: number }> {
  if (tipo === 'empresa') {
    const cliente = supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{
        data: unknown; error: { message: string } | null;
      }>;
    };
    try {
      const { data, error } = await cliente.rpc('fn_transferencia_mover_empresa', {
        p_perfil_id:  alvo.perfilId,
        p_empresa_id: alvo.destinoEmpresaId,
        p_setor_id:   alvo.destinoSetorId,
      });
      const retorno = data && typeof data === 'object'
        ? data as { acordos_apagados?: unknown }
        : null;
      return {
        erro: error ? traduzirTransferencia(error.message) : null,
        acordosApagados: error ? 0 : Number(retorno?.acordos_apagados) || 0,
      };
    } catch (e) {
      return {
        erro: e instanceof Error ? e.message : String(e),
        acordosApagados: 0,
      };
    }
  }

  // `equipe_id: null` porque a equipe pertence ao setor de origem. Quem devolve
  // a pessoa ao card daquela equipe no mês corrente é o fantasma, não este campo.
  const { data, error } = await supabase
    .from('perfis')
    .update({ setor_id: alvo.destinoSetorId, equipe_id: null })
    .eq('id', alvo.perfilId)
    .select('id');

  if (error) return { erro: traduzirTransferencia(error.message), acordosApagados: 0 };
  if (!data?.length) {
    return { erro: 'Sem permissão para transferir este usuário.', acordosApagados: 0 };
  }
  return { erro: null, acordosApagados: 0 };
}

/** Tira a pessoa de toda equipe em que era clone, devolvendo o que tirou. */
async function limparClones(perfilId: string): Promise<CloneSalvo[]> {
  const { data, error } = await supabase
    .from('equipe_operadores_clones')
    .select('id, equipe_id, conta_recebimento')
    .eq('operador_id', perfilId);

  if (error || !data?.length) return [];

  const salvos = (data as { equipe_id: string; conta_recebimento: boolean | null }[])
    .map(c => ({ equipe_id: c.equipe_id, conta_recebimento: c.conta_recebimento !== false }));

  const { error: errDel } = await supabase
    .from('equipe_operadores_clones').delete().eq('operador_id', perfilId);

  // Clone que sobra faz a pessoa continuar contando no setor emprestado. Não é
  // motivo para abortar (o perfil já mudou), mas o registro fica sem eles para
  // o desfazer não recolocar o que nunca saiu.
  if (errDel) {
    console.warn('[transferencia] clones não removidos:', errDel.message);
    return [];
  }
  return salvos;
}

/**
 * "Levar os acordos": as tabulações mudam de setor junto com a pessoa.
 *
 * Só `setor_id`. `tipo_vinculo` e `vinculo_operador_id` ficam intactos — o
 * vínculo EXTRA aponta para um operador que não foi transferido, e desfazê-lo
 * quebraria o acordo dele.
 */
async function recarimbarSetorDosAcordos(alvo: AlvoTransferencia): Promise<number> {
  const { data, error } = await supabase
    .from('acordos')
    .update({ setor_id: alvo.destinoSetorId })
    .eq('operador_id', alvo.perfilId)
    .eq('empresa_id', alvo.origemEmpresaId)
    .select('id');

  if (error) {
    console.warn('[transferencia] acordos não recarimbados:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

async function apagarAcordos(
  alvo: AlvoTransferencia,
): Promise<{ total: number; erro: string | null }> {
  // A RPC de 20260805c apaga acordos + histórico numa transação só. É a mesma
  // usada pela exclusão de usuário: os NRs voltam a ficar livres para outros
  // tabularem, que é o ponto de "chegar limpo".
  const cliente = supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{
      data: unknown; error: { message: string } | null;
    }>;
  };
  try {
    const { data, error } = await cliente.rpc('fn_admin_apagar_acordos_do_usuario', {
      p_user_id: alvo.perfilId, p_empresa_id: alvo.origemEmpresaId,
    });
    if (error) return { total: 0, erro: traduzirErro(error.message) };
    return { total: Number(data) || 0, erro: null };
  } catch (e) {
    return { total: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}

async function registrarTransferencia(params: {
  alvo: AlvoTransferencia;
  tipo: 'setor' | 'empresa';
  levarAcordos: boolean;
  acordosApagados: number;
  relatorio: string | null;
  clonesRemovidos: CloneSalvo[];
  executadoPorId: string | null;
}): Promise<{ id: string | null; erro: string | null }> {
  const { alvo, tipo, levarAcordos, acordosApagados, relatorio, clonesRemovidos } = params;

  const { data, error } = await supabase
    .from('perfis_transferencias')
    .insert({
      empresa_id:         alvo.origemEmpresaId,
      perfil_id:          alvo.perfilId,
      // Cópia proposital (20260813d): numa troca de empresa, a origem deixa de
      // enxergar o perfil, e é justamente lá que o fantasma aparece.
      perfil_nome:        alvo.nome,
      mes:                mesDeHoje(),
      tipo,
      origem_setor_id:    alvo.origemSetorId,
      origem_equipe_id:   alvo.origemEquipeId,
      destino_empresa_id: alvo.destinoEmpresaId,
      destino_setor_id:   alvo.destinoSetorId,
      levou_acordos:      levarAcordos,
      acordos_apagados:   acordosApagados,
      relatorio_arquivo:  relatorio,
      clones_removidos:   clonesRemovidos,
      criado_por:         params.executadoPorId,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    const detalhe = /relation|does not exist|schema cache/i.test(error?.message ?? '')
      ? 'Migration 20260813b pendente.'
      : (error?.message ?? 'motivo desconhecido');
    return {
      id: null,
      erro: `A transferência foi feita, mas NÃO ficou registrada (${detalhe}). `
        + 'Sem registro não há como desfazer nem manter o recebimento na equipe de origem.',
    };
  }
  return { id: (data as { id: string }).id, erro: null };
}

// ── Desfazer ─────────────────────────────────────────────────────────────────

export type ResultadoDesfazer =
  | {
      status: 'ok';
      clonesRestaurados: number;
      /** O que o desfazer NÃO alcança. A tela precisa dizer. */
      acordosNaoRestaurados: number;
      relatorio: string | null;
    }
  | { status: 'falha'; mensagem: string };

/**
 * Volta tudo ao estado anterior: empresa, setor, equipe e clones.
 *
 * Vai por RPC porque precisa reescrever perfis de DUAS empresas na mesma
 * transação, e nenhuma sessão enxerga as duas. A checagem de cargo
 * (administrador/super_admin) é feita dentro da função, não aqui.
 *
 * Acordo apagado não volta. O relatório baixado na ida é o registro — e é por
 * isso que ele é gerado antes de qualquer DELETE.
 */
export async function desfazerTransferencia(
  transferenciaId: string,
): Promise<ResultadoDesfazer> {
  const cliente = supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{
      data: unknown; error: { message: string } | null;
    }>;
  };

  let resposta: { data: unknown; error: { message: string } | null };
  try {
    resposta = await cliente.rpc('fn_transferencia_desfazer', {
      p_transferencia_id: transferenciaId,
    });
  } catch (e) {
    return { status: 'falha', mensagem: e instanceof Error ? e.message : String(e) };
  }

  if (resposta.error) {
    return { status: 'falha', mensagem: traduzirTransferencia(resposta.error.message) };
  }

  const d = (resposta.data ?? {}) as {
    clones_restaurados?: number;
    acordos_nao_restaurados?: number;
    relatorio?: string | null;
  };
  return {
    status: 'ok',
    clonesRestaurados:     Number(d.clones_restaurados) || 0,
    acordosNaoRestaurados: Number(d.acordos_nao_restaurados) || 0,
    relatorio:             d.relatorio ?? null,
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface TransferenciaRegistrada {
  id: string;
  perfilId: string;
  /** Nome no momento da transferência. `null` em linha anterior à 20260813d. */
  perfilNome: string | null;
  mes: string;
  tipo: 'setor' | 'empresa';
  origemEmpresaId: string;
  origemSetorId: string | null;
  origemEquipeId: string | null;
  destinoEmpresaId: string;
  destinoSetorId: string | null;
  levouAcordos: boolean;
  acordosApagados: number;
  relatorio: string | null;
  fantasmaAtivo: boolean;
  desfeitaEm: string | null;
  criadoEm: string;
}

/**
 * Transferências de uma empresa, mais recentes primeiro.
 *
 * Tolerante à migration pendente: lista vazia em vez de tela quebrada, mesmo
 * padrão de `buscarExclusoesSetor`.
 */
export async function listarTransferencias(
  empresaId: string, limite = 50,
): Promise<TransferenciaRegistrada[]> {
  const { data, error } = await supabase
    .from('perfis_transferencias')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .limit(limite);

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map(linhaParaRegistro);
}

/** Transferências de UMA pessoa — o histórico dela no modal. */
export async function listarTransferenciasDoPerfil(
  perfilId: string,
): Promise<TransferenciaRegistrada[]> {
  const { data, error } = await supabase
    .from('perfis_transferencias')
    .select('*')
    .eq('perfil_id', perfilId)
    .order('criado_em', { ascending: false });

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(linhaParaRegistro);
}

function linhaParaRegistro(l: Record<string, unknown>): TransferenciaRegistrada {
  return {
    id:               String(l.id),
    perfilId:         String(l.perfil_id),
    perfilNome:       (l.perfil_nome as string | null) ?? null,
    mes:              String(l.mes),
    tipo:             l.tipo === 'empresa' ? 'empresa' : 'setor',
    // `empresa_id` na tabela é a empresa de ORIGEM — é ela que sofre o efeito.
    origemEmpresaId:  String(l.empresa_id),
    origemSetorId:    (l.origem_setor_id as string | null) ?? null,
    origemEquipeId:   (l.origem_equipe_id as string | null) ?? null,
    destinoEmpresaId: String(l.destino_empresa_id),
    destinoSetorId:   (l.destino_setor_id as string | null) ?? null,
    levouAcordos:     l.levou_acordos === true,
    acordosApagados:  Number(l.acordos_apagados) || 0,
    relatorio:        (l.relatorio_arquivo as string | null) ?? null,
    fantasmaAtivo:    l.fantasma_ativo !== false,
    desfeitaEm:       (l.desfeita_em as string | null) ?? null,
    criadoEm:         String(l.criado_em),
  };
}

/**
 * O líder tira da equipe dele o recebimento de quem foi transferido.
 *
 * Não apaga nada: só desliga o fantasma. O recebimento continua no total da
 * empresa e do setor — ele apenas deixa de aparecer na equipe de origem, que é
 * exatamente a pergunta que o líder está respondendo.
 */
export async function removerFantasma(
  transferenciaId: string, usuarioId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('perfis_transferencias')
    .update({
      fantasma_ativo:        false,
      fantasma_removido_por: usuarioId,
      fantasma_removido_em:  new Date().toISOString(),
    })
    .eq('id', transferenciaId);
  return { error: error?.message ?? null };
}

/** O líder devolve o recebimento à equipe — desfaz o passo acima. */
export async function restaurarFantasma(
  transferenciaId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('perfis_transferencias')
    .update({
      fantasma_ativo:        true,
      fantasma_removido_por: null,
      fantasma_removido_em:  null,
    })
    .eq('id', transferenciaId);
  return { error: error?.message ?? null };
}

/** Texto cru do Postgres → frase que diz o que fazer. */
export function traduzirTransferencia(mensagem: string): string {
  if (/idx_perfis_usuario_empresa|duplicate key/i.test(mensagem)) {
    return 'Já existe um usuário com esse login na empresa de destino. '
      + 'Renomeie um dos dois e tente de novo.';
  }
  // O trigger `block_empresa_id_update` sem a exceção da 20260813c. A frase
  // dele ("Não é permitido alterar o empresa_id") não diz o que fazer.
  if (/alterar o empresa_id/i.test(mensagem)) {
    return 'Migration 20260813c pendente — sem ela o banco recusa qualquer troca de '
      + 'empresa, inclusive esta. Aplique-a no Supabase.';
  }
  if (/fn_transferencia_mover_empresa/i.test(mensagem)
      && /could not find|does not exist/i.test(mensagem)) {
    return 'Migration 20260813c pendente — aplique-a no Supabase para transferir '
      + 'usuários entre empresas.';
  }
  if (/could not find the function|does not exist|schema cache/i.test(mensagem)) {
    return 'Migration 20260813b pendente — aplique-a no Supabase para transferir usuários.';
  }
  if (/sem permiss[aã]o/i.test(mensagem)) return mensagem;
  if (/escolha o setor de destino/i.test(mensagem)) {
    return 'Escolha o setor de destino.';
  }
  if (/n[aã]o pertence [aà] empresa de destino/i.test(mensagem)) {
    return 'O setor escolhido não pertence à empresa de destino. Recarregue a tela '
      + 'e escolha de novo.';
  }
  return `Erro ao transferir: ${mensagem}`;
}
