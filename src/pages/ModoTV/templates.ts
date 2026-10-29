/**
 * templates.ts — a vitrine do Modo TV 2.
 *
 * Cada template é UMA tela cheia, pronta. O líder não posiciona nada: escolhe
 * o template, ajusta duas ou três opções e põe no rodízio. Foi essa a troca
 * pedida em 27/10/2026 — a mesa antiga (fontes arrastáveis, camadas, corte)
 * fazia tudo e ninguém usou.
 *
 * Um template novo é uma entrada aqui e um desenho em `TelaTv.tsx`. O banco
 * não muda: `tv_paineis.telas` é jsonb.
 *
 * ## Os números são sempre do relatório
 *
 * Nenhum template guarda valor. A única exceção é o alvo de «Meta de hoje»,
 * que aceita um número digitado — o recebido continua vindo do relatório.
 */
import type { TelaDoPainel, TemaId, TemplateId } from './tipos';

export type CategoriaTemplate = 'meta' | 'ranking' | 'midia';

export const CATEGORIAS: { id: CategoriaTemplate; nome: string }[] = [
  { id: 'meta',    nome: 'Metas' },
  { id: 'ranking', nome: 'Ranking' },
  { id: 'midia',   nome: 'Imagem, vídeo e recado' },
];

/** Campo que só aparece quando outro tem um certo valor (ex.: o valor da meta própria). */
interface Condicao { quando?: { chave: string; valor: string } }

export type CampoOpcao = Condicao & (
  | { chave: string; rotulo: string; tipo: 'texto'; padrao: string; max: number; dica?: string }
  | { chave: string; rotulo: string; tipo: 'numero'; padrao: number | null; dica?: string }
  | { chave: string; rotulo: string; tipo: 'escolha'; padrao: string; escolhas: { valor: string; rotulo: string }[] }
  | { chave: string; rotulo: string; tipo: 'liga'; padrao: boolean }
  | { chave: string; rotulo: string; tipo: 'midia'; padrao: string; aceita: 'imagem' | 'video' });

export interface Template {
  id: TemplateId;
  nome: string;
  /** Uma frase: o que aparece na parede. */
  descricao: string;
  categoria: CategoriaTemplate;
  campos: CampoOpcao[];
}

const TITULO = (padrao: string): CampoOpcao =>
  ({ chave: 'titulo', rotulo: 'Título', tipo: 'texto', padrao, max: 40 });

/**
 * Há líder que não mostra a meta para o time, só o quanto falta (Cleber,
 * 27/10). Desligado, some a meta E o recebido — com os dois e o «falta» na
 * tela, a meta sai numa conta de somar.
 */
const MOSTRAR_META: CampoOpcao =
  { chave: 'mostrar_meta', rotulo: 'Mostrar o valor da meta e do recebido', tipo: 'liga', padrao: true };

export const TEMPLATES: Template[] = [
  {
    id: 'contagem', categoria: 'meta',
    nome: 'Contagem regressiva',
    descricao: 'Quanto falta para a meta, em número gigante. Diminui a cada relatório que entra.',
    campos: [TITULO('Faltam para a meta'), MOSTRAR_META],
  },
  {
    id: 'barra', categoria: 'meta',
    nome: 'Meta em barra',
    descricao: 'O percentual em destaque e a barra enchendo conforme o recebido.',
    campos: [TITULO('Meta do mês'), MOSTRAR_META],
  },
  {
    id: 'anel', categoria: 'meta',
    nome: 'Anel da meta',
    descricao: 'Um anel que fecha ao bater a meta. Lê bem do fundo da sala.',
    campos: [TITULO('Meta do mês'), MOSTRAR_META],
  },
  {
    id: 'hoje', categoria: 'meta',
    nome: 'Meta de hoje',
    descricao: 'O alvo do dia, quanto já entrou hoje e o percentual. A meta pode ser a do sistema ou uma própria.',
    campos: [
      TITULO('Meta de hoje'),
      { chave: 'origem_alvo', rotulo: 'Meta do dia', tipo: 'escolha', padrao: 'sistema',
        escolhas: [{ valor: 'sistema', rotulo: 'Meta do sistema' }, { valor: 'propria', rotulo: 'Outra meta' }] },
      { chave: 'alvo_manual', rotulo: 'Valor da meta de hoje (R$)', tipo: 'numero', padrao: null,
        quando: { chave: 'origem_alvo', valor: 'propria' },
        dica: 'O percentual e o «falta» passam a contar sobre este valor. O recebido continua vindo do relatório.' },
    ],
  },
  {
    id: 'grafico', categoria: 'meta',
    nome: 'Evolução do mês',
    descricao: 'Gráfico do recebido dia a dia rumo à meta, com o ritmo ideal. Cresce a cada relatório.',
    campos: [TITULO('Evolução do mês'), MOSTRAR_META],
  },
  {
    id: 'ritmo', categoria: 'meta',
    nome: 'Ritmo e projeção',
    descricao: 'Quanto precisa entrar por dia útil e onde o mês fecha no ritmo atual.',
    campos: [TITULO('Nosso ritmo')],
  },
  {
    id: 'placar', categoria: 'meta',
    nome: 'Placar do mês',
    descricao: 'Recebido, meta e quanto falta, lado a lado. Só os números.',
    campos: [TITULO('Como estamos')],
  },
  {
    id: 'podio', categoria: 'ranking',
    nome: 'Pódio',
    descricao: 'Os três primeiros do mês, com foto, no formato de pódio.',
    campos: [
      TITULO('Pódio do mês'),
      { chave: 'mostrar_valor', rotulo: 'Mostrar o valor de cada um', tipo: 'liga', padrao: true },
    ],
  },
  {
    id: 'lista', categoria: 'ranking',
    nome: 'Ranking em lista',
    descricao: 'Os primeiros colocados numerados, com foto e valor.',
    campos: [
      TITULO('Ranking do mês'),
      { chave: 'quantidade', rotulo: 'Quantos aparecem', tipo: 'escolha', padrao: '5',
        escolhas: [{ valor: '5', rotulo: 'Top 5' }, { valor: '10', rotulo: 'Top 10' }] },
      { chave: 'mostrar_valor', rotulo: 'Mostrar o valor de cada um', tipo: 'liga', padrao: true },
    ],
  },
  {
    id: 'imagem', categoria: 'midia',
    nome: 'Imagem',
    descricao: 'Uma arte, foto ou campanha em tela cheia.',
    campos: [
      { chave: 'url', rotulo: 'Imagem', tipo: 'midia', padrao: '', aceita: 'imagem' },
      { chave: 'ajuste', rotulo: 'Encaixe', tipo: 'escolha', padrao: 'contain',
        escolhas: [{ valor: 'contain', rotulo: 'Inteira' }, { valor: 'cover', rotulo: 'Preencher a tela' }] },
      { chave: 'legenda', rotulo: 'Legenda (opcional)', tipo: 'texto', padrao: '', max: 80 },
    ],
  },
  {
    id: 'video', categoria: 'midia',
    nome: 'Vídeo',
    descricao: 'Um vídeo em tela cheia, com ou sem som.',
    // Fora dos campos, gravados pelo editor: `duracao_arquivo` (segundos do
    // vídeo, medidos no envio) e `tempo_do_arquivo` (a tela dura o vídeo).
    campos: [
      { chave: 'url', rotulo: 'Vídeo', tipo: 'midia', padrao: '', aceita: 'video' },
      { chave: 'ajuste', rotulo: 'Encaixe', tipo: 'escolha', padrao: 'contain',
        escolhas: [{ valor: 'contain', rotulo: 'Inteiro' }, { valor: 'cover', rotulo: 'Preencher a tela' }] },
      { chave: 'com_som', rotulo: 'Tocar o som do vídeo', tipo: 'liga', padrao: false },
    ],
  },
  {
    id: 'recado', categoria: 'midia',
    nome: 'Recado',
    descricao: 'Uma frase grande do líder para o time, com a hora ao lado.',
    campos: [
      { chave: 'texto', rotulo: 'Recado', tipo: 'texto', padrao: 'Bora bater a meta!', max: 120 },
      { chave: 'assinatura', rotulo: 'Assinatura (opcional)', tipo: 'texto', padrao: '', max: 40 },
    ],
  },
];

const POR_ID = new Map(TEMPLATES.map(t => [t.id, t]));

export function templateDe(id: string): Template | null {
  return POR_ID.get(id as TemplateId) ?? null;
}

/**
 * O valor de uma opção, já no tipo do campo. O que veio do banco e não
 * confere com o campo (texto onde é número, chave que sumiu) cai no padrão.
 */
export function opcao<T extends string | number | boolean | null>(
  tela: Pick<TelaDoPainel, 'template' | 'opcoes'>,
  chave: string,
): T {
  const campo = templateDe(tela.template)?.campos.find(c => c.chave === chave);
  const bruto = tela.opcoes?.[chave];
  if (!campo) return (bruto ?? null) as T;
  switch (campo.tipo) {
    case 'texto':
    case 'midia':
      return (typeof bruto === 'string' ? bruto.slice(0, campo.tipo === 'texto' ? campo.max : 2048) : campo.padrao) as T;
    case 'numero': {
      const n = typeof bruto === 'number' ? bruto : typeof bruto === 'string' && bruto.trim() ? Number(bruto) : NaN;
      return (Number.isFinite(n) && n > 0 ? n : campo.padrao) as T;
    }
    case 'liga':
      return (typeof bruto === 'boolean' ? bruto : campo.padrao) as T;
    case 'escolha':
      return (campo.escolhas.some(e => e.valor === bruto) ? bruto : campo.padrao) as T;
  }
}

/**
 * A meta de hoje escolhida na tela «Meta de hoje»: o valor digitado quando a
 * origem é «Outra meta», ou `null` para a do sistema (meta do mês ÷ dias úteis).
 *
 * Tela gravada antes da escolha existir (só com `alvo_manual`) conta como
 * «Outra meta» — era o que ela já fazia.
 */
export function alvoDoDiaProprio(tela: Pick<TelaDoPainel, 'template' | 'opcoes'>): number | null {
  if (tela.template !== 'hoje') return null;
  const valor = opcao<number | null>(tela, 'alvo_manual');
  const origem = tela.opcoes?.origem_alvo;
  const propria = origem === 'propria' || (origem === undefined && valor != null);
  return propria && valor != null && valor > 0 ? valor : null;
}

/**
 * Campo condicional escondido: o `quando` aponta outro campo, e ele não tem o
 * valor pedido. Lê pelo `opcao`, então a regra de compatibilidade acima vale.
 */
export function campoVisivel(tela: Pick<TelaDoPainel, 'template' | 'opcoes'>, campo: CampoOpcao): boolean {
  if (!campo.quando) return true;
  if (tela.template === 'hoje' && campo.quando.chave === 'origem_alvo') {
    const origem = tela.opcoes?.origem_alvo;
    const propria = origem === 'propria' || (origem === undefined && tela.opcoes?.alvo_manual != null && tela.opcoes?.alvo_manual !== '');
    return (propria ? 'propria' : 'sistema') === campo.quando.valor;
  }
  return opcao<string>(tela, campo.quando.chave) === campo.quando.valor;
}

/** Uma tela nova, com o id que a lista do editor usa como chave. */
export function novaTela(template: TemplateId): TelaDoPainel {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t${Date.now()}${Math.random().toString(16).slice(2)}`;
  // Vídeo nasce com «Duração do arquivo» (Cleber, 29/10).
  return { id, template, opcoes: template === 'video' ? { tempo_do_arquivo: true } : {} };
}

/** As telas que vieram do banco, sem o que não dá para desenhar. */
export function telasValidas(bruto: unknown): TelaDoPainel[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((t): TelaDoPainel[] => {
    if (!t || typeof t !== 'object') return [];
    const { id, template, opcoes, segundos } = t as Record<string, unknown>;
    if (typeof id !== 'string' || !templateDe(String(template))) return [];
    return [{
      id,
      template: template as TemplateId,
      opcoes: opcoes && typeof opcoes === 'object' && !Array.isArray(opcoes) ? opcoes as Record<string, unknown> : {},
      segundos: segundosValidos(segundos),
    }];
  });
}

// ── Tempo de cada tela ───────────────────────────────────────────────────────

export const SEGUNDOS_MIN = 5;
export const SEGUNDOS_MAX = 3600;

/** Segundos de uma tela vindos do jsonb: inteiro entre 5 s e 1 h, ou nulo (padrão). */
export function segundosValidos(v: unknown): number | null {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n >= SEGUNDOS_MIN && n <= SEGUNDOS_MAX ? n : null;
}

/** Quanto tempo esta tela fica na TV. */
export function segundosDaTela(tela: Pick<TelaDoPainel, 'segundos'>, padraoDoPainel: number): number {
  return segundosValidos(tela.segundos) ?? Math.min(SEGUNDOS_MAX, Math.max(SEGUNDOS_MIN, padraoDoPainel || 20));
}

/**
 * «Duração do arquivo»: o vídeo inteiro, mais 1 s de folga para ele carregar
 * na TV, entre 5 s e 1 h. Vai para `segundos` — o relógio do rodízio continua
 * o mesmo na TV e na prévia. `null` sem duração medida.
 */
export function segundosDoArquivo(duracao: unknown): number | null {
  const n = typeof duracao === 'number' ? duracao : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(SEGUNDOS_MAX, Math.max(SEGUNDOS_MIN, Math.ceil(n) + 1));
}

/** As escolhas prontas de tempo. O campo «outro» aceita qualquer valor entre 5 s e 1 h. */
export const TEMPOS_PRONTOS = [10, 15, 20, 30, 45, 60, 120, 300, 600];

/** «20 s», «1 min», «1 min 30 s», «1 h». */
export function rotuloTempo(s: number): string {
  if (s >= 3600) return '1 h';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/**
 * Só mídia do nosso balde vai para a parede.
 *
 * O jsonb das telas é escrito pelo cliente. Sem esta trava, quem alcança um
 * painel poria qualquer endereço da internet na TV da sala.
 */
export function midiaSegura(url: unknown, baseSupabase: string): string | null {
  if (typeof url !== 'string' || !url) return null;
  const prefixo = `${baseSupabase.replace(/\/+$/, '')}/storage/v1/object/public/tv/paineis/`;
  if (!url.startsWith(prefixo)) return null;
  if (/[\s"'<>\\]|\.\./.test(url.slice(prefixo.length))) return null;
  return url;
}

export const TEMAS: { id: TemaId; nome: string }[] = [
  { id: 'noite',    nome: 'Noite' },
  { id: 'grafite',  nome: 'Grafite' },
  { id: 'oceano',   nome: 'Oceano' },
  { id: 'floresta', nome: 'Floresta' },
  { id: 'vinho',    nome: 'Vinho' },
  { id: 'claro',    nome: 'Claro' },
];

export function temaValido(t: unknown): TemaId {
  return TEMAS.some(x => x.id === t) ? t as TemaId : 'noite';
}
