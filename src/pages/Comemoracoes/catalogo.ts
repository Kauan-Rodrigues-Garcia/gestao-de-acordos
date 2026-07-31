/**
 * catalogo.ts — os efeitos e sons que já vêm prontos.
 *
 * Fase 1 sem arquivo binário nenhum: os efeitos são animados em código
 * (framer-motion) e os sons sintetizados com WebAudio, como o
 * `som-notificacao.ts` já faz. Isso evita versionar, servir e cachear GIFs e
 * MP3s antes de saber quais o time vai realmente querer.
 *
 * A fase 2 acrescenta o GIF e o som enviados pelo líder, guardados no Storage.
 * As colunas `efeito`/`som` da tabela seguem valendo para o catálogo; a mídia
 * própria entra em colunas separadas, sem quebrar o que já foi criado.
 */

/**
 * O FUNDO da comemoração — a chuva que cai atrás do card, na tela inteira.
 *
 * Não confundir com o GIF: o GIF é a imagem que aparece ACIMA do texto, dentro
 * do card. O fundo é ambiente, e é sempre animado em código.
 */
export type EfeitoId = 'confete' | 'chuva-moedas' | 'nenhum';
export type SomId    = 'fanfarra' | 'conquista' | 'moedas' | 'sino' | 'nenhum';

export interface OpcaoCatalogo<T extends string> {
  id:        T;
  nome:      string;
  descricao: string;
}

export const EFEITOS: readonly OpcaoCatalogo<EfeitoId>[] = [
  { id: 'confete',      nome: 'Confete',         descricao: 'Papelotes coloridos caindo pela tela.' },
  { id: 'chuva-moedas', nome: 'Chuva de moedas', descricao: 'Moedas douradas caindo pela tela.' },
  { id: 'nenhum',       nome: 'Sem fundo',       descricao: 'Só o card, sem chuva atrás.' },
];

export const SONS: readonly OpcaoCatalogo<SomId>[] = [
  { id: 'fanfarra',  nome: 'Fanfarra',  descricao: 'Três notas subindo, curtas.' },
  { id: 'conquista', nome: 'Conquista', descricao: 'Acorde alegre, tipo fase concluída.' },
  { id: 'moedas',    nome: 'Moedas',    descricao: 'Tilintar rápido e agudo.' },
  { id: 'sino',      nome: 'Sino',      descricao: 'Uma badalada limpa.' },
  { id: 'nenhum',    nome: 'Sem som',   descricao: 'Comemoração silenciosa.' },
];

const EFEITOS_VALIDOS = new Set<string>(EFEITOS.map((e) => e.id));
const SONS_VALIDOS    = new Set<string>(SONS.map((s) => s.id));

/**
 * Efeito guardado no banco → efeito que sabemos desenhar.
 *
 * Valor desconhecido cai em 'confete' em vez de quebrar a tela: se um dia uma
 * versão nova gravar um efeito que este build não conhece, a comemoração ainda
 * acontece.
 */
export function efeitoValido(valor: string | null | undefined): EfeitoId {
  return EFEITOS_VALIDOS.has(valor ?? '') ? (valor as EfeitoId) : 'confete';
}

export function somValido(valor: string | null | undefined): SomId {
  return SONS_VALIDOS.has(valor ?? '') ? (valor as SomId) : 'fanfarra';
}
