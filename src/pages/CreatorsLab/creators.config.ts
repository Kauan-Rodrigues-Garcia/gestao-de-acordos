/**
 * creators.config.ts — TODO o conteúdo do Creators Lab mora aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 * Se você veio editar nome, foto, filme, projeto ou contato: é neste arquivo, e
 * só neste. Nenhum componente do Creators Lab tem texto pessoal escrito dentro
 * dele — todos leem daqui.
 *
 * ## Placeholders
 *
 * O que ainda não foi informado está marcado com `PENDENTE(...)`. A interface
 * detecta esse formato e mostra o campo como "a preencher", em vez de exibir um
 * texto inventado. NADA aqui pode ser preenchido por adivinhação: idade,
 * telefone, GitHub, filme favorito — se não veio da pessoa, fica pendente.
 *
 * ## O que é REAL e pode ser exibido com confiança
 *
 * Os números em `PROJETO_REAL` foram medidos no repositório e no banco de
 * produção em 16/08/2026, durante a auditoria. Não são estimativa.
 */

/** Marca um campo ainda não fornecido. A UI trata como lacuna, não como texto. */
export function PENDENTE(oQue: string): string {
  return `⟦PENDENTE: ${oQue}⟧`;
}

/** O valor é um placeholder? Usado pelos componentes para não renderizar lixo. */
export function estaPendente(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith('⟦PENDENTE:');
}

/** Texto legível de um placeholder, para o modo de edição. */
export function textoPendente(valor: string): string {
  return valor.replace(/^⟦PENDENTE:\s*/, '').replace(/⟧$/, '');
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Habilidade {
  nome: string;
  /** 0 a 100. Vira barra no Arcade e medidor no Cyberpunk. */
  nivel: number;
}

export interface ItemInteresse {
  id: string;
  titulo: string;
  /** Emoji ou letra — usado enquanto não houver imagem. */
  simbolo: string;
  /** Caminho da imagem em /public. Vazio = usa o símbolo. */
  imagem?: string;
  /** 0 a 10. */
  nota?: number;
  descricao: string;
  porQue: string;
  curiosidade?: string;
}

export interface CategoriaInteresse {
  id: string;
  rotuloCyber: string;
  rotuloArcade: string;
  icone: string;
  itens: ItemInteresse[];
}

export interface Criador {
  id: 'kauan' | 'cleber';
  nome: string;
  papel: string;
  /** Uma linha, aparece no card. */
  tagline: string;
  sobre: string;
  foto?: string;
  /** Iniciais para o card sem foto. */
  iniciais: string;
  habilidades: Habilidade[];
  curiosidades: string[];
  categorias: CategoriaInteresse[];
  contato: {
    whatsapp?: string;
    github?: string;
    email?: string;
    linkedin?: string;
  };
  /** Golpe especial — piada do modo Arcade. */
  golpeEspecial: string;
  /** Commits reais neste repositório, medidos em 16/08/2026. */
  commits: number;
}

export interface ProjetoArquivo {
  id: string;
  nome: string;
  simbolo: string;
  resumo: string;
  descricao: string;
  tecnologias: string[];
  desafio: string;
  solucao: string;
  /** Identificador do mini app embutido, quando houver. */
  miniApp?: 'calculadora-desconto' | 'dias-uteis';
  ano?: string;
}

// ── Dados reais do projeto (auditoria de 16/08/2026) ─────────────────────────

export const PROJETO_REAL = {
  commitsTotal: 818,
  desde: '24/03/2026',
  linhasSrc: 135032,
  linhasTeste: 36245,
  testes: 2540,
  arquivosTeste: 159,
  linhasSql: 16696,
  usuarios: 199,
  empresas: 2,
  /** A pilha de verdade — nada aqui é aspiracional. */
  stack: [
    'React 18', 'TypeScript', 'Vite', 'Tailwind 4',
    'Framer Motion', 'React Router', 'Zustand', 'React Query',
    'Supabase', 'PostgreSQL 17', 'Vitest',
  ],
} as const;

// ── Os criadores ─────────────────────────────────────────────────────────────

export const CRIADORES: Criador[] = [
  {
    id: 'kauan',
    nome: 'Kauan',
    papel: PENDENTE('função do Kauan — ex.: Desenvolvedor Full Stack'),
    tagline: PENDENTE('uma linha sobre o Kauan'),
    sobre: PENDENTE('bio do Kauan — 2 a 4 frases'),
    iniciais: 'K',
    foto: undefined,   // PENDENTE: colocar em /public/creators/kauan.jpg
    commits: 175,
    habilidades: [
      { nome: 'CODE',   nivel: 0 },   // PENDENTE: ajustar níveis
      { nome: 'DESIGN', nivel: 0 },
      { nome: 'AI',     nivel: 0 },
      { nome: 'COFFEE', nivel: 0 },
    ],
    curiosidades: [
      PENDENTE('curiosidade 1 do Kauan'),
      PENDENTE('curiosidade 2 do Kauan'),
    ],
    categorias: [
      {
        id: 'filmes', rotuloCyber: 'DATA ARCHIVE', rotuloArcade: 'CARTRIDGE LIBRARY',
        icone: '🎬', itens: [],   // PENDENTE: filmes do Kauan
      },
      {
        id: 'jogos', rotuloCyber: 'SIM MODULES', rotuloArcade: 'GAME LIBRARY',
        icone: '🎮', itens: [],
      },
      {
        id: 'musica', rotuloCyber: 'AUDIO STREAM', rotuloArcade: 'SOUND TEST',
        icone: '🎵', itens: [],
      },
      {
        id: 'tecnologia', rotuloCyber: 'TECH STACK', rotuloArcade: 'POWER-UPS',
        icone: '💻', itens: [],
      },
    ],
    contato: {
      whatsapp: undefined,
      github: undefined,
      email: undefined,
    },
    golpeEspecial: PENDENTE('golpe especial do Kauan — ex.: console.log("funcionou")'),
  },
  {
    id: 'cleber',
    nome: 'Cleber',
    papel: PENDENTE('função do Cleber — ex.: Desenvolvedor Full Stack'),
    tagline: PENDENTE('uma linha sobre o Cleber'),
    sobre: PENDENTE('bio do Cleber — 2 a 4 frases'),
    iniciais: 'C',
    foto: undefined,   // PENDENTE: colocar em /public/creators/cleber.jpg
    commits: 172,
    habilidades: [
      { nome: 'CODE',   nivel: 0 },
      { nome: 'DESIGN', nivel: 0 },
      { nome: 'AI',     nivel: 0 },
      { nome: 'COFFEE', nivel: 0 },
    ],
    curiosidades: [
      PENDENTE('curiosidade 1 do Cleber'),
      PENDENTE('curiosidade 2 do Cleber'),
    ],
    categorias: [
      {
        id: 'filmes', rotuloCyber: 'DATA ARCHIVE', rotuloArcade: 'CARTRIDGE LIBRARY',
        icone: '🎬', itens: [],
      },
      {
        id: 'jogos', rotuloCyber: 'SIM MODULES', rotuloArcade: 'GAME LIBRARY',
        icone: '🎮', itens: [],
      },
      {
        id: 'musica', rotuloCyber: 'AUDIO STREAM', rotuloArcade: 'SOUND TEST',
        icone: '🎵', itens: [],
      },
      {
        id: 'tecnologia', rotuloCyber: 'TECH STACK', rotuloArcade: 'POWER-UPS',
        icone: '💻', itens: [],
      },
    ],
    contato: {
      whatsapp: undefined,
      github: undefined,
      email: undefined,
    },
    golpeEspecial: PENDENTE('golpe especial do Cleber'),
  },
];

// ── Arquivo de projetos ──────────────────────────────────────────────────────

export const PROJETOS: ProjetoArquivo[] = [
  {
    id: 'gestao-de-acordos',
    nome: 'Gestão de Acordos',
    simbolo: '🤝',
    resumo: 'O sistema em que este Easter Egg está escondido.',
    descricao:
      'Plataforma de cobrança e negociação de dívidas para duas operações que '
      + 'rodam sobre o mesmo código e o mesmo banco. Cuida do ciclo inteiro: '
      + 'tabulação do acordo, disputa de cliente entre operadores, conferência '
      + 'contra o relatório de recebimento, metas, comissão e auditoria.',
    tecnologias: [...PROJETO_REAL.stack],
    desafio:
      'Duas empresas com regras diferentes sobre o mesmo banco, e um acesso que '
      + 'precisa ser garantido mesmo para quem sabe abrir o console do navegador.',
    solucao:
      'Diferenças de operação centralizadas num único módulo de configuração, e '
      + 'acesso decidido por Row Level Security no PostgreSQL — a tela esconde '
      + 'botões, o banco recusa dados.',
    ano: '2026',
  },
  {
    id: 'calculadora-desconto',
    nome: 'Calculadora de Desconto',
    simbolo: '🧮',
    resumo: 'Mini aplicação funcional, rodando aqui dentro.',
    descricao:
      'Calcula desconto sobre um valor, com validação de entrada e formatação '
      + 'monetária brasileira. Não é captura de tela: funciona.',
    tecnologias: ['React', 'TypeScript'],
    desafio: 'Entrada de dinheiro em português aceita vírgula, ponto, ou os dois.',
    solucao: 'Interpretação tolerante do texto, com limites em 0% e 100%.',
    miniApp: 'calculadora-desconto',
    ano: '2026',
  },
  {
    id: 'dias-uteis',
    nome: 'Contador de Dias Úteis',
    simbolo: '📅',
    resumo: 'A regra que sustenta as metas do Gestão, isolada para brincar.',
    descricao:
      'Conta dias úteis entre duas datas, descontando fim de semana. É uma '
      + 'versão reduzida da regra que o Gestão usa para projetar meta do mês.',
    tecnologias: ['TypeScript'],
    desafio: 'Meta diária errada por um dia útil vira cobrança errada no mês inteiro.',
    solucao: 'Função pura, sem fuso e sem biblioteca de data, coberta por teste.',
    miniApp: 'dias-uteis',
    ano: '2026',
  },
];
