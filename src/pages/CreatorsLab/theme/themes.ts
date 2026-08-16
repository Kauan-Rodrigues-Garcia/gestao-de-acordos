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
 *
 * ## Por que os dois não podem dividir a mesma cor
 *
 * Até 16/08/2026 os dois temas eram ciano/magenta e amarelo/vermelho sobre
 * fundo escuro, com a mesma grade e a mesma varredura. Ficavam parecidos
 * demais: trocar de realidade mudava o texto, não a sensação. Agora cada um
 * tem uma cor DOMINANTE que o outro não usa —
 *
 *   Cyberpunk → amarelo de sinalização sobre preto puro; ciano e vermelho
 *               entram só como estado. Faixas de perigo, cantos chanfrados,
 *               HUD, tipografia condensada.
 *   Arcade    → magenta de neon sobre roxo profundo; ciano e verde-limão como
 *               co-estrelas. Bloco, sombra dura, CRT abaulado, tipo pesado.
 *
 * A regra dura, com teste em `__tests__/temas.test.ts`: **amarelo é exclusivo
 * do Cyberpunk**, e as duas cores dominantes ficam longe uma da outra no
 * círculo cromático. Ciano aparece nos dois de propósito — é secundária nos
 * dois casos, e o que separa os mundos é a dominante, o fundo e a forma, não a
 * ausência total de cor comum.
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
  /** A máquina de fliperama jogável. */
  fliperama:     string;
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
 * Cyberpunk — sinalização industrial num mundo que já quebrou.
 *
 * A cor que manda é o amarelo de placa de perigo sobre preto puro; ciano e
 * vermelho só aparecem como estado (informação e alerta), nunca como
 * decoração. É o oposto do Arcade, que é neon frio brincando sobre roxo.
 *
 * O vocabulário é de banco de dados e transmissão, que é o que este sistema
 * realmente é.
 */
const CYBERPUNK: TokensTema = {
  id: 'cyberpunk',
  nome: 'CYBERPUNK',
  descricao: 'Sinalização industrial, HUD e ruído. Amarelo sobre preto.',
  cores: {
    fundo:      '#000000',
    fundoAlt:   '#0A0A0A',
    superficie: '#101012',
    texto:      '#F2F2F2',
    textoSuave: '#8A8A85',
    primaria:   '#FCEE0A',   // o amarelo de sinalização; a cor da marca
    secundaria: '#02D7F2',   // ciano: informação, dado, leitura
    acento:     '#FF003C',   // vermelho: alerta, perigo, irreversível
    borda:      '#2B2B1A',
    brilho:     'rgba(252,238,10,.38)',
    grade:      'rgba(252,238,10,.055)',
  },
  fontes: {
    /*
     * Bahnschrift acompanha o Windows 10/11 e é condensada e técnica — a
     * família mais próxima da sinalização do jogo que dá para usar sem baixar
     * fonte nenhuma. As seguintes cobrem macOS e Linux; a última é o desespero.
     */
    display: 'Bahnschrift, "Archivo Narrow", "Roboto Condensed", "Arial Narrow", Impact, sans-serif',
    corpo:   '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif',
    mono:    '"JetBrains Mono", Consolas, "SF Mono", ui-monospace, monospace',
  },
  raio: '0px',
  bordaLargura: '1px',
  sombra: '0 0 0 1px rgba(252,238,10,.10), 0 18px 40px -24px rgba(0,0,0,.9)',
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
    fliperama:   'BRAINDANCE',
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
 * Arcade — a máquina do fliperama, com o CRT ligado.
 *
 * Magenta e ciano de neon sobre roxo profundo, verde-limão para acerto. Nada
 * de amarelo: essa cor é do Cyberpunk agora. Tudo é bloco, sombra dura e
 * contorno — o Arcade é opaco onde o Cyberpunk é luminoso.
 *
 * O vocabulário é de jogo de luta dos anos 90.
 */
const ARCADE: TokensTema = {
  id: 'arcade',
  nome: 'ARCADE',
  descricao: 'Fliperama de verdade. Neon, CRT, placar e ficha.',
  cores: {
    fundo:      '#0D0522',
    fundoAlt:   '#160A38',
    superficie: '#22105A',
    texto:      '#FFFFFF',
    textoSuave: '#B9A7F0',
    primaria:   '#FF3DCB',   // magenta de neon: a cor do gabinete
    secundaria: '#22D3FF',   // ciano: o segundo tubo de neon
    acento:     '#8CFF3D',   // verde-limão: acerto, ponto, vitória
    borda:      '#6A32D8',
    brilho:     'rgba(255,61,203,.5)',
    grade:      'rgba(34,211,255,.07)',
  },
  fontes: {
    display: 'Impact, Haettenschweiler, "Arial Black", "Franklin Gothic Heavy", sans-serif',
    corpo:   'Inter, "Segoe UI", system-ui, sans-serif',
    mono:    '"JetBrains Mono", Consolas, ui-monospace, monospace',
  },
  raio: '0px',
  bordaLargura: '3px',
  sombra: '5px 5px 0 rgba(0,0,0,.65)',
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
    fliperama:   'ARCADE CABINET',
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
    '--creator-duracao':      `${t.duracao}s`,
  };
}
