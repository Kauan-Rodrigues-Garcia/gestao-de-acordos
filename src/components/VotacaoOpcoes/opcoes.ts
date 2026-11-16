/**
 * opcoes.ts — a votação entre OPÇÕES (16/11/2026, pedido do Kauan): uma
 * pergunta, de 2 a 6 opções, cada pessoa vota uma vez.
 *
 * A primeira é a de dezembro: «Sorteio de prêmios» OU «Happy hour no Ibis».
 * O texto de cada opção é editável em Configurações antes de liberar; o que
 * está aqui é só o ponto de partida. As fotos entram depois (`foto`): sem
 * foto, a tela mostra o emoji da opção.
 */

export interface OpcaoDaVotacao {
  /** Fixo depois de liberar: é o que o voto grava. */
  id: string;
  titulo: string;
  emoji: string;
  /** Uma ou duas frases embaixo do título. */
  resumo: string;
  /** Link da foto (nulo: mostra o emoji). */
  foto: string | null;
  /** «Como funciona»: uma linha cada. */
  detalhes: string[];
  /** O título da lista de itens («Ideias de prêmios»). */
  rotuloItens: string;
  /** Itens em etiquetas (os prêmios). Vazio: o bloco não aparece. */
  itens: string[];
}

export interface ConteudoDaVotacao {
  titulo: string;
  pergunta: string;
  opcoes: OpcaoDaVotacao[];
}

export const MIN_OPCOES = 2;
export const MAX_OPCOES = 6;

/**
 * A de dezembro, como veio no pedido. A data do happy hour veio «04/11», que já
 * passou e não é dezembro: ficou 04/12 — conferir antes de liberar.
 */
export const VOTACAO_DEZEMBRO: ConteudoDaVotacao = {
  titulo: 'Votação de dezembro',
  pergunta: 'Sorteio de prêmios ou Happy hour no Ibis: o que você prefere?',
  opcoes: [
    {
      id: 'premios',
      titulo: 'Sorteio de prêmios',
      emoji: '🎁',
      resumo: 'Prêmios para a sua casa, sorteados entre quem bateu a meta.',
      foto: null,
      detalhes: [
        '1 cupom para cada meta batida',
        'Participa quem fechar acima de 80% da projeção',
        '1 prêmio por pessoa',
      ],
      rotuloItens: 'Ideias de prêmios',
      itens: [
        'Air Fryer', 'Micro-ondas', 'Panela de pressão', 'Liquidificador', 'Cafeteira elétrica',
        'Grill elétrico', 'Sanduicheira', 'Multiprocessador', 'Panela de arroz elétrica',
      ],
    },
    {
      id: 'happy_hour',
      titulo: 'Happy hour no Ibis',
      emoji: '🍻',
      resumo: 'Uma confraternização com todo mundo, com comida de boteco.',
      foto: null,
      detalhes: [
        'Dia 04/12, depois das 17h30',
        '3 horas de festa',
        'Comida de boteco',
      ],
      rotuloItens: '',
      itens: [],
    },
  ],
};

const limpar = (l: readonly string[]) => l.map(s => s.trim()).filter(Boolean);

/** O que vai para o banco: sem linha vazia, sem espaço sobrando. */
export function opcoesParaGravar(opcoes: readonly OpcaoDaVotacao[]): OpcaoDaVotacao[] {
  return opcoes.map(o => ({
    id: o.id,
    titulo: o.titulo.trim(),
    emoji: o.emoji.trim(),
    resumo: o.resumo.trim(),
    foto: o.foto?.trim() || null,
    detalhes: limpar(o.detalhes),
    rotuloItens: o.rotuloItens.trim(),
    itens: limpar(o.itens),
  }));
}

/** O que falta para liberar (vazio = pode). */
export function problemasDoConteudo(c: ConteudoDaVotacao): string[] {
  const p: string[] = [];
  if (!c.titulo.trim()) p.push('Dê um título para a votação.');
  if (c.opcoes.length < MIN_OPCOES) p.push(`São pelo menos ${MIN_OPCOES} opções.`);
  if (c.opcoes.length > MAX_OPCOES) p.push(`São no máximo ${MAX_OPCOES} opções.`);
  c.opcoes.forEach((o, i) => { if (!o.titulo.trim()) p.push(`A opção ${i + 1} está sem título.`); });
  if (new Set(c.opcoes.map(o => o.id)).size !== c.opcoes.length) p.push('Há opções repetidas.');
  return p;
}

/** Uma opção de qualquer origem (banco, rascunho antigo), com todo campo no lugar. */
export function normalizarOpcao(o: Record<string, unknown>): OpcaoDaVotacao {
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    id: texto(o.id), titulo: texto(o.titulo), emoji: texto(o.emoji), resumo: texto(o.resumo),
    foto: texto(o.foto) || null, detalhes: lista(o.detalhes), rotuloItens: texto(o.rotuloItens), itens: lista(o.itens),
  };
}

const ehObjeto = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

/** Lê as opções que vieram do banco (jsonb), tolerando campo faltando. */
export function opcoesDoBanco(bruto: unknown): OpcaoDaVotacao[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(ehObjeto).map(normalizarOpcao).filter(o => o.id && o.titulo);
}

/** O rascunho guardado no navegador: título vazio pode (está sendo escrito), id não. */
export function conteudoDoRascunho(bruto: unknown): ConteudoDaVotacao | null {
  if (!ehObjeto(bruto) || typeof bruto.titulo !== 'string' || !Array.isArray(bruto.opcoes)) return null;
  const opcoes = bruto.opcoes.filter(ehObjeto).map(normalizarOpcao).filter(o => o.id);
  if (opcoes.length < MIN_OPCOES) return null;
  return { titulo: bruto.titulo, pergunta: typeof bruto.pergunta === 'string' ? bruto.pergunta : '', opcoes: opcoes.slice(0, MAX_OPCOES) };
}

/** Id novo para uma opção acrescentada à mão. */
export function novoIdDeOpcao(existentes: readonly string[]): string {
  let n = existentes.length + 1;
  while (existentes.includes(`opcao_${n}`)) n++;
  return `opcao_${n}`;
}

/** Contagem → lista com % (para o painel). */
export function apurar(opcoes: readonly OpcaoDaVotacao[], contagem: Record<string, number>): Array<{ opcao: OpcaoDaVotacao; votos: number; pct: number }> {
  const total = opcoes.reduce((s, o) => s + (contagem[o.id] ?? 0), 0);
  return opcoes.map(o => {
    const votos = contagem[o.id] ?? 0;
    return { opcao: o, votos, pct: total ? (votos / total) * 100 : 0 };
  });
}
