/**
 * fases.ts — o calendário do Portal de Outubro: o que o Gestão mostra em cada
 * momento da revelação do mural.
 *
 * ## O pedido (Kauan, 26/10/2026)
 *
 * «Um portal ou mural mostrando o que foi feito no mês: o Rei do Pop, a
 * bruxa, o cavalo; um ranking de quem teve a maior pontuação de medalhas; e
 * um sorteio de uma garrafa.» A comemoração é na sexta, 30/10, porque o dia
 * 31 (Halloween) cai no sábado.
 *
 * ## A revelação: 5 minutos (pedido do Cleber, 29/10/2026)
 *
 * «Esquece tudo do jeito que é hoje.» Até 29/10 o bueiro ficava a semana
 * inteira na tela e o barquinho caía de tempos em tempos; agora tudo é uma
 * cena só, que começa no botão do super_admin (ou 5 minutos antes de sexta,
 * 16h) e dura `JANELA_MS`:
 *
 *   aguardando   liberado e a revelação ainda não começada: o bueiro fica na
 *                tela, com os olhos e os balões, sem relógio nenhum, até o
 *                botão (pedido do Cleber, 30/10/2026: «enquanto tá liberado,
 *                deixa lá a animação do bueiro aparecendo pra todo mundo; só
 *                começa o timer dos 5 minutos quando a gente começar a
 *                revelação»). Sexta 16h não começa mais sozinha
 *   espreitando  o bueiro aparece na névoa, com o relógio pequeno em cima
 *                («O mural abre em 04:59») e os balões subindo
 *   final        faltando 2 min 45 s, a água vem escorrendo devagar pela
 *                barra até o bueiro (`AGUA_MS`); quando chega, vem o
 *                barquinho, que cai na boca, e a mão sai com ele —
 *                inteira para fora exatamente nos 2 minutos. Aí o relógio
 *                pequeno e o «Participar» ficam do lado do bueiro, com o X
 *                para fechar (quem fecha fica só com o bueiro)
 *   revelando    zerou: quem participou vê a abertura (a tela desmancha, a
 *                Coisa, o mural puxado). Os outros não veem nada ainda
 *   aberto       a revelação acabou (`REVELACAO_MS`): o botão do mural na
 *                barra de cima aparece para todo mundo, até o fim de sábado
 *
 * ## Só o relógio
 *
 * Nada aqui lê o banco: a fase sai da hora (de São Paulo, UTC−3 o ano todo —
 * o Brasil não tem horário de verão desde 2019). Na hora ninguém pergunta
 * nada ao servidor: a lição da gargalhada da bruxa (15/10/2026) é que todo
 * mundo fazendo a mesma coisa no mesmo segundo derruba o banco.
 *
 * Puro de propósito: o relógio de teste (`relogio.ts`) passa a hora que quiser.
 *
 * ## Quem liga
 *
 * No app de verdade o mural só aparece depois que o super_admin libera, e a
 * revelação começa no botão dele (`liberacao.ts`: a abertura fica 5 minutos
 * depois do clique) — `estadoDoPortal` recebe essa hora no lugar de
 * `ABERTURA`.
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
/** A abertura de sempre, se ninguém começar antes: sexta, 16h. */
export const ABERTURA = emSaoPaulo(2026, 10, 30, 16);
/** Até quando o mural fica (o sábado inteiro). */
export const FIM = emSaoPaulo(2026, 11, 1);

/** A revelação inteira: do bueiro aparecer até a abertura. */
export const JANELA_MS = 5 * MINUTO;
/** O «Participar»: a mão segurando o barco, até a abertura. */
export const CONTAGEM_FINAL_MS = 2 * MINUTO;
/**
 * A água, o barco e a mão, antes dos 2 minutos (`portal.css` anda nesta
 * conta: 45 s): a água escorre 0–25 s, o barco boia 25–39 s, cai 39–43,6 s e
 * a mão sai 43,6–45 s.
 */
export const AGUA_MS = 45_000;
/** Quando a mão começa a sair, contado do começo da água. */
export const MAO_SAI_MS = AGUA_MS - 1_400;
/** Quando a água começa, antes da abertura: o começo da fase `final`. */
export const BARCO_ANTES_DA_ABERTURA_MS = CONTAGEM_FINAL_MS + AGUA_MS;
/**
 * Quanto dura a revelação de quem participou (a abertura ~6 s, a Coisa
 * nascendo e dançando ~16 s, babando e o close ~10 s, a puxada ~5 s): só
 * depois disso o mural abre para quem não participou.
 */
export const REVELACAO_MS = 40_000;

/** Meia-noite de cada dia da semana do evento: 1 = segunda 26, …, 5 = sexta 30. */
export const DIAS: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: emSaoPaulo(2026, 10, 26),
  2: emSaoPaulo(2026, 10, 27),
  3: emSaoPaulo(2026, 10, 28),
  4: emSaoPaulo(2026, 10, 29),
  5: emSaoPaulo(2026, 10, 30),
};

export type Fase = 'fora' | 'aguardando' | 'espreitando' | 'final' | 'revelando' | 'aberto';

export interface EstadoDoPortal {
  fase: Fase;
  /** O dia da semana do evento (1 = segunda … 5 = sexta); 0 antes, 6 no sábado. */
  dia: number;
  /** A brasa dentro do bueiro: acende ao longo da revelação, cheia no fim. */
  luz: number;
  /** O bueiro treme (no final). */
  tremor: boolean;
  /** De quanto em quanto tempo sobe um balão, em média; `null` sem o bueiro. */
  balaoACadaMs: number | null;
  /** Na fase `final`: quanto já passou desde que a água começou (ms); `null` fora dela. */
  noFinalMs: number | null;
  /** Quanto falta para abrir (ms; 0 depois; `Infinity` aguardando o botão). */
  faltaMs: number;
}

/** A brasa e os balões do bueiro esperando: os do começo dos 5 minutos, para o botão não dar salto. */
const LUZ_ESPERANDO = 0.35;
const BALAO_ESPERANDO_MS = 20_000;

function diaDoEvento(agora: number): number {
  if (agora < DIAS[1]) return 0;
  return Math.min(6, 1 + Math.floor((agora - DIAS[1]) / (24 * HORA)));
}

/**
 * `abertura`: a hora em que a tela desmancha — 5 minutos depois do botão (o
 * padrão, sexta 16h, é o do laboratório e dos testes). `null`: a revelação não
 * começou, e o bueiro fica esperando (`aguardando`) até o fim de sábado.
 */
export function estadoDoPortal(agora: number, abertura: number | null = ABERTURA): EstadoDoPortal {
  if (abertura === null) {
    const fora = agora >= FIM;
    return {
      fase: fora ? 'fora' : 'aguardando',
      dia: diaDoEvento(agora),
      luz: fora ? 0 : LUZ_ESPERANDO,
      tremor: false,
      balaoACadaMs: fora ? null : BALAO_ESPERANDO_MS,
      noFinalMs: null,
      faltaMs: fora ? 0 : Infinity,
    };
  }
  const faltaMs = Math.max(0, abertura - agora);
  const fase: Fase =
    agora >= FIM ? 'fora'
      : agora >= abertura + REVELACAO_MS ? 'aberto'
        : agora >= abertura ? 'revelando'
          : agora >= abertura - BARCO_ANTES_DA_ABERTURA_MS ? 'final'
            : agora >= abertura - JANELA_MS ? 'espreitando'
              : 'fora';
  const comBueiro = fase === 'espreitando' || fase === 'final';
  return {
    fase,
    dia: diaDoEvento(agora),
    luz: comBueiro ? LUZ_ESPERANDO + (1 - LUZ_ESPERANDO) * Math.min(1, Math.max(0, 1 - faltaMs / JANELA_MS)) : 0,
    tremor: fase === 'final',
    balaoACadaMs: fase === 'espreitando' ? BALAO_ESPERANDO_MS : fase === 'final' ? 12_000 : null,
    noFinalMs: fase === 'final' ? agora - (abertura - BARCO_ANTES_DA_ABERTURA_MS) : null,
    faltaMs,
  };
}

/** «03:12:45» (ou «04:59» na última hora). */
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
  fora: 'sem o bueiro',
  aguardando: 'o bueiro esperando a revelação',
  espreitando: 'o bueiro',
  final: 'a água, o barco e o «Participar»',
  revelando: 'a revelação',
  aberto: 'mural aberto',
};
