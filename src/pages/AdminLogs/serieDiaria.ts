/**
 * serieDiaria.ts — a série de dias que o gráfico de atividade desenha.
 *
 * ## O defeito que originou este arquivo
 *
 * As RPCs de uso devolvem **só os dias com uso**. O gráfico desenhava uma barra
 * por linha recebida, então sete dias com uso em dois deles viravam duas barras
 * coladas, rotuladas «03» e «07». Não havia como ver que cinco dias ficaram
 * vazios — a tela mostrava uso constante onde havia uso esporádico, que é o
 * oposto da pergunta «o uso está subindo, caindo ou parado».
 *
 * Pior no detalhe de uma pessoa: o bloco só aparecia com `dias.length > 1`.
 * Quem usou em um único dia — o caso mais comum numa janela de sete dias — via
 * a seção sumir, e isso é indistinguível de «não funciona».
 *
 * ## A correção
 *
 * O eixo é o PERÍODO INTEIRO, e não o que voltou do banco. Dia sem uso é um
 * ponto de valor zero, não um dia ausente.
 *
 * Zero-fill aqui e não no SQL de propósito: a série completa é desenho. Fazer
 * `generate_series` na função faria ela devolver noventa linhas de zero para
 * um período de noventa dias sem uso — tráfego para dizer «nada aconteceu».
 *
 * ## As datas não passam por `new Date`
 *
 * `new Date('2026-08-24')` é meia-noite **UTC**; em São Paulo isso é 21h do dia
 * 23, e a série inteira anda um dia para trás. Todo o arquivo trabalha com o
 * texto `yyyy-MM-dd`, somando dias por aritmética de UTC e voltando a texto —
 * é a mesma escolha de `rhEstados.estadoDoPrazo` e `mesReferencia`.
 */

/** Um ponto da série, já pronto para o gráfico. */
export interface PontoDia {
  /** `yyyy-MM-dd`. */
  dia: string;
  /** `24/08` — o rótulo do eixo. */
  rotulo: string;
  segundos: number;
  aberturas: number;
  pessoas: number;
  /** Nenhum uso neste dia. O gráfico marca o vazio em vez de escondê-lo. */
  vazio: boolean;
}

/** O que a série precisa de cada linha vinda do banco. */
export interface LinhaDia {
  dia: string;
  segundos?: number | string | null;
  aberturas?: number | string | null;
  pessoas?: number | string | null;
}

const MS_DIA = 86_400_000;

/** `2026-08-24` + n dias, sem passar por fuso. */
export function somarDias(iso: string, n: number): string {
  const base = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base)) return iso;
  return new Date(base + n * MS_DIA).toISOString().slice(0, 10);
}

/** Dias corridos entre duas datas `yyyy-MM-dd`. Negativo quando `ate` já passou. */
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${ate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

/** `2026-08-24` → `24/08`. */
export function rotuloCurto(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * O período inteiro, dia a dia, com os valores que o banco tiver.
 *
 * Limite de segurança em `maxPontos`: o painel oferece até 90 dias, e uma
 * janela absurda vinda de um estado corrompido não pode gerar um array
 * gigante que trava a aba.
 */
export function montarSerieDiaria(
  linhas: readonly LinhaDia[],
  desde: string,
  ate: string,
  maxPontos = 400,
): PontoDia[] {
  const total = diasEntre(desde, ate);
  if (total < 0 || total > maxPontos) return [];

  const porDia = new Map<string, LinhaDia>();
  for (const l of linhas) porDia.set(l.dia.slice(0, 10), l);

  const saida: PontoDia[] = [];
  for (let i = 0; i <= total; i++) {
    const dia = somarDias(desde, i);
    const l = porDia.get(dia);
    saida.push({
      dia,
      rotulo:    rotuloCurto(dia),
      segundos:  numero(l?.segundos),
      aberturas: numero(l?.aberturas),
      pessoas:   numero(l?.pessoas),
      vazio:     !l,
    });
  }
  return saida;
}

/**
 * O que a série diz sobre a tendência.
 *
 * Compara a PRIMEIRA metade do período com a segunda. É a leitura que responde
 * «está subindo ou caindo» sem exigir que alguém compare barras a olho — e é
 * deliberadamente grosseira: com sete pontos, qualquer regressão daria uma
 * precisão que os dados não têm.
 *
 * `null` quando não há o que comparar: período curto demais, ou nada nas duas
 * metades. Um `0%` ali seria lido como «estável», que é uma afirmação.
 */
export function tendencia(serie: readonly PontoDia[]): {
  variacao: number; direcao: 'subindo' | 'caindo' | 'estavel';
} | null {
  if (serie.length < 4) return null;

  const meio = Math.floor(serie.length / 2);
  const soma = (de: number, ate: number) =>
    serie.slice(de, ate).reduce((s, p) => s + p.segundos, 0);

  const primeira = soma(0, meio);
  const segunda  = soma(meio, serie.length);
  if (primeira === 0 && segunda === 0) return null;

  // Sem base de comparação, «infinito por cento» não ajuda ninguém: a leitura
  // honesta é que começou do zero.
  if (primeira === 0) return { variacao: 100, direcao: 'subindo' };

  const variacao = Math.round(((segunda - primeira) / primeira) * 100);
  return {
    variacao,
    // ±10% é ruído numa medição por amostragem de foco de aba. Chamar 3% de
    // «queda» faria o painel gritar toda semana.
    direcao: variacao > 10 ? 'subindo' : variacao < -10 ? 'caindo' : 'estavel',
  };
}
