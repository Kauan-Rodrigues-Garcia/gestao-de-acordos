/**
 * mensagemEmDia.ts — o parabéns de quem está EM DIA, pronto para o WhatsApp.
 *
 * A estrela da lista «Por operador» diz à liderança quem atingiu a média diária
 * necessária. Este texto leva a mesma notícia ao operador: o valor recebido, a
 * régua que ele alcançou e um empurrão para continuar. É uma comunicação
 * positiva de propósito — curta, sem «falta» nem «precisa», que já têm lugar
 * na mensagem dos Quartis.
 *
 * Mesmo formato de `mensagemOperador.ts`: asterisco simples (negrito do
 * WhatsApp) e uma ideia por linha.
 *
 * Só existe texto para quem está em dia. Para os outros a função devolve
 * vazio: um parabéns que a conta não sustenta é pior que nenhum.
 *
 * Função pura. Copiar é assunto de quem chama.
 */
import { formatBRL } from '@/lib/money';
import { fmtDataISO } from '@/pages/Analitico/Diario/helpers';
import type { AvaliacaoEmDia } from './emDiaOperador';
import { mesPorExtenso } from './mensagemOperador';

export interface EntradaMensagemEmDia {
  /** Nome de quem vai receber o texto. */
  nome: string;
  /** `yyyy-MM-dd` na lente Dia; `yyyy-MM` na lente Mês. */
  referencia: string;
  /** A MESMA avaliação que acendeu a estrela na lista. */
  avaliacao: AvaliacaoEmDia;
}

export function montarMensagemEmDia(entrada: EntradaMensagemEmDia): string {
  const { nome, referencia, avaliacao: a } = entrada;
  if (!a.emDia) return '';

  const noDia = a.lente === 'dia';
  const linhas = [
    `⭐ *${nome.trim()}* — EM DIA`,
    noDia ? fmtDataISO(referencia) : mesPorExtenso(referencia),
    '',
    `Parabéns pelos *${formatBRL(a.valor)}* recebidos ${noDia ? 'no dia' : 'no mês'}! 🎉`,
    // No mês, a média entra no texto: é ela que foi comparada com a régua, e
    // «recebeu 11 mil» sozinho não diz a ninguém que isso é estar em dia.
    noDia
      ? `Você atingiu a média diária necessária de *${formatBRL(a.metaDiaria)}*.`
      : `Sua média por dia útil está em *${formatBRL(a.mediaDiaria)}*, e você atingiu `
        + `a média diária necessária de *${formatBRL(a.metaDiaria)}*.`,
    '',
    'Continue mantendo esse desempenho! 💪',
  ];

  return linhas.join('\n');
}
