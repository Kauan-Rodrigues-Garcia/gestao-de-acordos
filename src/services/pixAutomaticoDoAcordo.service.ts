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
 */

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
