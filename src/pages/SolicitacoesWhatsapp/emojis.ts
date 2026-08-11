/**
 * emojis.ts — catálogo e memória do seletor de emoji do chat.
 *
 * Fica fora do componente porque a parte que erra é a lógica: inserir no lugar
 * certo do texto e manter a lista de recentes sem repetir nem crescer para
 * sempre. Isso se testa sem montar React.
 *
 * ── Por que um catálogo à mão, e não uma biblioteca ─────────────────────────
 * `emoji-picker-react` e parecidos custam centenas de kB e vários deles buscam
 * sprites de CDN — que a política de conteúdo deste projeto bloqueia. O que o
 * time precisa aqui não é o Unicode inteiro: é um punhado de reações e alguns
 * símbolos de trabalho. Uma grade curada é menor, mais rápida de usar e não
 * traz dependência nova.
 */

export interface GrupoEmoji {
  id: string;
  /** Rótulo da aba. */
  nome: string;
  /** Emoji que representa o grupo na aba. */
  aba: string;
  itens: readonly string[];
}

/**
 * Os grupos, na ordem em que aparecem.
 *
 * A seleção é de uso, não de completude: rostos para reagir, mãos para
 * concordar/agradecer (é o que mais se usa numa conversa de trabalho), e um
 * grupo de cobrança com o vocabulário da operação — telefone, prazo, dinheiro,
 * confirmado, atenção.
 */
export const GRUPOS_EMOJI: readonly GrupoEmoji[] = [
  {
    id: 'rostos',
    nome: 'Rostos',
    aba: '🙂',
    itens: [
      '😀', '😃', '😄', '😁', '😅', '😂', '🙂', '😉',
      '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😎',
      '🤔', '🤨', '😐', '😑', '🙄', '😏', '😴', '🤤',
      '😔', '😞', '😢', '😭', '😤', '😠', '🤯', '😳',
      '🥵', '🥶', '😱', '😨', '😰', '😅', '🤝', '🫡',
    ],
  },
  {
    id: 'gestos',
    nome: 'Gestos',
    aba: '👍',
    itens: [
      '👍', '👎', '👌', '✌️', '🤞', '🤙', '👏', '🙌',
      '🙏', '💪', '👋', '☝️', '👉', '👈', '👇', '✋',
      '🫶', '🤲', '👊', '✊',
    ],
  },
  {
    id: 'trabalho',
    nome: 'Trabalho',
    aba: '📞',
    itens: [
      '📞', '📱', '💬', '📩', '📧', '📝', '📋', '📌',
      '📎', '📅', '⏰', '⏳', '💰', '💵', '💳', '🧾',
      '📊', '📈', '📉', '✅', '❌', '⚠️', '❗', '❓',
      '🔴', '🟢', '🟡', '🔒', '🔑', '🎯', '🏆', '🚀',
    ],
  },
  {
    id: 'simbolos',
    nome: 'Símbolos',
    aba: '❤️',
    itens: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🔥', '⭐', '✨', '🎉', '🎊', '👀', '💡', '💯',
      '🙈', '🤖', '☕', '🍀',
    ],
  },
];

// ── Recentes ────────────────────────────────────────────────────────────────

/** Chave da lista de recentes no localStorage. */
export const CHAVE_RECENTES = 'chat:emojis-recentes';

/**
 * Quantos recentes cabem.
 *
 * Oito é a largura de uma linha da grade: com um número quebrado, a fila de
 * recentes começaria a segunda linha com dois ou três itens soltos.
 */
export const MAX_RECENTES = 8;

/**
 * A lista de recentes depois de usar `escolhido`.
 *
 * Move para a frente em vez de só empilhar: quem acabou de usar 👍 pela quinta
 * vez não quer cinco 👍 ocupando a fila inteira.
 */
export function registrarRecente(
  atuais: readonly string[],
  escolhido: string,
): string[] {
  return [escolhido, ...atuais.filter(e => e !== escolhido)].slice(0, MAX_RECENTES);
}

/** Lê os recentes guardados. Storage inacessível ou sujo devolve lista vazia. */
export function lerRecentes(): string[] {
  try {
    const cru = localStorage.getItem(CHAVE_RECENTES);
    if (!cru) return [];
    const lido: unknown = JSON.parse(cru);
    if (!Array.isArray(lido)) return [];
    // Filtra o que não é string: o valor pode ter sido escrito por uma versão
    // antiga (ou à mão), e um item inválido quebraria a grade inteira.
    return lido.filter((e): e is string => typeof e === 'string').slice(0, MAX_RECENTES);
  } catch {
    return [];
  }
}

export function salvarRecentes(lista: readonly string[]): void {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista.slice(0, MAX_RECENTES)));
  } catch {
    // Sem persistência; a sessão atual segue com a lista em memória.
  }
}

// ── Inserção no texto ───────────────────────────────────────────────────────

export interface ResultadoInsercao {
  texto: string;
  /** Onde o cursor deve ficar depois — logo após o emoji. */
  cursor: number;
}

/**
 * Insere `emoji` em `texto` na seleção atual.
 *
 * Insere na POSIÇÃO DO CURSOR, não no fim: quem escreveu uma frase, voltou para
 * corrigir uma palavra e clicou num emoji espera que ele entre onde o cursor
 * está — jogar tudo para o fim é o defeito clássico desse componente.
 *
 * `inicio`/`fim` diferentes substituem a seleção, como qualquer digitação faria.
 *
 * Posições fora do texto (ou `null`, quando o campo nunca teve foco) caem para
 * o fim, que é o comportamento razoável nesse caso.
 */
export function inserirEmoji(
  texto: string,
  emoji: string,
  inicio: number | null,
  fim: number | null,
): ResultadoInsercao {
  const seguro = (v: number | null, padrao: number) =>
    v == null || v < 0 || v > texto.length ? padrao : v;

  const a = seguro(inicio, texto.length);
  const b = Math.max(a, seguro(fim, a));

  return {
    texto:  texto.slice(0, a) + emoji + texto.slice(b),
    cursor: a + emoji.length,
  };
}
