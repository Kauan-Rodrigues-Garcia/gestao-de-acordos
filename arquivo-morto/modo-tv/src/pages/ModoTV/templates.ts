/**
 * templates.ts — a galeria do Modo TV.
 *
 * ## O que é um template aqui
 *
 * Uma RECEITA: um punhado de fontes já posicionadas, dimensionadas e
 * configuradas. Escolher um template não cria um objeto novo no banco — cria as
 * mesmas `tv_fontes` que a pessoa criaria à mão, só que prontas.
 *
 * É por isso que o modelo cabe sem migration nenhuma: um template novo é uma
 * entrada nesta lista. Se ele precisasse de uma tabela, cada ideia de layout
 * viraria um deploy, e a galeria pararia de crescer no primeiro mês.
 *
 * ## Por que `modelo` e não `tipo`
 *
 * `tv_fontes.tipo` tem CHECK no banco e é a família do dado: meta é meta,
 * ranking é ranking. O DESENHO fica em `config.modelo`, que é jsonb livre.
 *
 * Assim «Meta em barra», «Meta em rosca» e «Meta em termômetro» são três
 * templates lendo os MESMOS números — e acrescentar o quarto é escrever o
 * desenho no `Palco` e a receita aqui, sem tocar no banco.
 *
 * ## Os números são sempre do relatório
 *
 * Nenhum template guarda valor. Todos leem `fn_tv_metricas_setor`, que resolve
 * alvo, realizado, dias úteis e projeção com a MESMA régua do dashboard. A
 * única exceção é a meta diária, que aceita um valor digitado — e mesmo aí o
 * REALIZADO continua vindo do relatório. Ver `meta_diaria_manual`.
 */
import type { TipoFonte } from './geometria';

/** As prateleiras da loja. A ordem é a que a pessoa vê. */
export const CATEGORIAS = [
  { id: 'metas',    nome: 'Metas',        descricao: 'Quanto falta, quanto já veio, e como está o ritmo' },
  { id: 'diaria',   nome: 'Meta diária',  descricao: 'O alvo de hoje, e o que já entrou hoje' },
  { id: 'ranking',  nome: 'Ranking',      descricao: 'Quem está produzindo, do setor ou de uma equipe' },
  { id: 'jogos',    nome: 'Jogos',        descricao: 'Roleta, bingo e sorteio na parede' },
  { id: 'basicos',  nome: 'Básicos',      descricao: 'Texto, imagem, vídeo, relógio e fundo' },
] as const;

export type CategoriaId = typeof CATEGORIAS[number]['id'];

/** Uma fonte da receita, no mesmo formato que `tv_fontes` guarda. */
export interface FonteDoTemplate {
  tipo: TipoFonte;
  config: Record<string, unknown>;
  x: number;
  y: number;
  largura: number;
  escala?: number;
  /** Camada RELATIVA dentro do template; a base sai da cena na hora de aplicar. */
  camada?: number;
}

export interface Template {
  id: string;
  nome: string;
  /** Uma frase. O que a pessoa vai ver na parede, não como foi feito. */
  descricao: string;
  categoria: CategoriaId;
  /** Desenhado no cartão da galeria — ver `MiniaturaTemplate`. */
  amostra: 'barra' | 'rosca' | 'projecao' | 'diaria' | 'termometro' | 'placar'
         | 'ranking' | 'podio' | 'roleta' | 'bingo' | 'sorteio' | 'texto'
         | 'imagem' | 'video' | 'relogio' | 'fundo' | 'desafio';
  fontes: FonteDoTemplate[];
}

/*
 * Os modelos de meta.
 *
 * Todos leem o mesmo pacote de `fn_tv_metricas_setor`. O que muda é qual número
 * ganha o palco: «quanto já veio» (barra, rosca), «vai dar?» (projeção),
 * «e hoje?» (diária), «quanto falta» (termômetro).
 */
export const TEMPLATES: Template[] = [
  // ── Metas ─────────────────────────────────────────────────────────────────
  {
    id: 'meta-barra',
    nome: 'Meta em barra',
    descricao: 'A barra enche conforme o setor recebe, com o percentual em corpo grande.',
    categoria: 'metas',
    amostra: 'barra',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 60,
      config: { modelo: 'barra', titulo: 'Meta do mês', mostrar_valor: true },
    }],
  },
  {
    id: 'meta-rosca',
    nome: 'Meta em rosca',
    descricao: 'Anel que fecha ao bater a meta. Ocupa pouco e lê bem de longe.',
    categoria: 'metas',
    amostra: 'rosca',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 34,
      config: { modelo: 'rosca', titulo: 'Meta do mês', mostrar_valor: true },
    }],
  },
  {
    id: 'meta-projecao',
    nome: 'Projeção do mês',
    descricao: 'No ritmo de hoje, onde o mês termina — e a distância até a meta.',
    categoria: 'metas',
    amostra: 'projecao',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 62,
      config: { modelo: 'projecao', titulo: 'Projeção do mês' },
    }],
  },
  {
    id: 'meta-termometro',
    nome: 'Termômetro',
    descricao: 'Coluna que sobe com o recebido. Bom para cena vertical, ao lado do ranking.',
    categoria: 'metas',
    amostra: 'termometro',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 22,
      config: { modelo: 'termometro', titulo: 'Meta' },
    }],
  },
  {
    id: 'meta-placar',
    nome: 'Placar do mês',
    descricao: 'Recebido, meta e quanto falta, lado a lado. Sem gráfico — só os números.',
    categoria: 'metas',
    amostra: 'placar',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 76,
      config: { modelo: 'placar', titulo: 'Como estamos' },
    }],
  },
  {
    id: 'meta-completa',
    nome: 'Painel da meta',
    descricao: 'Título, rosca e placar montados numa cena só. O mais completo da prateleira.',
    categoria: 'metas',
    amostra: 'rosca',
    fontes: [
      {
        tipo: 'fundo', x: 50, y: 50, largura: 100, camada: -1,
        config: { cor: '#0b1f2a', cor_2: '#07323f', angulo: 160 },
      },
      {
        tipo: 'texto', x: 50, y: 13, largura: 80,
        config: { texto: 'META DO MÊS', tamanho: 78, cor: '#7fd8e8', peso: 800, alinhamento: 'center' },
      },
      {
        tipo: 'meta', x: 50, y: 44, largura: 32,
        config: { modelo: 'rosca', titulo: '', mostrar_valor: true },
      },
      {
        tipo: 'meta', x: 50, y: 82, largura: 80,
        config: { modelo: 'placar', titulo: '' },
      },
    ],
  },

  // ── Meta diária ───────────────────────────────────────────────────────────
  {
    id: 'diaria-alvo',
    nome: 'Meta de hoje',
    descricao: 'O alvo do dia e quanto já entrou. O alvo sai da meta do mês ÷ dias úteis.',
    categoria: 'diaria',
    amostra: 'diaria',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 58,
      config: { modelo: 'diaria', titulo: 'Meta de hoje', origem: 'mensal' },
    }],
  },
  {
    id: 'diaria-desafio',
    nome: 'Meta desafio do dia',
    descricao: 'Um alvo digitado à mão para hoje. O que entrou continua vindo do relatório.',
    categoria: 'diaria',
    amostra: 'diaria',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 58,
      config: {
        modelo: 'diaria', titulo: 'Desafio de hoje',
        origem: 'manual', meta_diaria_manual: 30000,
      },
    }],
  },
  {
    id: 'diaria-ritmo',
    nome: 'Ritmo necessário',
    descricao: 'Quanto precisa entrar por dia útil para fechar o mês. Sobe quando se fica para trás.',
    categoria: 'diaria',
    amostra: 'diaria',
    fontes: [{
      tipo: 'meta', x: 50, y: 50, largura: 58,
      config: { modelo: 'ritmo', titulo: 'Precisamos por dia' },
    }],
  },

  // ── Ranking ───────────────────────────────────────────────────────────────
  {
    id: 'ranking-lista',
    nome: 'Ranking em lista',
    descricao: 'Os primeiros colocados do setor, numerados, com foto e valor.',
    categoria: 'ranking',
    amostra: 'ranking',
    fontes: [{
      tipo: 'ranking', x: 50, y: 50, largura: 55,
      config: { modelo: 'lista', titulo: 'Ranking do mês', quantidade: 5, mostrar_valor: true },
    }],
  },
  {
    id: 'ranking-podio',
    nome: 'Pódio',
    descricao: 'Os três primeiros em destaque, no formato de pódio.',
    categoria: 'ranking',
    amostra: 'podio',
    fontes: [{
      tipo: 'ranking', x: 50, y: 55, largura: 62,
      config: { modelo: 'podio', titulo: 'Pódio do mês', quantidade: 3, mostrar_valor: true },
    }],
  },
  {
    id: 'ranking-equipe',
    nome: 'Ranking de uma equipe',
    descricao: 'O mesmo ranking, recortado numa equipe. Escolha qual no painel da fonte.',
    categoria: 'ranking',
    amostra: 'ranking',
    fontes: [{
      tipo: 'ranking', x: 50, y: 50, largura: 55,
      config: { modelo: 'lista', titulo: 'Ranking da equipe', quantidade: 5, mostrar_valor: true },
    }],
  },

  // ── Jogos ─────────────────────────────────────────────────────────────────
  {
    id: 'jogo-roleta',
    nome: 'Roleta',
    descricao: 'A roda gira na parede e para no sorteado. A lista e o visual se configuram na fonte.',
    categoria: 'jogos',
    amostra: 'roleta',
    fontes: [{
      tipo: 'sorteio', x: 50, y: 50, largura: 55,
      config: { modelo: 'roleta', titulo: 'Roleta' },
    }],
  },
  {
    id: 'jogo-bingo',
    nome: 'Bingo',
    descricao: 'A cartela na parede e o número sorteado em destaque a cada rodada.',
    categoria: 'jogos',
    amostra: 'bingo',
    fontes: [{
      tipo: 'sorteio', x: 50, y: 50, largura: 70,
      config: { modelo: 'bingo', titulo: 'Bingo' },
    }],
  },
  {
    id: 'jogo-sorteio',
    nome: 'Sorteio de pessoa',
    descricao: 'Contagem regressiva e o nome com foto aparecendo. Escolha quem participa no painel.',
    categoria: 'jogos',
    amostra: 'sorteio',
    fontes: [{
      tipo: 'sorteio', x: 50, y: 50, largura: 60,
      config: { modelo: 'sorteio', titulo: 'Sorteio' },
    }],
  },
  {
    id: 'jogo-desafio',
    nome: 'Desafio em cartaz',
    descricao: 'O desafio ativo do setor: nome, prêmio e quantos dias faltam.',
    categoria: 'jogos',
    amostra: 'desafio',
    fontes: [{
      tipo: 'desafio', x: 50, y: 50, largura: 55,
      config: { titulo: 'Desafio' },
    }],
  },

  // ── Básicos ───────────────────────────────────────────────────────────────
  {
    id: 'basico-titulo',
    nome: 'Título grande',
    descricao: 'Uma frase em corpo alto, legível do fundo da sala.',
    categoria: 'basicos',
    amostra: 'texto',
    fontes: [{
      tipo: 'texto', x: 50, y: 50, largura: 70,
      config: { texto: 'Escreva aqui', tamanho: 110, cor: '#ffffff', peso: 800, alinhamento: 'center' },
    }],
  },
  {
    id: 'basico-imagem',
    nome: 'Imagem',
    descricao: 'Foto, arte ou logo. Também dá para soltar o arquivo direto na prévia.',
    categoria: 'basicos',
    amostra: 'imagem',
    fontes: [{ tipo: 'imagem', x: 50, y: 50, largura: 40, config: { url: '', ajuste: 'cover' } }],
  },
  {
    id: 'basico-video',
    nome: 'Vídeo',
    descricao: 'Vídeo em laço. Começa mudo — a TV libera o som num clique.',
    categoria: 'basicos',
    amostra: 'video',
    fontes: [{ tipo: 'video', x: 50, y: 50, largura: 50, config: { url: '', ajuste: 'cover' } }],
  },
  {
    id: 'basico-relogio',
    nome: 'Relógio',
    descricao: 'A hora, em corpo grande, no canto que você escolher.',
    categoria: 'basicos',
    amostra: 'relogio',
    fontes: [{
      tipo: 'relogio', x: 88, y: 10, largura: 22,
      config: { tamanho: 96, cor: '#ffffff', segundos: false },
    }],
  },
  {
    id: 'basico-fundo',
    nome: 'Fundo em degradê',
    descricao: 'A base da cena. Nasce atrás de tudo, como fundo deve nascer.',
    categoria: 'basicos',
    amostra: 'fundo',
    fontes: [{
      tipo: 'fundo', x: 50, y: 50, largura: 100, camada: -1,
      config: { cor: '#0d1b24', cor_2: '#08323d', angulo: 160 },
    }],
  },
];

/** Os templates de uma prateleira, na ordem em que foram escritos. */
export function templatesDaCategoria(id: CategoriaId): Template[] {
  return TEMPLATES.filter(t => t.categoria === id);
}

/**
 * O alvo diário que o template está usando.
 *
 * `origem: 'manual'` usa o número digitado; qualquer outra coisa usa a meta do
 * mês dividida pelos dias úteis, que é o que `fn_tv_metricas_setor` já calculou.
 *
 * O REALIZADO nunca passa por aqui — ele vem do relatório em qualquer um dos
 * dois casos. Um alvo digitado é uma decisão da liderança; o que entrou é fato,
 * e fato não se digita.
 */
export function alvoDiario(
  config: Record<string, unknown>,
  metaDiariaCalculada: number,
): number {
  if (config.origem === 'manual') {
    const bruto = Number(config.meta_diaria_manual);
    if (Number.isFinite(bruto) && bruto > 0) return bruto;
  }
  return metaDiariaCalculada;
}
