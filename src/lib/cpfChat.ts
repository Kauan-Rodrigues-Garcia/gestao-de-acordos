/**
 * cpfChat.ts — o aviso de CPF no chat de Solicitar Atendimento.
 *
 * ## Por que aqui a regra é diferente da dos acordos
 *
 * Nos acordos o CPF é RECUSADO na hora (migrations 20260803a/b): existe
 * substituto — o código do cliente no ERP — então bloquear não impede
 * ninguém de trabalhar.
 *
 * No chat, bloquear pioraria. Ele é conversa entre pessoas: se a mensagem não
 * passa, o atendimento trava e o dado vai por fora — WhatsApp pessoal, papel,
 * voz — onde não existe trava nenhuma. Então passa, mas com prazo: a tela
 * avisa, e 12 horas depois o banco sobrescreve o texto (migration 20260803d).
 *
 * Este módulo é só o lado da tela. Quem marca e quem apaga é o banco — a regra
 * não pode depender de alguém abrir o sistema.
 */
import { contemCpf } from '@/lib/cpf';

/**
 * Espelha o `INTERVAL '12 hours'` da migration 20260803d.
 *
 * Os dois números precisam andar juntos: este aqui só decide o que o texto
 * PROMETE; quem cumpre é o banco. Mudar um sem o outro faz a tela mentir.
 */
export const HORAS_ATE_EXPURGO = 12;

/** O que a linha da mensagem precisa expor para o aviso funcionar. */
export interface MensagemComCpf {
  conteudo: string;
  tem_cpf?: boolean | null;
  expurgar_em?: string | null;
  expurgado_em?: string | null;
}

export type EstadoCpfMensagem =
  | { estado: 'limpa' }
  | { estado: 'aguardando'; horasRestantes: number; aviso: string }
  | { estado: 'expurgada'; aviso: string };

const AVISO_EXPURGADA =
  'O CPF desta mensagem foi apagado automaticamente. O conteúdo original não existe mais no sistema.';

/** "12 horas", "3 horas", "menos de 1 hora" — sem falso precisão de minutos. */
export function rotuloDeHoras(horas: number): string {
  if (horas <= 0) return 'menos de 1 hora';
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

/**
 * O que mostrar nesta mensagem.
 *
 * `tem_cpf` vem do banco, mas a detecção local também roda: entre o envio e a
 * resposta do servidor a linha ainda não tem a marca, e o aviso precisa
 * aparecer já — é justamente o instante em que a pessoa ainda lembra do que
 * escreveu e pode se corrigir.
 */
export function estadoCpfDaMensagem(
  msg: MensagemComCpf,
  agora: Date = new Date(),
): EstadoCpfMensagem {
  if (msg.expurgado_em) return { estado: 'expurgada', aviso: AVISO_EXPURGADA };

  const marcada = msg.tem_cpf === true || contemCpf(msg.conteudo);
  if (!marcada) return { estado: 'limpa' };

  const horasRestantes = msg.expurgar_em
    ? horasAte(new Date(msg.expurgar_em), agora)
    : HORAS_ATE_EXPURGO;

  return {
    estado: 'aguardando',
    horasRestantes,
    aviso:
      `Esta mensagem contém CPF e, por segurança, será apagada em ${rotuloDeHoras(horasRestantes)}.`,
  };
}

/** Horas inteiras que faltam, arredondando para cima. Nunca negativo. */
function horasAte(alvo: Date, agora: Date): number {
  const ms = alvo.getTime() - agora.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 3_600_000);
}

/**
 * Aviso mostrado ao digitar, antes de enviar.
 *
 * Não impede o envio — só deixa claro o que vai acontecer, para a pessoa poder
 * trocar o CPF pelo código antes de mandar. É a chance mais barata de o dado
 * simplesmente não entrar.
 */
export function avisoAoDigitar(texto: string): string | null {
  if (!contemCpf(texto)) return null;
  return `Detectamos um CPF. Você pode enviar, mas a mensagem será apagada em `
       + `${rotuloDeHoras(HORAS_ATE_EXPURGO)}. Se possível, use o código do cliente.`;
}
