/**
 * charadas.ts — as cartas do Charada no modo Batman (pedido de 05/10/2026).
 *
 * Como no filme (The Batman, 2022): um envelope «Para o Batman» com uma
 * charada e a resposta escondida numa cifra de sinais desenhados. A pessoa
 * arrisca um palpite (`confere`); acertando, desistindo ou esgotando as
 * tentativas, as letras aparecem uma a uma.
 *
 * Charadas de domínio público, sem pegadinha de duplo sentido — a tela é de
 * trabalho. A última é da casa.
 */

export interface Charada {
  pergunta: string;
  resposta: string;
}

export const CHARADAS: readonly Charada[] = [
  { pergunta: 'Quanto mais se tira, maior fica.', resposta: 'O buraco' },
  { pergunta: 'Cai em pé e corre deitada.', resposta: 'A chuva' },
  { pergunta: 'Quanto mais cresce, menos se vê.', resposta: 'A escuridão' },
  { pergunta: 'Quanto mais seca, mais molhada fica.', resposta: 'A toalha' },
  { pergunta: 'Tem cidades, mas não tem casas. Tem rios, mas não tem água.', resposta: 'O mapa' },
  { pergunta: 'Tem dentes, mas não morde.', resposta: 'O pente' },
  { pergunta: 'Foi feita para andar e nunca sai do lugar.', resposta: 'A rua' },
  { pergunta: 'Basta dizer o meu nome para eu deixar de existir.', resposta: 'O silêncio' },
  { pergunta: 'Tem cabeça e tem dente, não é bicho nem é gente.', resposta: 'O alho' },
  { pergunta: 'Sobe quando a chuva desce.', resposta: 'O guarda-chuva' },
  { pergunta: 'Nasço de uma dívida e morro quando sou cumprido.', resposta: 'O acordo' },
];

/** Um símbolo por letra (sem acento): 26. Todos existem na fonte de símbolos do Windows. */
export const SIMBOLOS = ['◆', '▲', '●', '■', '✚', '✖', '◐', '◑', '◒', '◓', '★', '☾', '⬟', '⬢', '✦', '✧', '♠', '♣', '♥', '♦', '☉', '△', '▽', '○', '□', '◇'] as const;

/** `glifo`: qual dos 26 desenhos da cifra (`GLIFOS`, em `CartaDoCharada.tsx`) esconde a letra. */
export type Casa = { letra: string; simbolo: string; glifo: number } | { espaco: true };

const semAcento = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * A resposta em casas: cada letra com o seu símbolo. Mesma letra, mesmo
 * símbolo (acento não conta: Ã e A são iguais); a semente embaralha o
 * alfabeto, para cada carta ter a sua cifra. Puro: dá para testar.
 */
export function cifrar(resposta: string, semente: number): Casa[] {
  let s = (Math.abs(Math.floor(semente)) % 2147483646) + 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ordem = [...SIMBOLOS];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return [...resposta.toUpperCase()].map(c => {
    if (c === ' ' || c === '-') return { espaco: true } as const;
    const base = semAcento(c).charCodeAt(0) - 65;
    const ok = base >= 0 && base < 26;
    return { letra: c, simbolo: ok ? ordem[base] : c, glifo: ok ? SIMBOLOS.indexOf(ordem[base] as (typeof SIMBOLOS)[number]) : 0 };
  });
}

/**
 * A próxima carta, sem repetir até todas saírem. `vistas`: índices já
 * mostrados (nesta aba). Puro: dá para testar.
 */
export function sortearCharada(vistas: readonly number[], acaso: number): number {
  const livres = CHARADAS.map((_, i) => i).filter(i => !vistas.includes(i));
  const lista = livres.length ? livres : CHARADAS.map((_, i) => i);
  return lista[Math.min(lista.length - 1, Math.floor(acaso * lista.length))];
}

const ARTIGOS = new Set(['o', 'a', 'os', 'as', 'um', 'uma']);
/** A resposta no jeito de comparar: sem acento, sem caixa, sem artigo, sem hífen nem espaço. */
export function normalizar(texto: string): string {
  const palavras = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  while (palavras.length > 1 && ARTIGOS.has(palavras[0])) palavras.shift();
  return palavras.join('');
}

/** O palpite bate com a resposta? «guarda chuva», «Guarda-Chuva» e «o guarda-chuva» valem. */
export function confere(palpite: string, resposta: string): boolean {
  const p = normalizar(palpite);
  return p.length > 0 && p === normalizar(resposta);
}
