/**
 * themes.ts — os dois mundos do Creators Lab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Cyberpunk e Arcade não são duas paletas do mesmo layout. São duas
 * experiências que compartilham os MESMOS dados — o que muda é cor, tipografia,
 * forma, movimento e, principalmente, o **vocabulário**: a mesma seção se chama
 * "DATABASE" num e "CHARACTER SELECT" no outro.
 *
 * Toda diferença entre os temas vive neste arquivo. Se você encontrar um
 * `tema === 'cyberpunk'` dentro de um componente, é sinal de que faltou um
 * token aqui — acrescente o token em vez de espalhar a condicional.
 *
 * As cores viram variáveis CSS `--creator-*` aplicadas na raiz do Lab, então o
 * CSS não precisa saber qual tema está ativo.
 */

export type TemaCreators = 'cyberpunk' | 'arcade';

/** O vocabulário: a mesma coisa, dita de dois jeitos. */
export interface VocabularioTema {
  entrada:       string;
  perfis:        string;
  interesses:    string;
  projetos:      string;
  habilidades:   string;
  playground:    string;
  matematica:    string;
  terminal:      string;
  conquistas:    string;
  contato:       string;
  carregando:    string;
  sucesso:       string;
  erro:          string;
  voltar:        string;
  selecionar:    string;
  fechar:        string;
  /** Prefixo de identificação de uma pessoa. */
  sujeito:       (i: number) => string;
}

export interface TokensTema {
  id: TemaCreators;
  nome: string;
  descricao: string;
  /** Cores — viram `--creator-*` na raiz do Lab. */
  cores: {
    fundo:        string;
    fundoAlt:     string;
    superficie:   string;
    texto:        string;
    textoSuave:   string;
    primaria:     string;
    secundaria:   string;
    acento:       string;
    borda:        string;
    brilho:       string;
    grade:        string;
  };
  fontes: {
    display: string;
    corpo:   string;
    mono:    string;
  };
  /** Raio de canto: o Cyberpunk é anguloso, o Arcade é bloco. */
  raio: string;
  /** Espessura da borda dos cards. */
  bordaLargura: string;
  /** Sombra/brilho padrão dos cards. */
  sombra: string;
  /** Duração base das transições, em segundos. */
  duracao: number;
  /** Curva de aceleração. Cyberpunk desliza; Arcade estala. */
  easing: [number, number, number, number];
  /** Textura de fundo aplicada sobre o gradiente. */
  textura: 'scanlines' | 'pixels';
  /** Formato do cursor personalizado. */
  cursor: 'mira' | 'seletor';
  vocab: VocabularioTema;
}

/**
 * Cyberpunk — HUD técnico, holográfico, frio.
 *
 * Identidade própria: ciano e magenta sobre quase-preto azulado, tipografia
 * monoespaçada em toda a interface, cantos cortados e linhas de varredura. Não
 * copia nenhum jogo — o vocabulário é de banco de dados e transmissão, que é o
 * que este sistema realmente é.
 */
const CYBERPUNK: TokensTema = {
  id: 'cyberpunk',
  nome: 'CYBERPUNK',
  descricao: 'Interface técnica. Terminal, holograma e grade.',
  cores: {
    fundo:      '#05080D',
    fundoAlt:   '#0A1018',
    superficie: '#0D1622',
    texto:      '#D6F5FF',
    textoSuave: '#6E8CA0',
    primaria:   '#00E5FF',
    secundaria: '#FF2E97',
    acento:     '#B6FF3C',
    borda:      '#1B3A4B',
    brilho:     'rgba(0,229,255,.45)',
    grade:      'rgba(0,229,255,.07)',
  },
  fontes: {
    display: '"JetBrains Mono", ui-monospace, monospace',
    corpo:   '"JetBrains Mono", ui-monospace, monospace',
    mono:    '"JetBrains Mono", ui-monospace, monospace',
  },
  raio: '2px',
  bordaLargura: '1px',
  sombra: '0 0 0 1px rgba(0,229,255,.15), 0 0 24px rgba(0,229,255,.12)',
  duracao: 0.45,
  easing: [0.16, 1, 0.3, 1],
  textura: 'scanlines',
  cursor: 'mira',
  vocab: {
    entrada:     'SYSTEM BOOT',
    perfis:      'DATABASE',
    interesses:  'DATA ARCHIVE',
    projetos:    'MODULES',
    habilidades: 'SYSTEM STATS',
    playground:  'COMPILER',
    matematica:  'MATH // LAB',
    terminal:    'TERMINAL',
    conquistas:  'LOG',
    contato:     'TRANSMISSION',
    carregando:  'SYSTEM BOOT',
    sucesso:     'ACCESS GRANTED',
    erro:        'SYSTEM ERROR',
    voltar:      'DISCONNECT',
    selecionar:  'ACCESS',
    fechar:      'CLOSE',
    sujeito:     (i) => `SUBJECT_${String(i).padStart(2, '0')}`,
  },
};

/**
 * Arcade — máquina de fliperama, CRT, seleção de personagem.
 *
 * Amarelo e vermelho quentes sobre azul-noite, tipografia pesada e blocada,
 * cantos duros, sem brilho difuso — o Arcade é opaco onde o Cyberpunk é
 * luminoso. O vocabulário é de jogo de luta.
 */
const ARCADE: TokensTema = {
  id: 'arcade',
  nome: 'ARCADE',
  descricao: 'Fliperama. Seleção de lutador, CRT e placar.',
  cores: {
    fundo:      '#12082B',
    fundoAlt:   '#1B0D3D',
    superficie: '#241150',
    texto:      '#FFF3D6',
    textoSuave: '#B79BE0',
    primaria:   '#FFD23F',
    secundaria: '#FF3864',
    acento:     '#31E7B6',
    borda:      '#4A2A8C',
    brilho:     'rgba(255,210,63,.5)',
    grade:      'rgba(255,210,63,.06)',
  },
  fontes: {
    display: 'Impact, "Arial Black", "Inter", sans-serif',
    corpo:   'Inter, system-ui, sans-serif',
    mono:    '"JetBrains Mono", ui-monospace, monospace',
  },
  raio: '0px',
  bordaLargura: '3px',
  sombra: '4px 4px 0 rgba(0,0,0,.55)',
  duracao: 0.22,
  easing: [0.34, 1.56, 0.64, 1],
  textura: 'pixels',
  cursor: 'seletor',
  vocab: {
    entrada:     'INSERT COIN',
    perfis:      'SELECT YOUR DEVELOPER',
    interesses:  'CARTRIDGE LIBRARY',
    projetos:    'GAME LIBRARY',
    habilidades: 'FIGHTER STATS',
    playground:  'TRAINING MODE',
    matematica:  'BONUS STAGE',
    terminal:    'CHEAT CONSOLE',
    conquistas:  'HIGH SCORES',
    contato:     'CONTINUE?',
    carregando:  'LOADING STAGE',
    sucesso:     'PERFECT!',
    erro:        'GAME OVER',
    voltar:      'QUIT GAME',
    selecionar:  'SELECT',
    fechar:      'BACK',
    sujeito:     (i) => `PLAYER ${i}`,
  },
};

export const TEMAS: Record<TemaCreators, TokensTema> = {
  cyberpunk: CYBERPUNK,
  arcade:    ARCADE,
};

export const LISTA_TEMAS: TokensTema[] = [CYBERPUNK, ARCADE];

/**
 * Traduz os tokens em variáveis CSS.
 *
 * Aplicadas no elemento raiz do Lab (`.creators-lab`), nunca em `:root` — é o
 * que impede o tema de vazar para o Gestão.
 */
export function variaveisCss(t: TokensTema): Record<string, string> {
  return {
    '--creator-bg':           t.cores.fundo,
    '--creator-bg-alt':       t.cores.fundoAlt,
    '--creator-surface':      t.cores.superficie,
    '--creator-text':         t.cores.texto,
    '--creator-text-soft':    t.cores.textoSuave,
    '--creator-primary':      t.cores.primaria,
    '--creator-secondary':    t.cores.secundaria,
    '--creator-accent':       t.cores.acento,
    '--creator-border':       t.cores.borda,
    '--creator-glow':         t.cores.brilho,
    '--creator-grid':         t.cores.grade,
    '--creator-font-display': t.fontes.display,
    '--creator-font-body':    t.fontes.corpo,
    '--creator-font-mono':    t.fontes.mono,
    '--creator-radius':       t.raio,
    '--creator-border-w':     t.bordaLargura,
    '--creator-shadow':       t.sombra,
  };
}
