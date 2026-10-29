/**
 * fases.ts — o calendário do Portal de Outubro: o que o Gestão mostra em cada
 * momento da semana de 26 a 30/10/2026.
 *
 * ## O pedido (Kauan, 26/10/2026)
 *
 * «De dia em dia quebrando, e no dia abrisse um portal ou mural mostrando o
 * que foi feito no mês: o Rei do Pop, a bruxa, o cavalo; um ranking de quem
 * teve a maior pontuação de medalhas; e um sorteio de uma garrafa.» A
 * comemoração é na sexta, 30/10, porque o dia 31 (Halloween) cai no sábado.
 *
 * Em 27/10 o vidro rachando virou o bueiro da Coisa: «em vez das rachaduras
 * subirá um balão, aonde terá meio que um esgoto, aonde ficará só os olhos
 * do IT até ser o dia».
 *
 *   seg 26  o bueiro aparece no alto da tela, com os olhos piscando lá
 *           dentro (e seguindo o mouse); de vez em quando um balão vermelho
 *           aparece em algum canto da tela (não estoura)
 *   ter 27  os balões vêm mais vezes
 *   qua 28  o bueiro começa a brilhar por dentro, mais a cada dia
 *   qui 29  o bueiro treme de vez em quando; «Amanhã, às 16h.»
 *   sex 30  a contagem, e os balões quase sem parar perto da hora;
 *           às 16h os olhos acendem, um balão sobe até o meio da tela,
 *           estoura, a tela desmancha e o mural aparece
 *   sáb 31  o mural fica para rever o dia todo; depois, nada
 *
 * ## O final: o barco, a mão e a contagem (pedido de 29/10/2026)
 *
 * O barquinho cai no bueiro UMA vez só, e é o começo da revelação: «quando o
 * barco cair no bueiro, a mão sai segurando e começa uma contagem de 2
 * minutos com a mensagem informando que o mural será liberado, e com a opção
 * de participar». A fase `final` vai de `BARCO_ANTES_DA_ABERTURA_MS` antes da
 * abertura até ela: os primeiros `MAO_SAI_MS` são o barco boiando e caindo, o
 * resto é a mão segurando o barco e a contagem (`CONTAGEM_FINAL_MS`). Quem
 * clicou em «Participar» ganha a abertura quando zera; os outros, o botão do
 * mural na barra de cima (`PortalDeOutubro.tsx`).
 *
 * ## Só o relógio
 *
 * Nada aqui lê o banco: a fase sai da hora (de São Paulo, UTC−3 o ano todo —
 * o Brasil não tem horário de verão desde 2019). Às 16h ninguém pergunta nada
 * ao servidor: a lição da gargalhada da bruxa (15/10/2026) é que todo mundo
 * fazendo a mesma coisa no mesmo segundo derruba o banco.
 *
 * Puro de propósito: o relógio de teste (`relogio.ts`) passa a hora que quiser.
 *
 * ## Quem liga, e a abertura antes da hora (29/10/2026)
 *
 * No app de verdade o mural só aparece depois que o super_admin libera, e a
 * abertura pode ser solta por ele antes de sexta 16h (`liberacao.ts`): aí
 * `estadoDoPortal` recebe essa hora no lugar de `ABERTURA`. O resto da
 * semana (o dia, o brilho, os balões) continua saindo do relógio.
 */

const HORA = 3_600_000;
const MINUTO = 60_000;

/** Um instante no horário de São Paulo (UTC−3). `mes` de 1 a 12. */
export function emSaoPaulo(ano: number, mes: number, dia: number, h = 0, m = 0, s = 0): number {
  return Date.UTC(ano, mes - 1, dia, h + 3, m, s);
}

/** A hora de São Paulo de um instante: dia do mês, dia da semana (0 = domingo), hora, minuto, segundo. */
export function partesEmSaoPaulo(ms: number) {
  const d = new Date(ms - 3 * HORA);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    semana: d.getUTCDay(),
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
  };
}

export const INICIO = emSaoPaulo(2026, 10, 26);
/** O balão sobe do bueiro, estoura, a tela desmancha e o mural aparece. */
export const ABERTURA = emSaoPaulo(2026, 10, 30, 16);
/** Do barquinho aparecer até a mão sair do bueiro com ele (o barco boia 9 s e cai). */
export const MAO_SAI_MS = 9_600;
/** A contagem com a mão segurando o barco, até a abertura. */
export const CONTAGEM_FINAL_MS = 2 * MINUTO;
/** Quando o barquinho aparece, antes da abertura: o começo da fase `final`. */
export const BARCO_ANTES_DA_ABERTURA_MS = CONTAGEM_FINAL_MS + MAO_SAI_MS;
/** Até quando o mural fica para rever (o sábado inteiro). */
export const FIM = emSaoPaulo(2026, 11, 1);

/** Meia-noite de cada dia da semana do evento: 1 = segunda 26, …, 5 = sexta 30. */
export const DIAS: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: emSaoPaulo(2026, 10, 26),
  2: emSaoPaulo(2026, 10, 27),
  3: emSaoPaulo(2026, 10, 28),
  4: emSaoPaulo(2026, 10, 29),
  5: emSaoPaulo(2026, 10, 30),
};

export type Fase = 'fora' | 'espreitando' | 'final' | 'aberto';

export interface EstadoDoPortal {
  fase: Fase;
  /** O dia da semana do evento (1 = segunda … 5 = sexta); 0 fora da semana, 6 no sábado. */
  dia: number;
  /** O brilho dentro do bueiro: de quarta em diante, mais forte a cada dia, cheio às 16h de sexta. */
  luz: number;
  /** O bueiro treme de vez em quando (quinta e sexta). */
  tremor: boolean;
  /** De quanto em quanto tempo (da hora do portal) aparece um balão na tela; `null` fora da semana. */
  balaoACadaMs: number | null;
  /** Na fase `final`: quanto já passou desde que o barquinho apareceu (ms); `null` fora dela. */
  noFinalMs: number | null;
  /** «Amanhã, às 16h.» (quinta). */
  bilhete: boolean;
  /** A contagem regressiva (sexta, até abrir). */
  contagem: boolean;
  /** Quanto falta para abrir (ms; 0 depois). */
  faltaMs: number;
}

function diaDoEvento(agora: number): number {
  if (agora < DIAS[1]) return 0;
  return Math.min(6, 1 + Math.floor((agora - DIAS[1]) / (24 * HORA)));
}

/** `abertura`: a hora em que a tela desmancha — sexta 16h, ou a solta pelo botão. */
export function estadoDoPortal(agora: number, abertura: number = ABERTURA): EstadoDoPortal {
  const dia = diaDoEvento(agora);
  const faltaMs = Math.max(0, abertura - agora);
  const fase: Fase =
    agora < INICIO || agora >= FIM ? 'fora'
      : agora >= abertura ? 'aberto'
        : agora >= abertura - BARCO_ANTES_DA_ABERTURA_MS ? 'final'
          : 'espreitando';
  let luz = 0;
  const espreitando = fase === 'espreitando' || fase === 'final';
  if (espreitando) {
    if (dia === 3) luz = 0.35;
    else if (dia === 4) luz = 0.55;
    else if (dia === 5) luz = 0.65 + 0.35 * Math.min(1, Math.max(0, (agora - DIAS[5]) / (abertura - DIAS[5])));
  }
  return {
    fase,
    dia,
    luz,
    tremor: espreitando && dia >= 4,
    balaoACadaMs: espreitando ? intervaloDosBaloes(dia, faltaMs) : null,
    noFinalMs: fase === 'final' ? agora - (abertura - BARCO_ANTES_DA_ABERTURA_MS) : null,
    bilhete: fase === 'espreitando' && dia === 4,
    contagem: fase === 'espreitando' && dia === 5,
    faltaMs,
  };
}

/** Os balões: mais vezes a cada dia, e quase sem parar na última hora. */
const BALOES: Readonly<Record<number, number>> = { 1: 40, 2: 25, 3: 15, 4: 10, 5: 6 };

function intervaloDosBaloes(dia: number, faltaMs: number): number {
  if (faltaMs <= BARCO_ANTES_DA_ABERTURA_MS) return 15_000;
  if (faltaMs <= HORA) return 2 * MINUTO;
  return (BALOES[dia] ?? 40) * MINUTO;
}

/** «03:12:45» (ou «12:45» na última hora). */
export function relogioDaContagem(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** «sex 30/10 15:59:30», para o painel do relógio. */
export function dataCurta(ms: number): string {
  const p = partesEmSaoPaulo(ms);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${SEMANA[p.semana]} ${dois(p.dia)}/${dois(p.mes)} ${dois(p.h)}:${dois(p.m)}:${dois(p.s)}`;
}

export const NOME_DA_FASE: Readonly<Record<Fase, string>> = {
  fora: 'fora da semana',
  espreitando: 'a Coisa espreita',
  final: 'o barco e a contagem',
  aberto: 'mural aberto',
};
