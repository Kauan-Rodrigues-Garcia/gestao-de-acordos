/**
 * Espiar o urso pela janela do iglu (06/11/2026, pedido do Kauan) — as
 * regras; o desenho está em `DentroDoIglu.tsx`.
 *
 * Com o urso em casa, clicar na janelinha redonda abre, num zoom, o lado de
 * dentro do iglu: ele está fazendo alguma coisa (sorteada). Quem fica olhando
 * mais de `PERCEBE_EM_MS` é pego: o urso fica bravo, fecha a cortina, e a
 * janela fica fechada por `CORTINA_FECHADA_MS` — no navegador, para a cortina
 * continuar fechada se a pessoa recarregar ou trocar de aba.
 */
export type AtividadeDoUrso = 'dormindo' | 'comendo' | 'chocolate' | 'lendo' | 'tricotando' | 'planilha';

/** [atividade, peso no sorteio]. Dormindo é o mais comum: é urso, e é inverno. */
const ATIVIDADES: readonly [AtividadeDoUrso, number][] = [
  ['dormindo', 4], ['comendo', 2], ['chocolate', 2], ['lendo', 2], ['tricotando', 1.5], ['planilha', 1.5],
];

export const PERCEBE_EM_MS = 10_000;
export const CORTINA_FECHADA_MS = 5 * 60_000;

/** A última atividade, para a espiada seguinte não repetir de cara. */
let ultima: AtividadeDoUrso | null = null;

export function sortearAtividade(sorte: () => number = Math.random): AtividadeDoUrso {
  // Só no `npm run dev`: `?atividade=lendo` fixa a atividade (laboratório).
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const fixa = new URLSearchParams(location.search).get('atividade');
    if (ATIVIDADES.some(([x]) => x === fixa)) return fixa as AtividadeDoUrso;
  }
  const opcoes = ATIVIDADES.filter(([a]) => a !== ultima);
  let r = opcoes.reduce((s, [, p]) => s + p, 0) * sorte();
  for (const [a, p] of opcoes) {
    r -= p;
    if (r <= 0) { ultima = a; return a; }
  }
  ultima = opcoes[0][0];
  return ultima;
}

/** O que ele diz quando pega alguém espiando. */
export const BRONCAS = [
  'Ei! Tá me espiando?!',
  'Privacidade, por favor!',
  'Isso aqui não é o Modo TV!',
  'Xô! Vai fechar acordo!',
  'Urso também tem vida pessoal!',
  'Que feio, espiando pela janela!',
  'Vou contar pros duendes!',
  'Fecha essa janela… FECHA!',
] as const;

/** O que cada atividade diz quando a espiada começa (a legenda do cartão). */
export const LEGENDAS: Record<AtividadeDoUrso, string> = {
  dormindo: 'Shhh… o urso está dormindo.',
  comendo: 'Hora do lanche: peixe fresquinho.',
  chocolate: 'Chocolate quente, pertinho do lampião.',
  lendo: 'Lendo «Pesca para Ursos», volume 3.',
  tricotando: 'Tricotando um cachecol novo.',
  planilha: 'Conferindo a planilha de peixes.',
};

const CHAVE = 'natal-urso-cortina-ate';

export function cortinaFechadaAte(): number {
  try { return Number(localStorage.getItem(CHAVE)) || 0; } catch { return 0; }
}

export function fecharCortina(agora = Date.now()): number {
  const ate = agora + CORTINA_FECHADA_MS;
  try { localStorage.setItem(CHAVE, String(ate)); } catch { /* sem armazenamento: fecha só nesta tela */ }
  return ate;
}
