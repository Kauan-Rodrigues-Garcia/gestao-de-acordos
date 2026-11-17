/**
 * modelos.ts — os modelos de arte que o super_admin lança para todos (17/11/2026).
 *
 * Cada modelo diz os campos que se preenchem (com o texto que já vem), as cores
 * que vêm marcadas e se a arte entra com festa (confete). O desenho de cada um
 * fica em `ArteCard.tsx`. O banco só guarda o id do modelo e os campos (jsonb):
 * acrescentar modelo aqui pede acrescentar o id no CHECK `al_modelo` da migration.
 */

export type ModeloDeArte = 'deu-a-louca' | 'parabens' | 'recado' | 'imagem';
export type TemaDaArte = 'amarelo' | 'ouro' | 'fogo' | 'oceano' | 'claro';
export type ConteudoDaArte = Record<string, string>;

export interface CampoDoModelo {
  id: string;
  rotulo: string;
  max: number;
  dica?: string;
  longo?: boolean;
  opcional?: boolean;
}

export interface DefinicaoDoModelo {
  id: ModeloDeArte;
  nome: string;
  descricao: string;
  emoji: string;
  campos: CampoDoModelo[];
  padrao: ConteudoDaArte;
  temaPadrao: TemaDaArte;
  /** Entra com confete. */
  festa: boolean;
  /** O nome que vai para a lista do painel, tirado dos campos. */
  tituloDe: (c: ConteudoDaArte) => string;
}

export const MODELOS: DefinicaoDoModelo[] = [
  {
    id: 'deu-a-louca', nome: 'Deu a louca na gerente', emoji: '🤪', temaPadrao: 'amarelo', festa: true,
    descricao: 'O valor que o time fez, parabéns e o desafio com o prêmio. Para quando a gerente «pira» e solta um prêmio.',
    campos: [
      { id: 'chamada', rotulo: 'Chamada', max: 40 },
      { id: 'rotuloValor', rotulo: 'Texto acima do valor', max: 40 },
      { id: 'valor', rotulo: 'Valor feito', max: 24, dica: 'Ex.: R$ 503.997,49' },
      { id: 'parabens', rotulo: 'Parabéns', max: 60 },
      // 17/11/2026: o recado de quando o resultado não veio — agradecer a cada um.
      { id: 'agradecimento', rotulo: 'Agradecimento', max: 130, longo: true, opcional: true },
      { id: 'rotuloMeta', rotulo: 'Texto do desafio', max: 50 },
      { id: 'meta', rotulo: 'Valor do desafio', max: 24, dica: 'Ex.: R$ 1.500.000,00' },
      { id: 'premio', rotulo: 'O prêmio', max: 60 },
      { id: 'rodape', rotulo: 'Rodapé', max: 70, opcional: true },
    ],
    padrao: {
      chamada: 'Deu a louca na gerente!',
      rotuloValor: 'Ontem fizemos',
      valor: 'R$ 503.997,49',
      parabens: 'Parabéns, time! 👏',
      agradecimento: 'Não chegamos ao resultado, mas agradeço a cada um de vocês pelo esforço e pela garra.',
      rotuloMeta: 'Agora, se o total chegar a',
      meta: 'R$ 1.500.000,00',
      premio: 'Todo mundo sai 1 hora mais cedo!',
      rodape: 'Vocês são incríveis! Parabéns a cada um — bora juntos 🚀',
    },
    tituloDe: c => c.chamada || 'Deu a louca na gerente',
  },
  {
    id: 'parabens', nome: 'Parabéns', emoji: '🏆', temaPadrao: 'ouro', festa: true,
    descricao: 'Comemorar um valor, uma meta batida ou um destaque.',
    campos: [
      { id: 'selo', rotulo: 'Selo', max: 30 },
      { id: 'titulo', rotulo: 'Título', max: 50 },
      { id: 'valor', rotulo: 'Valor em destaque', max: 24, opcional: true },
      { id: 'texto', rotulo: 'Texto', max: 200, longo: true, opcional: true },
      { id: 'rodape', rotulo: 'Rodapé', max: 60, opcional: true },
    ],
    padrao: {
      selo: 'Parabéns, time!',
      titulo: 'Batemos a meta do dia',
      valor: 'R$ 500.000,00',
      texto: 'Obrigado pelo empenho de cada um. Amanhã tem mais!',
      rodape: 'Gestão',
    },
    tituloDe: c => c.titulo || c.selo || 'Parabéns',
  },
  {
    id: 'recado', nome: 'Recado', emoji: '📣', temaPadrao: 'oceano', festa: false,
    descricao: 'Um aviso para todo mundo: título, texto e um emoji.',
    campos: [
      { id: 'emoji', rotulo: 'Emoji', max: 8 },
      { id: 'titulo', rotulo: 'Título', max: 60 },
      { id: 'texto', rotulo: 'Texto', max: 320, longo: true },
      { id: 'rodape', rotulo: 'Rodapé', max: 60, opcional: true },
    ],
    padrao: {
      emoji: '📣',
      titulo: 'Atenção, time',
      texto: 'Escreva aqui o recado.',
      rodape: '',
    },
    tituloDe: c => c.titulo || 'Recado',
  },
  {
    id: 'imagem', nome: 'Imagem própria', emoji: '🖼️', temaPadrao: 'claro', festa: false,
    descricao: 'Uma arte pronta (feita no Canva, por exemplo): envie a imagem e, se quiser, uma legenda.',
    campos: [
      { id: 'imagem', rotulo: 'Imagem', max: 600 },
      { id: 'legenda', rotulo: 'Legenda', max: 120, opcional: true },
    ],
    padrao: { imagem: '', legenda: '' },
    tituloDe: c => c.legenda || 'Imagem',
  },
];

export const modeloPorId = (id: string): DefinicaoDoModelo | undefined => MODELOS.find(m => m.id === id);

export interface CoresDoTema { nome: string; fundo: string; fundo2: string; texto: string; suave: string; destaque: string; sobreDestaque: string; faixa: string; sobreFaixa: string }

/** As cores de cada tema. Nada de roxo (ver as cores do Gestão). */
export const TEMAS: Record<TemaDaArte, CoresDoTema> = {
  amarelo: { nome: 'Amarelo louco', fundo: '#FFD21F', fundo2: '#FFB800', texto: '#111111', suave: '#3A3000', destaque: '#E3172B', sobreDestaque: '#FFFFFF', faixa: '#111111', sobreFaixa: '#FFD21F' },
  ouro:    { nome: 'Grafite e ouro', fundo: '#17181C', fundo2: '#2A2B31', texto: '#FFFFFF', suave: '#C9C3B4', destaque: '#E8B931', sobreDestaque: '#17181C', faixa: '#0B0C0E', sobreFaixa: '#E8B931' },
  fogo:    { nome: 'Fogo', fundo: '#C8161D', fundo2: '#F2541B', texto: '#FFFFFF', suave: '#FFE1CC', destaque: '#FFD21F', sobreDestaque: '#2A0A00', faixa: '#2A0A00', sobreFaixa: '#FFD21F' },
  oceano:  { nome: 'Oceano', fundo: '#0B4F6C', fundo2: '#0A7F8F', texto: '#FFFFFF', suave: '#CBEFF2', destaque: '#5EEAD4', sobreDestaque: '#06303F', faixa: '#06303F', sobreFaixa: '#5EEAD4' },
  claro:   { nome: 'Claro', fundo: '#FFFFFF', fundo2: '#EEF3F5', texto: '#14232B', suave: '#4C5F68', destaque: '#0F766E', sobreDestaque: '#FFFFFF', faixa: '#14232B', sobreFaixa: '#FFFFFF' },
};

export const ehTema = (t: string): t is TemaDaArte => t in TEMAS;

/** O que falta preencher (rótulos), ou lista vazia. */
export function camposFaltando(modelo: DefinicaoDoModelo, c: ConteudoDaArte): string[] {
  return modelo.campos.filter(f => !f.opcional && !(c[f.id] ?? '').trim()).map(f => f.rotulo);
}

/** Só os campos do modelo, cortados no tamanho máximo — o que vai para o banco. */
export function limparConteudo(modelo: DefinicaoDoModelo, c: ConteudoDaArte): ConteudoDaArte {
  return Object.fromEntries(modelo.campos.map(f => [f.id, (c[f.id] ?? '').trim().slice(0, f.max)]));
}

/** O que vem do banco, à prova de campo faltando ou de tipo errado. */
export function conteudoDoBanco(modelo: DefinicaoDoModelo, bruto: unknown): ConteudoDaArte {
  const o = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {};
  return Object.fromEntries(modelo.campos.map(f => [f.id, typeof o[f.id] === 'string' ? (o[f.id] as string) : '']));
}

/** A imagem própria só pode vir de https (o nosso storage) — `blob:` só na prévia do laboratório. */
export const imagemSegura = (url: string) => /^(https:\/\/|blob:)/i.test(url.trim());

/** Status de uma arte lançada, pela hora de agora. */
export type SituacaoDaArte = 'no_ar' | 'agendada' | 'terminou' | 'encerrada';
export function situacaoDaArte(a: { inicio: string; fim: string | null; encerrada_em: string | null }, agora = new Date()): SituacaoDaArte {
  if (a.encerrada_em) return 'encerrada';
  if (new Date(a.inicio) > agora) return 'agendada';
  if (a.fim && new Date(a.fim) <= agora) return 'terminou';
  return 'no_ar';
}

/** Fim do dia de hoje (23:59) no fuso do navegador, para o campo datetime-local. */
export function fimDeHojeLocal(agora = new Date()): string {
  const d = new Date(agora);
  d.setHours(23, 59, 0, 0);
  return paraDatetimeLocal(d);
}

export function paraDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
