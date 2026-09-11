/**
 * mensagemEquipe.ts — o card de Desempenho Equipes virando texto de WhatsApp.
 *
 * ## Por que existe
 *
 * A aba Quartis já entrega a cada operador o próprio número
 * (`mensagemOperador.ts`). Faltava a outra metade da conversa: como a EQUIPE
 * está. Sem texto pronto, a liderança repetia o caminho que a mensagem do
 * operador veio acabar — olhar o card e digitar de cabeça.
 *
 * ## É o recado da equipe, não o do operador repetido
 *
 * O texto fala do grupo: recebido, meta, projeção e faixa da equipe, o ritmo
 * que falta, quantas pessoas estão em cada faixa e quem puxa o time. Os números
 * saem da MESMA `detalharEquipe` que desenha o card — uma fonte, dois destinos.
 *
 * ## Um nome só, e é o de cima
 *
 * A mensagem vai para o grupo. O destaque positivo (maior recebimento) é
 * citado; quem está atrás não é — nem o «🎯» que o card mostra à liderança.
 * Apontar no grupo quem está no fim da fila é conversa do líder com a pessoa,
 * não aviso geral. A distribuição por faixa já diz o tamanho do problema sem
 * apontar ninguém.
 *
 * ## Formato
 *
 * As mesmas decisões de `mensagemOperador.ts`: asterisco simples, uma ideia por
 * linha, e o que não existe some em vez de virar «—».
 *
 * Função pura. Copiar é assunto de quem chama.
 */
import { formatBRL } from '@/lib/money';
import type { DetalheEquipe } from './desempenhoEquipe';
import { mesPorExtenso } from './mensagemOperador';

export interface EntradaMensagemEquipe {
  /** Nome da equipe — ou do setor, no card consolidado. */
  titulo: string;
  /** Card consolidado do setor: o texto fala «do setor» em vez de «da equipe». */
  ehSetor?: boolean;
  /** Mês em análise, `yyyy-MM`. */
  mes: string;
  /** O acumulado do card, na unidade principal dele. */
  acumulado: number;
  /** Meta do mês. `null` = sem meta configurada. */
  meta: number | null;
  /**
   * 'Bruto' na PaguePlay, onde o card mostra bruto e H.O. lado a lado.
   * `null` na BookPlay, que não tem duas unidades.
   */
  rotuloUnidade: string | null;
  /** H.O. do acumulado. `null` = não exibir. */
  acumuladoHO: number | null;
  /** O detalhe já calculado — a MESMA fonte que desenha o card. */
  detalhe: DetalheEquipe;
}

function pessoas(qtd: number): string {
  return `${qtd} ${qtd === 1 ? 'pessoa' : 'pessoas'}`;
}

/**
 * Monta o texto.
 *
 * A ordem é a da conversa com o time: onde estamos, como está o ritmo, o que
 * falta para subir, e como a equipe está distribuída.
 */
export function montarMensagemEquipe(entrada: EntradaMensagemEquipe): string {
  const {
    titulo, ehSetor, mes, acumulado, meta, rotuloUnidade, acumuladoHO, detalhe: d,
  } = entrada;
  const linhas: string[] = [];

  linhas.push(`*${titulo.trim()}* — ${mesPorExtenso(mes)}`);
  linhas.push('');

  // ── Onde a equipe está ─────────────────────────────────────────────────────
  const unidade = rotuloUnidade ? ` (${rotuloUnidade})` : '';
  linhas.push(`*Recebido ${ehSetor ? 'do setor' : 'da equipe'}${unidade}:* ${formatBRL(acumulado)}`);
  if (acumuladoHO !== null) linhas.push(`*H.O.:* ${formatBRL(acumuladoHO)}`);
  if (meta !== null && meta > 0) {
    linhas.push(`*Meta:* ${formatBRL(meta)} (${Math.round((acumulado / meta) * 100)}% da meta)`);
  }
  if (d.projecaoPct !== null) {
    const faixa = d.faixaAtual ? ` — ${d.faixaAtual.quartil}º quartil` : '';
    linhas.push(`*Projeção:* ${d.projecaoPct}%${faixa}`);
  }

  // ── Ritmo ──────────────────────────────────────────────────────────────────
  linhas.push('');
  linhas.push('*Ritmo*');
  linhas.push(`• Média por dia útil: ${formatBRL(d.mediaDiaria)}`);
  linhas.push(`• Dias úteis restantes: ${d.diasRestantes}`);
  linhas.push(`• No ritmo de hoje, fecha o mês em ${formatBRL(d.projecaoFechamento)}`);
  if (d.ritmoNecessario !== null) {
    linhas.push(`• Para bater a meta: ${formatBRL(d.ritmoNecessario)} por dia útil restante`);
  } else if (d.faltaMeta === 0) {
    linhas.push('• Meta do mês já batida 🎉');
  }

  // ── Faixas ─────────────────────────────────────────────────────────────────
  // Só «hoje», como o card: os degraus da equipe não têm a coluna «amanhã» que
  // a linha do operador tem, e o texto não pode dizer mais que a tela.
  const pendentes = d.degraus.filter(g => !g.alcancado);
  if (pendentes.length) {
    linhas.push('');
    linhas.push('*Para subir de faixa*');
    for (const g of pendentes) {
      linhas.push(`• ${g.quartil}º quartil: faltam ${formatBRL(g.falta)}`);
    }
  } else if (d.degraus.length) {
    linhas.push('');
    linhas.push(`*${ehSetor ? 'O setor' : 'A equipe'} já está na melhor faixa.* 👏`);
  }

  // ── Pessoas ────────────────────────────────────────────────────────────────
  // Quem está sem meta individual fica fora da contagem, como no card; aqui nem
  // é citado — «1 sem meta» num grupo de operadores é ruído, não informação.
  const comFaixa = d.porQuartil.reduce((s, f) => s + f.qtd, 0);
  const destaque = d.destaque && d.destaque.recebido > 0 ? d.destaque : null;

  if (comFaixa > 0) {
    linhas.push('');
    linhas.push('*Pessoas por faixa*');
    for (const f of d.porQuartil) linhas.push(`• ${f.quartil}º quartil: ${pessoas(f.qtd)}`);
  }
  if (destaque) {
    linhas.push('');
    linhas.push(`🔥 *Destaque:* ${destaque.nome.trim()} — ${formatBRL(destaque.recebido)}`);
  }

  return linhas.join('\n');
}
