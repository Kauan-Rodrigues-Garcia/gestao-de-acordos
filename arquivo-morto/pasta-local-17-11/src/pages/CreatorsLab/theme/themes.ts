/**
 * themes.ts — os três sistemas operacionais do Creators Lab.
 * ─────────────────────────────────────────────────────────────────────────────
 * O Lab é a área de trabalho de um computador fictício, e cada tema é a
 * aparência de um sistema operacional INTEIRO: papel de parede, moldura e
 * botões de janela, barra de tarefas, ícones, cursor, tipografia, tempo das
 * animações, o visual da inicialização e o **vocabulário** — o mesmo programa
 * se chama `TERMINAL` num, `CHEAT CONSOLE` no outro e `Prompt de Comando` no
 * terceiro.
 *
 * Toda diferença entre os temas vive neste arquivo. Se você encontrar um
 * `tema === 'cyberpunk'` dentro de um componente, é sinal de que faltou um
 * token aqui — acrescente o token em vez de espalhar a condicional.
 *
 * As cores viram variáveis CSS `--creator-*` aplicadas na raiz do Lab, e as
 * formas viram atributos `data-*` na mesma raiz (`data-forma`, `data-barra`,
 * `data-papel`, `data-icones`). O CSS lê esses atributos e nunca o nome do
 * tema.
 *
 * ## Por que os três não podem dividir a mesma cor
 *
 * Até 16/08/2026 os dois temas eram ciano/magenta e amarelo/vermelho sobre
 * fundo escuro, com a mesma grade e a mesma varredura. Ficavam parecidos
 * demais: trocar de realidade mudava o texto, não a sensação. A regra que
 * ficou, agora para três:
 *
 *   SINAL/OS       → amarelo de sinalização sobre preto puro; vermelho só como
 *   (cyberpunk)      alerta, aço frio para informação. Chanfro, tarja de
 *                    perigo, barra no topo como HUD, tipo condensado.
 *   FLIPER-16      → magenta de neon sobre roxo profundo; azul elétrico e
 *   (arcade)         verde-limão como co-estrelas. Bloco, sombra dura, barra
 *                    embaixo como painel de controle, tipo pesado.
 *   Repartição 97  → o único CLARO: verde-água sobre cinza-bege, bordô para
 *   (escritorio)     alerta. Relevo 3D, barra com botão Iniciar, tipo de
 *                    escritório, troca quase instantânea.
 *
 * A regra dura, com teste em `__tests__/temas.test.ts`: as três dominantes
 * ficam longe uma da outra no círculo cromático, e **nenhum tema usa uma cor
 * saturada na faixa de matiz da dominante de outro**. Foi por isso que o ciano
 * saiu do Cyberpunk e do Arcade em 13/11/2026: era a secundária dos dois e
 * ficaria a quinze graus do verde-água do terceiro.
 *
 * ## Os ids não mudam
 *
 * `cyberpunk` e `arcade` continuam sendo os ids, mesmo com os sistemas
 * rebatizados. É o que faz quem já tinha um tema guardado no navegador (e em
 * `temasVistos`, no banco) abrir direto no equivalente novo.
 */

export type TemaCreators = 'cyberpunk' | 'arcade' | 'escritorio';

/** Os programas da área de trabalho. O nome de cada um muda com o tema. */
export type IdPrograma =
  | 'terminal'
  | 'fliperama'
  | 'criadores'
  | 'projetos'
  | 'playground'
  | 'mathlab'
  | 'conquistas'
  | 'descobridores'
  | 'museu'
  | 'configuracoes'
  | 'desligar';

/** O vocabulário: a mesma coisa, dita de três jeitos. */
export interface VocabularioTema {
  /** O nome do sistema operacional fictício. */
  sistema:       string;
  /** O botão que abre o menu de programas. */
  iniciar:       string;
  /** O nome de cada programa: título da janela, ícone e barra de tarefas. */
  programas:     Record<IdPrograma, string>;

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
  /** A troca de aparência, em Configurações. */
  aparencia:     string;

  // ── Rótulos de dentro dos programas ──
  avisoConquista:      string;
  rankingJogador:      string;
  rankingPontos:       string;
  rankingTitulo:       string;
  playgroundTitulo:    string;
  playgroundRodar:     string;
  playgroundSucesso:   string;
  contatoTitulo:       string;
  contatoDescricao:    string;
  contatoRodape:       string;
  heroRotulo:          string;
  /** O título da pasta dos criadores, em duas linhas. */
  heroTitulo:          [string, string];
  curiosidades:        string;
  assinatura:          string;
  statusRotulo:        string;
  statusTitulo:        string;
  proibidoRotulo:      string;
  proibidoTitulo:      string;
  sairBotao:           string;
  sairDeVez:           string;
  terminalTitulo:      string;
  interessesTitulo:    string;
  nota:                string;
  projetosTitulo:      string;
  executavel:          string;
  demo:                string;
  fliperamaRotulo:     string;
  fliperamaDescricao:  string;
  fliperamaMarquise:   string;
  descobridoresRotulo: string;
  descobridoresTitulo: string;
  primeiroRotulo:      string;

  /** Prefixo de identificação de uma pessoa. */
  sujeito:       (i: number) => string;
  /** Como a linha pequena acima de um título é enfeitada. */
  rotuloSecao:   (rotulo: string) => string;
}

export interface TokensTema {
  id: TemaCreators;
  nome: string;
  descricao: string;
  /** Cores — viram `--creator-*` na raiz do Lab. */
  cores: {
    /** O fundo de dentro das janelas. */
    fundo:        string;
    fundoAlt:     string;
    superficie:   string;
    texto:        string;
    textoSuave:   string;
    primaria:     string;
    secundaria:   string;
    acento:       string;
    borda:        string;
    /** A cor base do papel de parede. */
    papel:        string;
    tituloFundo:  string;
    tituloTexto:  string;
    barraFundo:   string;
    barraTexto:   string;
    brilho:       string;
    grade:        string;
  };
  fontes: {
    display: string;
    corpo:   string;
    mono:    string;
  };
  /** Raio de canto. Nenhum dos três arredonda: o que muda é a FORMA. */
  raio: string;
  /** Espessura da borda de janelas e painéis. */
  bordaLargura: string;
  /** Sombra padrão de janelas e painéis. */
  sombra: string;
  /** Duração base das transições, em segundos. */
  duracao: number;
  /** Curva de aceleração: desliza, estala ou troca seco. */
  easing: [number, number, number, number];

  /**
   * A forma de tudo que tem borda: janela, painel, botão.
   *   chanfro → canto cortado em diagonal
   *   bloco   → retângulo de borda grossa com sombra dura
   *   relevo  → borda clara em cima e escura embaixo, como plástico moldado
   */
  forma: 'chanfro' | 'bloco' | 'relevo';
  /** A moldura da janela. */
  janela: {
    /** De que lado ficam os botões de fechar e minimizar. */
    ladoBotoes: 'direita' | 'esquerda';
    simbolos: { fechar: string; minimizar: string; maximizar: string; restaurar: string };
  };
  /** A barra de tarefas. */
  barra: {
    posicao: 'topo' | 'base';
    /** Altura em pixels — entra na conta da área útil das janelas. */
    altura: number;
    estilo: 'hud' | 'painel' | 'iniciar';
    /** Relógio com segundos? O HUD mostra; os outros, não. */
    segundos: boolean;
  };
  /** O papel de parede. */
  papel: {
    tipo: 'grade' | 'estrelas' | 'liso';
    /** Partículas ligadas por cima do papel de parede. */
    particulas: boolean;
  };
  /** O desenho dos ícones da área de trabalho. */
  icones: 'hud' | 'pixel' | 'classico';
  /** Formato do cursor. */
  cursor: 'mira' | 'seletor' | 'seta';
  /** Formato de retratos e nós: círculo ou quadrado. */
  retrato: 'circulo' | 'quadrado';
  /** Quanto o cartão de um criador inclina sob o ponteiro, em graus. */
  inclinacaoCard: number;
  /** Qual rótulo de `CategoriaInteresse` este tema usa. */
  rotuloCategoria: 'rotuloCyber' | 'rotuloArcade' | 'rotuloEscritorio';
  /** A inicialização do computador, com a cara deste sistema. */
  intro: {
    estilo: 'varredura' | 'blocos' | 'progresso';
    /** As linhas do autoteste, na ordem. */
    autoteste: string[];
    /** A marca que aparece quando o sistema carrega. */
    marca: string;
    lema: string;
    /** O texto do botão da tela de entrada. */
    entrar: string;
    /** O título da tela de entrada. */
    boasVindas: string;
  };
  vocab: VocabularioTema;
}

/**
 * SINAL/OS — sinalização industrial num mundo que já quebrou.
 *
 * A cor que manda é o amarelo de placa de perigo sobre preto puro; vermelho só
 * aparece como alerta e o aço frio como informação, nunca como decoração. O
 * vocabulário é de banco de dados e transmissão, que é o que este sistema
 * realmente é.
 */
const CYBERPUNK: TokensTema = {
  id: 'cyberpunk',
  nome: 'SINAL/OS',
  descricao: 'Terminal de sinalização industrial. Amarelo sobre preto, chanfro e HUD.',
  cores: {
    fundo:       '#000000',
    fundoAlt:    '#0A0A0A',
    superficie:  '#101012',
    texto:       '#F2F2F2',
    textoSuave:  '#8A8A85',
    primaria:    '#FCEE0A',   // o amarelo de sinalização; a cor da marca
    secundaria:  '#C9D4DC',   // aço frio: informação, dado, leitura
    acento:      '#FF003C',   // vermelho: alerta, perigo, irreversível
    borda:       '#2B2B1A',
    papel:       '#030303',
    tituloFundo: '#14140A',
    tituloTexto: '#FCEE0A',
    barraFundo:  '#0C0C08',
    barraTexto:  '#E8E8E0',
    brilho:      'rgba(252,238,10,.38)',
    grade:       'rgba(252,238,10,.055)',
  },
  fontes: {
    /*
     * Bahnschrift acompanha o Windows 10/11 e é condensada e técnica — a
     * família mais próxima da sinalização do gênero que dá para usar sem baixar
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
  forma: 'chanfro',
  janela: {
    ladoBotoes: 'direita',
    simbolos: { fechar: '✕', minimizar: '—', maximizar: '◇', restaurar: '◈' },
  },
  barra: { posicao: 'topo', altura: 36, estilo: 'hud', segundos: true },
  papel: { tipo: 'grade', particulas: true },
  icones: 'hud',
  cursor: 'mira',
  retrato: 'circulo',
  inclinacaoCard: 9,
  rotuloCategoria: 'rotuloCyber',
  intro: {
    estilo: 'varredura',
    autoteste: [
      'SINAL/OS  ROM 4.51',
      'memoria ............................ 65536K ok',
      'barramento de sinal ................ ok',
      'rotas nao declaradas ............... 1',
      'setor oculto ....................... localizado',
      'acesso de operador ................. concedido',
    ],
    marca: 'SINAL/OS',
    lema: 'terminal de sinalização',
    entrar: '[ CONECTAR ]',
    boasVindas: 'OPERADOR IDENTIFICADO',
  },
  vocab: {
    sistema:     'SINAL/OS',
    iniciar:     'SYS',
    programas: {
      terminal:      'TERMINAL',
      fliperama:     'BRAINDANCE',
      criadores:     'DATABASE',
      projetos:      'MODULES',
      playground:    'COMPILER',
      mathlab:       'MATH // LAB',
      conquistas:    'LOG',
      descobridores: 'ACCESS LOG',
      museu:         'ARCHIVE',
      configuracoes: 'SYS.CONFIG',
      desligar:      'DISCONNECT',
    },
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
    aparencia:   'INTERFACE',

    avisoConquista:      'ACHIEVEMENT UNLOCKED',
    rankingJogador:      'operador',
    rankingPontos:       'pontos',
    rankingTitulo:       'ranking',
    playgroundTitulo:    'CODE PLAYGROUND',
    playgroundRodar:     'RUN',
    playgroundSucesso:   'BUILD SUCCESSFUL',
    contatoTitulo:       'ESTABLISH CONNECTION',
    contatoDescricao:    'Canal aberto dos dois lados.',
    contatoRodape:       'TRANSMISSION CHANNEL READY',
    heroRotulo:          'GDA://CREATORS',
    heroTitulo:          ['THE', 'CREATORS'],
    curiosidades:        'NOTES',
    assinatura:          'SIGNATURE',
    statusRotulo:        'DEV STATUS',
    statusTitulo:        'SYSTEM READOUT',
    proibidoRotulo:      'RESTRICTED',
    proibidoTitulo:      'BOTÃO PROIBIDO',
    sairBotao:           '[ RETURN TO GESTÃO ]',
    sairDeVez:           '[ AGORA SIM, VOLTAR ]',
    terminalTitulo:      'GDA TERMINAL',
    interessesTitulo:    'PERSONAL DATABASE',
    nota:                'RATING',
    projetosTitulo:      'PROJECT ARCHIVE',
    executavel:          'EXECUTÁVEL',
    demo:                'DEMO AO VIVO',
    fliperamaRotulo:     'simulação interativa',
    fliperamaDescricao:  'Simulação em canvas com física escrita à mão. Uma execução por operador, com resultado registrado.',
    fliperamaMarquise:   'BRK-01',
    descobridoresRotulo: 'registro de acesso',
    descobridoresTitulo: 'DESCOBRIDORES',
    primeiroRotulo:      'primeiro acesso',

    sujeito:     (i) => `SUBJECT_${String(i).padStart(2, '0')}`,
    rotuloSecao: (r) => `// ${r}`,
  },
};

/**
 * FLIPER-16 — um console de 16 bits ligado numa TV de tubo.
 *
 * Magenta de neon sobre roxo profundo, azul elétrico e verde-limão como
 * co-estrelas. Nada de amarelo nem de verde-água: essas cores são dos outros
 * dois. Tudo é bloco, sombra dura e contorno — o Arcade é opaco onde o
 * Cyberpunk é luminoso. O vocabulário é de jogo de luta dos anos 90.
 */
const ARCADE: TokensTema = {
  id: 'arcade',
  nome: 'FLIPER-16',
  descricao: 'Console de 16 bits numa TV de tubo. Magenta sobre roxo, bloco e sombra dura.',
  cores: {
    fundo:       '#0D0522',
    fundoAlt:    '#160A38',
    superficie:  '#22105A',
    texto:       '#FFFFFF',
    textoSuave:  '#B9A7F0',
    primaria:    '#FF3DCB',   // magenta de neon: a cor do gabinete
    secundaria:  '#3D7BFF',   // azul elétrico: o segundo tubo de neon
    acento:      '#8CFF3D',   // verde-limão: acerto, ponto, vitória
    borda:       '#6A32D8',
    papel:       '#0A0318',
    tituloFundo: '#FF3DCB',
    tituloTexto: '#14060A',
    barraFundo:  '#1B0C47',
    barraTexto:  '#F6F0FF',
    brilho:      'rgba(255,61,203,.5)',
    grade:       'rgba(61,123,255,.09)',
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
  forma: 'bloco',
  janela: {
    ladoBotoes: 'esquerda',
    simbolos: { fechar: '×', minimizar: '▁', maximizar: '■', restaurar: '▣' },
  },
  barra: { posicao: 'base', altura: 48, estilo: 'painel', segundos: false },
  papel: { tipo: 'estrelas', particulas: false },
  icones: 'pixel',
  cursor: 'seletor',
  retrato: 'quadrado',
  inclinacaoCard: 5,
  rotuloCategoria: 'rotuloArcade',
  intro: {
    estilo: 'blocos',
    autoteste: [
      'FLIPER-16  BIOS v1.6',
      'RAM CHECK .......... 16 BIT OK',
      'VIDEO .............. 60 HZ OK',
      'SOUND .............. 2 CH OK',
      'CARTRIDGE SLOT ..... READY',
      'SECRET STAGE ....... FOUND',
    ],
    marca: 'FLIPER-16',
    lema: '16 bits de pura cobrança',
    entrar: '▶ PRESS START',
    boasVindas: 'PLAYER 1 READY',
  },
  vocab: {
    sistema:     'FLIPER-16',
    iniciar:     'START',
    programas: {
      terminal:      'CHEAT CONSOLE',
      fliperama:     'ARCADE CABINET',
      criadores:     'CHARACTER SELECT',
      projetos:      'GAME LIBRARY',
      playground:    'TRAINING MODE',
      mathlab:       'BONUS STAGE',
      conquistas:    'HIGH SCORES',
      descobridores: 'HALL OF FAME',
      museu:         'STAGE SELECT',
      configuracoes: 'OPTIONS',
      desligar:      'QUIT GAME',
    },
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
    aparencia:   'SKIN',

    avisoConquista:      'NEW HIGH SCORE',
    rankingJogador:      'PLAYER',
    rankingPontos:       'SCORE',
    rankingTitulo:       'HIGH SCORES',
    playgroundTitulo:    'TRAINING MODE',
    playgroundRodar:     'START',
    playgroundSucesso:   'PERFECT!',
    contatoTitulo:       'CONTINUE?',
    contatoDescricao:    'Insira uma ficha para continuar.',
    contatoRodape:       '● ● ● INSERT COIN TO CONTINUE ● ● ●',
    heroRotulo:          'INSERT COIN',
    heroTitulo:          ['SELECT YOUR', 'DEVELOPER'],
    curiosidades:        'TRIVIA',
    assinatura:          'SPECIAL MOVE',
    statusRotulo:        'PLAYER STATUS',
    statusTitulo:        'HIGH SCORES',
    proibidoRotulo:      'SECRET STAGE',
    proibidoTitulo:      'DO NOT PRESS',
    sairBotao:           '◀ QUIT GAME',
    sairDeVez:           '◀ QUIT FOR REAL',
    terminalTitulo:      'CHEAT CONSOLE',
    interessesTitulo:    'CARTRIDGE LIBRARY',
    nota:                'SCORE',
    projetosTitulo:      'GAME LIBRARY',
    executavel:          'PLAYABLE',
    demo:                'PLAY',
    fliperamaRotulo:     'coin-op',
    fliperamaDescricao:  'Uma máquina de verdade, com uma ficha por pessoa. Três vidas, um ranking e um prêmio para quem zerar.',
    fliperamaMarquise:   'CREATORS ARCADE',
    descobridoresRotulo: 'hall of fame',
    descobridoresTitulo: 'QUEM ACHOU A MÁQUINA',
    primeiroRotulo:      'player one',

    sujeito:     (i) => `PLAYER ${i}`,
    rotuloSecao: (r) => `— ${r} —`,
  },
};

/**
 * Repartição 97 — o PC bege esquecido numa sala dos fundos.
 *
 * O único tema CLARO. Papel de parede verde-água chapado, janelas cinza-bege
 * com relevo, título em faixa escura, botão Iniciar. Nada brilha e nada
 * desliza: as coisas simplesmente aparecem, como apareciam.
 *
 * O vocabulário é em português de escritório, que é o contrário do inglês de
 * neon dos outros dois — e a piada é que este é o sistema que mais se parece
 * com o lugar onde o Gestão realmente roda.
 */
const ESCRITORIO: TokensTema = {
  id: 'escritorio',
  nome: 'Repartição 97',
  descricao: 'O PC bege da sala dos fundos. Verde-água, relevo e botão Iniciar.',
  cores: {
    fundo:       '#E4E1D8',
    fundoAlt:    '#D8D5CC',
    superficie:  '#F4F2EC',
    texto:       '#1A1A1A',
    textoSuave:  '#5C5A54',
    primaria:    '#0A6F66',   // verde-água: a cor da marca, escura o bastante para ser texto
    secundaria:  '#1F3A7A',   // azul-marinho: link, seleção, informação
    acento:      '#8C1D2B',   // bordô: alerta, e só
    borda:       '#8E8B82',
    papel:       '#128C80',
    tituloFundo: '#0A5A53',
    tituloTexto: '#FBFAF5',
    barraFundo:  '#D0CDC3',
    barraTexto:  '#161616',
    brilho:      'rgba(10,111,102,.18)',
    grade:       'rgba(0,0,0,.06)',
  },
  fontes: {
    display: 'Tahoma, Verdana, Geneva, "DejaVu Sans", sans-serif',
    corpo:   'Tahoma, Verdana, Geneva, "DejaVu Sans", sans-serif',
    mono:    '"Courier New", Courier, "Liberation Mono", monospace',
  },
  raio: '0px',
  bordaLargura: '2px',
  sombra: '2px 2px 0 rgba(0,0,0,.35)',
  duracao: 0.12,
  easing: [0, 0, 1, 1],
  forma: 'relevo',
  janela: {
    ladoBotoes: 'direita',
    simbolos: { fechar: 'x', minimizar: '_', maximizar: '□', restaurar: '❐' },
  },
  barra: { posicao: 'base', altura: 34, estilo: 'iniciar', segundos: false },
  papel: { tipo: 'liso', particulas: false },
  icones: 'classico',
  cursor: 'seta',
  retrato: 'quadrado',
  inclinacaoCard: 0,
  rotuloCategoria: 'rotuloEscritorio',
  intro: {
    estilo: 'progresso',
    autoteste: [
      'Reparticao BIOS, revisao 97',
      'Testando memoria: 32768K OK',
      'Disco rigido principal ....... detectado',
      'Unidade de disquete A: ....... detectada',
      'Pasta oculta ................. encontrada',
      'Iniciando Reparticao 97...',
    ],
    marca: 'Repartição 97',
    lema: 'Sistema de expediente',
    entrar: 'OK',
    boasVindas: 'Entrar na rede da repartição',
  },
  vocab: {
    sistema:     'Repartição 97',
    iniciar:     'Iniciar',
    programas: {
      terminal:      'Prompt de Comando',
      fliperama:     'Quebra-Blocos',
      criadores:     'Meus Documentos',
      projetos:      'Arquivos de Programas',
      playground:    'Bloco de Código',
      mathlab:       'Calculadora Científica',
      conquistas:    'Diplomas',
      descobridores: 'Livro de Visitas',
      museu:         'Arquivo Morto',
      configuracoes: 'Painel de Controle',
      desligar:      'Desligar…',
    },
    entrada:     'INSERIR FICHA',
    perfis:      'Meus Documentos',
    interesses:  'Coleção',
    projetos:    'Arquivos de Programas',
    habilidades: 'Propriedades',
    playground:  'Bloco de Código',
    matematica:  'Calculadora Científica',
    fliperama:   'Quebra-Blocos',
    terminal:    'Prompt de Comando',
    conquistas:  'Diplomas',
    contato:     'Catálogo de Endereços',
    carregando:  'Aguarde…',
    sucesso:     'Concluído.',
    erro:        'Erro fatal',
    voltar:      'Desligar o computador…',
    selecionar:  'Abrir',
    fechar:      'Fechar',
    aparencia:   'Aparência',

    avisoConquista:      'Novo diploma',
    rankingJogador:      'Funcionário',
    rankingPontos:       'Pontuação',
    rankingTitulo:       'Placar',
    playgroundTitulo:    'Bloco de Código',
    playgroundRodar:     'Executar',
    playgroundSucesso:   'Compilado sem erros.',
    contatoTitulo:       'Catálogo de Endereços',
    contatoDescricao:    'Os contatos de quem montou esta máquina.',
    contatoRodape:       'Fim do catálogo.',
    heroRotulo:          'C:\\Meus Documentos',
    heroTitulo:          ['Os', 'Criadores'],
    curiosidades:        'Anotações',
    assinatura:          'Carimbo',
    statusRotulo:        'Propriedades do sistema',
    statusTitulo:        'Propriedades',
    proibidoRotulo:      'Aviso',
    proibidoTitulo:      'Não clique aqui',
    sairBotao:           'Desligar',
    sairDeVez:           'Desligar mesmo',
    terminalTitulo:      'Prompt de Comando',
    interessesTitulo:    'Coleção particular',
    nota:                'Nota',
    projetosTitulo:      'Arquivos de Programas',
    executavel:          'Programa',
    demo:                'Em execução',
    fliperamaRotulo:     'jogo',
    fliperamaDescricao:  'Um jogo instalado nesta máquina, com uma ficha por pessoa. Três vidas, um placar e um prêmio para quem zerar.',
    fliperamaMarquise:   'QUEBRA-BLOCOS',
    descobridoresRotulo: 'livro de visitas',
    descobridoresTitulo: 'Quem assinou o livro',
    primeiroRotulo:      'primeira assinatura',

    sujeito:     (i) => `Usuário ${i}`,
    rotuloSecao: (r) => r,
  },
};

export const TEMAS: Record<TemaCreators, TokensTema> = {
  cyberpunk:  CYBERPUNK,
  arcade:     ARCADE,
  escritorio: ESCRITORIO,
};

export const LISTA_TEMAS: TokensTema[] = [CYBERPUNK, ARCADE, ESCRITORIO];

/** O tema de quem ainda não escolheu nenhum. */
export const TEMA_PADRAO: TemaCreators = 'cyberpunk';

/** O texto guardado é um tema que existe? Protege contra valor velho ou estragado. */
export function temaValido(valor: unknown): valor is TemaCreators {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(TEMAS, valor);
}

/** O tema seguinte, em roda. É o que o comando `theme` do terminal usa. */
export function proximoTema(atual: TemaCreators): TemaCreators {
  const i = LISTA_TEMAS.findIndex(t => t.id === atual);
  return LISTA_TEMAS[(i + 1) % LISTA_TEMAS.length].id;
}

/**
 * O cursor de cada sistema, desenhado em SVG e embutido como `data:`.
 *
 * Fica numa variável CSS para o arquivo de estilo não precisar saber qual
 * tema está ativo, e é um `cursor: url(...)` de verdade — o navegador move,
 * sem JavaScript seguindo o ponteiro a cada quadro.
 */
function cursorCss(t: TokensTema): string {
  const svg = (corpo: string, lado: number) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${lado}' height='${lado}' viewBox='0 0 ${lado} ${lado}'>${corpo}</svg>`,
    )}")`;
  const cor = t.cores.primaria;

  switch (t.cursor) {
    case 'mira':
      return `${svg(
        `<g fill='none' stroke='${cor}' stroke-width='1.5'>`
        + `<path d='M12 1v7M12 16v7M1 12h7M16 12h7'/><rect x='10' y='10' width='4' height='4'/></g>`,
        24,
      )} 12 12, crosshair`;
    case 'seletor':
      return `${svg(
        `<path shape-rendering='crispEdges' fill='${cor}' stroke='#000' stroke-width='2' `
        + `d='M2 2h4v2h2v2h2v2h2v2h2v2h2v4h-6v2h2v4h-4v-4h-2v-2h-2v2h-2z'/>`,
        24,
      )} 2 2, pointer`;
    case 'seta':
      return `${svg(
        `<path fill='#fff' stroke='#000' stroke-width='1.2' stroke-linejoin='miter' `
        + `d='M2 1.5v16l4-3.6 2.7 6.1 2.6-1.1-2.7-6h5.6z'/>`,
        22,
      )} 2 1, default`;
  }
}

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
    '--creator-wallpaper':    t.cores.papel,
    '--creator-title-bg':     t.cores.tituloFundo,
    '--creator-title-text':   t.cores.tituloTexto,
    '--creator-bar-bg':       t.cores.barraFundo,
    '--creator-bar-text':     t.cores.barraTexto,
    '--creator-glow':         t.cores.brilho,
    '--creator-grid':         t.cores.grade,
    '--creator-font-display': t.fontes.display,
    '--creator-font-body':    t.fontes.corpo,
    '--creator-font-mono':    t.fontes.mono,
    '--creator-radius':       t.raio,
    '--creator-border-w':     t.bordaLargura,
    '--creator-shadow':       t.sombra,
    '--creator-duracao':      `${t.duracao}s`,
    '--creator-easing':       `cubic-bezier(${t.easing.join(',')})`,
    '--creator-bar-h':        `${t.barra.altura}px`,
    '--creator-cursor':       cursorCss(t),
  };
}

/**
 * Os atributos `data-*` que a raiz do Lab recebe.
 *
 * É por eles que o CSS decide forma. Nenhum seletor do arquivo de estilo
 * compara o nome do tema: um quarto tema que reaproveite `forma: 'bloco'`
 * ganha o desenho inteiro sem tocar no CSS.
 */
export function atributosDoTema(t: TokensTema): Record<string, string> {
  return {
    'data-tema':    t.id,
    'data-forma':   t.forma,
    'data-barra':   t.barra.estilo,
    'data-barra-posicao': t.barra.posicao,
    'data-papel':   t.papel.tipo,
    'data-icones':  t.icones,
    'data-botoes':  t.janela.ladoBotoes,
  };
}
