/**
 * Catálogo dos temas de cor — a fonte única para quem precisa saber "que temas
 * existem" e "este tema é escuro?".
 *
 * Quem aplica o tema é o `next-themes` (`ThemeProvider` em `App.tsx`): ele põe
 * no `<html>` exatamente uma classe com o nome do tema e guarda a escolha em
 * `localStorage.theme`. O CSS de cada tema mora em `src/index.css`.
 *
 * Tema escuro novo precisa entrar em TRÊS lugares, senão quebra em silêncio:
 *   1. `TEMAS_ESCUROS` aqui;
 *   2. o `@custom-variant dark` no topo de `index.css` (senão nenhum `dark:`
 *      do sistema liga nele — era o defeito do Cinza Escuro e do Azul Profundo);
 *   3. a regra de `color-scheme` em `index.css`.
 * O script anti-piscada em `index.html` lê `TEMAS_VALIDOS` por cópia — ajuste
 * a lista de lá também.
 */

export type NomeTema = 'light' | 'rosa' | 'verde' | 'dark' | 'dark-grey' | 'deep-blue';
export type EscolhaTema = NomeTema | 'system';

export interface TemaInfo {
  valor: NomeTema;
  rotulo: string;
  escuro: boolean;
  /** Amostra do menu: fundo do tema e o destaque (primary), em CSS. */
  amostra: { fundo: string; destaque: string };
}

export const TEMAS: readonly TemaInfo[] = [
  { valor: 'light',     rotulo: 'Claro',           escuro: false, amostra: { fundo: 'oklch(0.99 0 0)',          destaque: 'oklch(0.45 0.15 220)' } },
  { valor: 'rosa',      rotulo: 'Rosa',            escuro: false, amostra: { fundo: 'oklch(0.962 0.021 347)',   destaque: 'oklch(0.50 0.125 3)' } },
  { valor: 'verde',     rotulo: 'Verde',           escuro: false, amostra: { fundo: 'oklch(0.960 0.020 158)',   destaque: 'oklch(0.47 0.12 162)' } },
  { valor: 'dark',      rotulo: 'Escuro (Padrão)', escuro: true,  amostra: { fundo: 'oklch(0.12 0.015 220)',    destaque: 'oklch(0.62 0.18 220)' } },
  { valor: 'dark-grey', rotulo: 'Cinza Escuro',    escuro: true,  amostra: { fundo: 'oklch(0.21 0.007 220)',    destaque: 'oklch(0.62 0.18 220)' } },
  { valor: 'deep-blue', rotulo: 'Azul Profundo',   escuro: true,  amostra: { fundo: 'oklch(0.14 0.035 240)',    destaque: 'oklch(0.65 0.20 220)' } },
];

/** Os nomes que o `next-themes` conhece — e as classes que ele tira do `<html>`. */
export const NOMES_TEMAS: NomeTema[] = TEMAS.map(t => t.valor);

export const TEMAS_ESCUROS: readonly NomeTema[] = TEMAS.filter(t => t.escuro).map(t => t.valor);

/**
 * `true` para qualquer tema escuro — não só `'dark'`.
 *
 * Recebe o `resolvedTheme` do `next-themes` (com «Sistema» já resolvido para
 * `light`/`dark`). Comparar com `=== 'dark'` deixava gráfico com a paleta do
 * claro no Cinza Escuro e no Azul Profundo.
 */
export function ehTemaEscuro(tema: string | null | undefined): boolean {
  return !!tema && (TEMAS_ESCUROS as readonly string[]).includes(tema);
}

/**
 * A cor de sinal (quartil, projeção, meta) na versão legível COMO TEXTO.
 *
 * Os hex desses sinais (`COR_QUARTIL`, `corDaMeta`...) foram escolhidos para
 * barra e fatia; pintando número em cima do card claro, o verde e o âmbar
 * ficavam em ~2:1. Aqui a luminosidade é presa na faixa do tema em vigor
 * (`--sinal-l-min`/`--sinal-l-max` em `index.css`): escurece no claro, clareia
 * no escuro, e a matiz não muda.
 *
 * Só para `color` de texto e ícone — barra, fatia e fundo seguem com o hex.
 * Resolve no CSS, então acompanha a troca de tema sem re-render.
 */
export function corTexto(cor: string): string;
export function corTexto(cor: string | null | undefined): string | undefined;
export function corTexto(cor: string | null | undefined): string | undefined {
  if (!cor) return undefined;
  return `oklch(from ${cor} clamp(var(--sinal-l-min), l, var(--sinal-l-max)) c h)`;
}

/** O destaque da PaguePlay no lugar do azul da BookPlay, onde o tema não impõe o seu. */
export const DESTAQUE_PAGUEPLAY: Partial<Record<NomeTema, string>> = {
  light:       'oklch(0.45 0.15 155)',
  dark:        'oklch(0.62 0.18 155)',
  'dark-grey': 'oklch(0.60 0.18 155)',
  'deep-blue': 'oklch(0.62 0.18 155)',
};
