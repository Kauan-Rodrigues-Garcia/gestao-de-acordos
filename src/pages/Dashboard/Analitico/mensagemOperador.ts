/**
 * mensagemOperador.ts — o detalhe do operador virando texto de WhatsApp.
 *
 * ## Por que isto existe
 *
 * A linha expandida da aba Quartis responde tudo que a liderança precisa saber
 * sobre um operador — e nada disso chegava ao operador. O caminho real era o
 * líder olhar a tela, abrir o WhatsApp e digitar de cabeça: os números saíam
 * arredondados de um jeito diferente a cada vez, o "quanto falta" virava "uns
 * dois mil" e a régua de amanhã simplesmente não era passada, porque ninguém
 * calcula isso de cabeça.
 *
 * Aqui o mesmo objeto que desenha a tela vira texto. Uma fonte, dois destinos.
 *
 * ## Decisões de formato
 *
 * • **Asterisco simples** é negrito no WhatsApp. Markdown de verdade (`**`)
 *   aparece literalmente na conversa, o que é pior que texto puro.
 * • **Sem tabela e sem coluna alinhada.** O WhatsApp reflui o texto conforme a
 *   largura da tela; qualquer alinhamento por espaço vira lixo no celular.
 * • **Uma linha por ideia**, com rótulo antes do número. Quem lê está no
 *   celular, provavelmente em pé.
 * • **O que não existe some.** Sem meta configurada não há faixa, não há régua
 *   e não há projeção — e a mensagem encolhe em vez de mostrar "—", que numa
 *   conversa não significa nada.
 *
 * Função pura: recebe o detalhe já calculado e devolve string. Sem React, sem
 * `navigator.clipboard` — copiar é assunto de quem chama.
 */
import { formatBRL } from '@/lib/money';
import type { DetalheOperador } from './detalheOperador';

export interface EntradaMensagem {
  /** Nome de quem vai receber o texto. */
  nome: string;
  /** Mês em análise, `yyyy-MM`. */
  mes: string;
  /** Recebido no mês, na unidade em exibição. */
  recebido: number;
  /** Meta individual. `null` = sem meta configurada. */
  meta: number | null;
  /** 'H.O.' ou 'Bruto' — o painel já converteu; isto só nomeia. */
  rotuloUnidade: string;
  /** O detalhe já calculado — a MESMA fonte que desenha a linha expandida. */
  detalhe: DetalheOperador;
}

/** `2026-08` → `agosto/2026`. Mês por extenso: o texto é para uma pessoa. */
function mesPorExtenso(mes: string): string {
  const [ano, m] = mes.split('-');
  const nomes = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const nome = nomes[Number(m) - 1];
  return nome ? `${nome}/${ano}` : mes;
}

/** "1º", "2º"… */
function ordinal(n: number): string {
  return `${n}º`;
}

/**
 * Monta o texto.
 *
 * A ordem é a da conversa que o líder já tem hoje: onde você está, como está o
 * ritmo, o que falta para subir, e o que fazer amanhã para não cair de volta.
 */
export function montarMensagemOperador(entrada: EntradaMensagem): string {
  const { nome, mes, recebido, meta, rotuloUnidade, detalhe: d } = entrada;
  const linhas: string[] = [];

  linhas.push(`*${nome.trim()}* — ${mesPorExtenso(mes)}`);
  linhas.push('');

  // ── Onde está ──────────────────────────────────────────────────────────────
  linhas.push(`*Recebido (${rotuloUnidade}):* ${formatBRL(recebido)}`);
  if (meta !== null && meta > 0) {
    linhas.push(`*Meta:* ${formatBRL(meta)}${d.pctMeta !== null ? ` (${d.pctMeta}% da meta)` : ''}`);
  }
  if (d.faixaAtual) {
    const pct = d.projecaoPct !== null ? ` — ritmo em ${d.projecaoPct}%` : '';
    linhas.push(`*Faixa atual:* ${ordinal(d.faixaAtual.quartil)} quartil${pct}`);
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

  // ── Degraus ────────────────────────────────────────────────────────────────
  const pendentes = d.degraus.filter(g => !g.alcancado);

  if (pendentes.length) {
    linhas.push('');
    linhas.push('*Para subir de faixa*');
    linhas.push('_"hoje" entra na faixa; "amanhã" é o que mantém, porque a régua sobe todo dia útil._');

    for (const g of pendentes) {
      const hoje = `hoje ${formatBRL(g.falta)}`;
      const amanha = g.faltaAmanha !== null
        ? ` · para seguir amanhã ${formatBRL(g.faltaAmanha)}`
        : '';
      linhas.push(`• ${ordinal(g.quartil)} quartil: ${hoje}${amanha}`);
    }
  } else if (d.degraus.length) {
    linhas.push('');
    linhas.push('*Você já está na melhor faixa.* 👏');
    const primeiro = d.degraus.find(g => g.quartil === 1);
    if (primeiro?.faltaAmanha !== null && primeiro?.faltaAmanha !== undefined && primeiro.faltaAmanha > 0) {
      linhas.push(`Para continuar nela amanhã: ${formatBRL(primeiro.faltaAmanha)}.`);
    }
  }

  return linhas.join('\n');
}
