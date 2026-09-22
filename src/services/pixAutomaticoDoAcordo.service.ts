/**
 * pixAutomaticoDoAcordo.service.ts — o acordo recorrente entra sozinho no Pix.
 *
 * ## Por que existe
 *
 * PIX Automático e Cartão Recorrente pagam comissão pela aba Pix Automático
 * (`pix_automatico_acordos`), não pela lista de acordos. Até 14/09/2026 a tela
 * de acordos só AVISAVA depois de gravar (`ModalAvisoPixAutomatico`), e o
 * pessoal seguia lançando só na lista — o líder ficava sem o acordo na
 * conferência e o operador sem a comissão.
 *
 * A liderança pediu o registro automático, «mantendo as mesmas regras» da aba.
 * Por isso nada aqui é regra nova: é o mesmo caminho do botão «Registrar» de
 * `PixAutomatico.tsx`, na mesma ordem.
 *
 *   1. Interruptor do setor (`permite_registro_operador`) desligado barra o
 *      operador — quem age sobre registro alheio passa, como na aba;
 *   2. O trigger `fn_pix_nr_bloqueia_duplicado` decide a duplicidade:
 *        • NR já é desta pessoa → nada a fazer, o registro já existe;
 *        • NR é de outra pessoa → pedido de autorização aos líderes;
 *   3. O registro nasce `pendente`: o líder ainda confere, como qualquer outro.
 *
 * O valor gravado é o do acordo — e o formulário só deixa salvar a forma
 * recorrente com a confirmação de que ele é o TOTAL (ver `FormBP`).
 *
 * ## Também ao virar pago (22/09/2026)
 *
 * Até aqui o registro só acontecia ao CRIAR o acordo, e o acordo criado como
 * "Não pago" não entra. Quem lançava assim e depois marcava "Pago" — pelo
 * botão da lista, pelo detalhe ou pela edição — ficava fora do Pix, e os
 * acordos anteriores a 14/09 também. `registrarAcordoPagoNoPix` é o mesmo
 * registro, disparado pela mudança de status.
 */

import { supabase } from '@/lib/supabase';
import { ehFormaRecorrente } from '@/lib/formasRecorrentes';
import {
  criarAcordoPix, fetchConfigsPix, pedirAutorizacaoNr,
} from '@/services/pix_automatico.service';

export type ResultadoPixDoAcordo =
  /** Registro criado, aguardando verificação do líder. */
  | { tipo: 'registrado' }
  /** O NR já estava no Pix desta pessoa: não se registra duas vezes. */
  | { tipo: 'ja_registrado' }
  /** NR de outra pessoa: o pedido foi para os líderes decidirem. */
  | { tipo: 'pedido_enviado' }
  /** Não entrou no Pix. `motivo` é a frase para a tela. */
  | { tipo: 'nao_registrado'; motivo: string };

export async function registrarAcordoNoPixAutomatico(p: {
  empresaId: string;
  operadorId: string;
  operadorNome: string;
  setorId: string | null;
  nrCliente: string;
  /** Valor TOTAL do acordo — o formulário exige a confirmação. */
  valor: number;
  /** Acordo tabulado como Extra: etiqueta visual na conferência do Pix. */
  extra?: boolean;
  /** Pode agir sobre registro alheio na aba (escopo `setor`/`todos_setores`). */
  podeAgirSobreOutros: boolean;
  /**
   * Dia do registro (`yyyy-MM-dd`) quando o acordo é de outro mês — o Pix
   * conta o mês por `criado_em`. Omitido = agora. Ver `criarAcordoPix`.
   */
  dia?: string | null;
}): Promise<ResultadoPixDoAcordo> {
  const nr = p.nrCliente.trim();
  if (!nr) return { tipo: 'nao_registrado', motivo: 'O acordo não tem NR para registrar no Pix Automático.' };
  if (!Number.isFinite(p.valor) || p.valor <= 0) {
    return { tipo: 'nao_registrado', motivo: 'O valor do acordo é inválido para o Pix Automático.' };
  }

  // Regra 1 — o interruptor do setor. Mesma expressão de `podeRegistrar`.
  if (!p.podeAgirSobreOutros && p.setorId) {
    const configs = await fetchConfigsPix(p.empresaId);
    const doSetor = configs.find(c => c.setor_id === p.setorId);
    if (doSetor && doSetor.permite_registro_operador === false) {
      return {
        tipo: 'nao_registrado',
        motivo: 'O registro no Pix Automático está desativado para o seu setor — fale com a liderança.',
      };
    }
  }

  // Regra 2 — o trigger é quem sabe de quem é o NR.
  const r = await criarAcordoPix({
    empresaId:    p.empresaId,
    operadorId:   p.operadorId,
    operadorNome: p.operadorNome,
    setorId:      p.setorId,
    nrCliente:    nr,
    valor:        p.valor,
    extra:        p.extra,
    ...(p.dia ? { dia: p.dia } : {}),
  });
  if (r.ok) return { tipo: 'registrado' };
  if (r.nrMesmoOperador) return { tipo: 'ja_registrado' };
  if (r.nrDuplicado) {
    const pedido = await pedirAutorizacaoNr({
      operadorId: p.operadorId,
      nrCliente:  nr,
      valor:      p.valor,
      extra:      p.extra,
    });
    if (pedido.ok) return { tipo: 'pedido_enviado' };
    return { tipo: 'nao_registrado', motivo: pedido.error ?? 'Não foi possível pedir autorização do NR no Pix.' };
  }
  return { tipo: 'nao_registrado', motivo: r.error ?? 'Não foi possível registrar no Pix Automático.' };
}

/** O que `registrarAcordoPagoNoPix` precisa saber do acordo. */
export interface AcordoParaPix {
  tipo: string;
  status: string;
  nr_cliente: string | null;
  valor: number;
  vencimento: string;
  operador_id: string;
  empresa_id?: string | null;
  setor_id?: string | null;
  tipo_vinculo?: string | null;
}

/**
 * O acordo recorrente já gravado passou a contar (virou pago): registra no Pix.
 *
 * `acordo` é o estado DEPOIS da mudança. Devolve `null` quando não há nada a
 * fazer — forma não recorrente, ou status ainda "Não pago" (a mesma régua de
 * `concluirSalvo` e da lista de sem registro da aba).
 *
 * O registro é do DONO do acordo, não de quem clicou: o líder que marca pago
 * pelo operador registra no nome do operador, como no botão da aba. Quem não é
 * o dono e não age sobre registro alheio no Pix nem tenta — o banco recusaria
 * (`pix_auto_insert`) com uma frase que não diz nada.
 *
 * Idempotente: NR que já está no Pix da mesma pessoa volta `ja_registrado`.
 */
export async function registrarAcordoPagoNoPix(p: {
  acordo: AcordoParaPix;
  /** Empresa da tela — vale quando a linha veio sem `empresa_id`. */
  empresaId: string;
  /** Quem está marcando pago. */
  quemAgeId: string;
  podeAgirSobreOutros: boolean;
  /** `yyyy-MM-dd` de hoje. */
  hoje: string;
}): Promise<ResultadoPixDoAcordo | null> {
  const { acordo } = p;
  if (!ehFormaRecorrente(acordo.tipo) || acordo.status === 'nao_pago') return null;

  if (acordo.operador_id !== p.quemAgeId && !p.podeAgirSobreOutros) {
    return {
      tipo: 'nao_registrado',
      motivo: 'só o próprio operador ou a liderança do Pix pode registrar este acordo no Pix Automático.',
    };
  }

  // Nome e setor ATUAIS do dono — os mesmos que o cadastro usa (`perfil`).
  const { data: dono } = await supabase
    .from('perfis')
    .select('nome, email, setor_id')
    .eq('id', acordo.operador_id)
    .maybeSingle();
  const d = dono as { nome?: string | null; email?: string | null; setor_id?: string | null } | null;

  return registrarAcordoNoPixAutomatico({
    empresaId:    acordo.empresa_id ?? p.empresaId,
    operadorId:   acordo.operador_id,
    operadorNome: d?.nome ?? d?.email ?? '—',
    setorId:      d?.setor_id ?? acordo.setor_id ?? null,
    nrCliente:    String(acordo.nr_cliente ?? ''),
    valor:        Number(acordo.valor),
    extra:        acordo.tipo_vinculo === 'extra',
    podeAgirSobreOutros: p.podeAgirSobreOutros,
    // O mês do acordo é o do vencimento. Fora do mês corrente, o registro
    // nasce naquele mês — como a aba faz quando se olha outro mês.
    dia: acordo.vencimento.slice(0, 7) === p.hoje.slice(0, 7) ? null : acordo.vencimento,
  });
}

/**
 * A frase para a tela depois de `registrarAcordoPagoNoPix`.
 *
 * `null` quando não há o que dizer: nada a fazer, ou o NR já estava no Pix —
 * repetir isso a cada "Pago" seria ruído.
 */
export function avisoPixDoAcordoPago(
  r: ResultadoPixDoAcordo | null, nr: string,
): { tipo: 'sucesso' | 'aviso'; texto: string } | null {
  if (!r || r.tipo === 'ja_registrado') return null;
  if (r.tipo === 'registrado') {
    return { tipo: 'sucesso', texto: `NR ${nr} registrado no Pix Automático — aguardando verificação do líder.` };
  }
  if (r.tipo === 'pedido_enviado') {
    return {
      tipo: 'sucesso',
      texto: `O NR ${nr} já está no Pix Automático de outra pessoa — pedido de autorização enviado aos líderes.`,
    };
  }
  return {
    tipo: 'aviso',
    texto: `O acordo está pago, mas o NR ${nr} NÃO entrou no Pix Automático: ${r.motivo} `
      + 'Registre pela aba Pix Automático para não perder a comissão.',
  };
}
