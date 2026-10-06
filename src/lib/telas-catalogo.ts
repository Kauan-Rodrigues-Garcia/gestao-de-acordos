/**
 * telas-catalogo.ts — o nome de cada tela no monitoramento de uso.
 *
 * ## Por que o identificador não é a URL
 *
 * `/acordos/8f3e…/editar` é uma tela só, não uma por acordo. Guardar a URL crua
 * criaria uma linha nova em `uso_telas` a cada registro aberto, e o painel
 * listaria milhares de "telas" com uma visita cada — inútil para responder quem
 * usa o quê.
 *
 * Aqui a URL vira um identificador estável: `acordos/detalhe`, `lider`,
 * `admin/usuarios`. Parâmetro de rota não entra.
 *
 * ## Sub-abas contam como tela
 *
 * "Desempenho Equipes" é aba DENTRO do Painel Líder, não uma rota — a URL não
 * muda ao trocar de aba. Como a pergunta que originou o painel é exatamente
 * "quais líderes abrem o Desempenho Equipes", a sub-aba entra no identificador
 * depois de dois-pontos: `lider:desempenho`.
 *
 * ## Abas dentro de abas (29/09/2026)
 *
 * «Contabilize exatamente o que a pessoa está fazendo durante todo o tempo.»
 * Só o Painel Líder e os Logs diziam em qual aba a pessoa estava; o Analítico,
 * o Painel Diretoria, Usuários, Acordos/Pix e o resto contavam como a tela
 * inteira. Agora cada nível entra, separado por barra, na ordem da tela:
 * `analitico:analitico/dia/ranking` é o Analítico › aba Analítico › recorte Dia
 * › Ranking. O rótulo é montado por partes (`ROTULO_SEGMENTO`), então uma
 * combinação nova não precisa de linha nova no catálogo.
 *
 * Gavetas e janelas que ficam POR CIMA da tela (Desempenho do Dia, Desafio,
 * chat) têm identificador próprio — ver `RastreioUsoProvider`.
 *
 * O identificador tem teto de 120 caracteres no banco (`fn_uso_registrar`), e o
 * que passar disso é cortado lá — aqui os nomes são curtos por construção.
 */

/** Rótulo humano de cada tela conhecida. Chave = identificador em `uso_telas`. */
export const TELA_LABEL: Record<string, string> = {
  'dashboard':                 'Dashboard',
  'acordos':                   'Acordos',
  'acordos/novo':              'Novo acordo',
  'acordos/detalhe':           'Detalhe do acordo',
  'acordos/editar':            'Editar acordo',
  'acordos/importar':          'Importar Excel',
  'analitico':                 'Analítico',
  'lider':                     'Painel do Líder',
  // Aba removida em 31/08/2026. O rótulo FICA: já há histórico de uso gravado
  // com esta chave, e sem ele o Monitoramento exibiria a chave crua.
  'lider:time':                'Painel do Líder · Acompanhamento (removida)',
  'lider:desempenho':          'Painel do Líder · Desempenho Equipes',
  'lider:quartis':             'Painel do Líder · Quartis',
  'lider:grafico':             'Painel do Líder · Gráfico recebimento',
  'lider:elite':               'Painel do Líder · Plantão Elite',
  'lider/operador':            'Painel do Líder · Operador',
  'diretoria':                 'Painel Diretoria',
  'admin/usuarios':            'Usuários',
  'admin/usuarios:usuarios':   'Usuários · Lista',
  'admin/usuarios:setores':    'Usuários · Setores',
  'admin/usuarios:equipes':    'Usuários · Equipes',
  'admin/usuarios:metas':      'Usuários · Metas',
  'admin/metas':               'Metas',
  'admin/lixeira':             'Lixeira',
  'admin/configuracoes':       'Configurações',
  'admin/configuracoes:logs':  'Configurações · Logs',
  'admin/configuracoes:uso':   'Configurações · Monitoramento de uso',
  'admin/configuracoes:permissoes': 'Configurações · Permissões',
  'rh-gestao':                 'RH Gestão',
  'fechamento':                'Fechamento',
  // Aba arquivada em 05/09/2026 (`arquivo-morto/ouvidoria/`). O rótulo fica:
  // `uso_telas` guarda o que foi aberto enquanto ela existia, e sem ele o
  // histórico vira uma chave crua no Monitoramento de uso.
  'ouvidoria':                 'Ouvidoria',
  'campanha-facil':            'Campanha Fácil',
  'solicitacoes-whatsapp':     'Solicitações WhatsApp',
  'comemoracoes':              'Comemorações',
  'creators':                  'Creators Lab',
  'lider:ajuste':              'Painel do Líder · Ajuste de recebimento',
  // Telas que já eram medidas e apareciam no painel como identificador cru.
  'dashboard-adm':             'Dashboard – ADM',
  'controle-numeros':          'Controle de Números',
  'meus-chips':                'Meus Chips',
  'tickets':                   'Tickets',
  'modo-tv':                   'Modo TV',
  'vendas':                    'Vendas',
  'vendas/indicacoes':         'Indicações',
  'vendas/painel-lider':       'Painel Líder (Comercial)',
  'vendas/painel-diretoria':   'Painel Diretoria (Comercial)',
  'vendas/lixeira':            'Lixeira (Comercial)',
  // Por cima da tela: contam enquanto estão em uso, e não somam na tela de baixo.
  'chat':                      'Chat',
  'gaveta/desempenho-dia':     'Desempenho do Dia (painel do topo)',
  'gaveta/desafio':            'Desafio (painel do topo)',
  'gaveta/editor-menu':        'Editor do menu (painel do topo)',
};

/**
 * O nome de cada nível de aba, por tela.
 *
 * A chave é a tela (`analitico`) ou a tela mais o caminho até o nível
 * (`admin/configuracoes:logs/uso`), para o mesmo segmento poder ter nomes
 * diferentes em lugares diferentes — «geral» é a aba Geral de Configurações e
 * a Visão geral do Monitoramento de uso. Vale o mais específico.
 */
export const ROTULO_SEGMENTO: Record<string, Record<string, string>> = {
  'analitico': {
    analitico: 'Analítico', colchao: 'Colchão', ranking_quitacao: 'Ranking de quitação', desafios: 'Desafios',
  },
  'analitico:analitico': {
    mes: 'Mês', periodo: 'Período', dia: 'Dia',
  },
  'analitico:desafios': {
    catalogo: 'Lista', detalhe: 'Placar', config: 'Configuração',
  },
  'analitico:analitico/mes': {
    operadores: 'Por operador', formas: 'Formas de pagamento', ranking: 'Ranking',
    destaques: 'Destaques do dia', orfaos: 'Sem operador', meus: 'Meus recebimentos',
  },
  'lider': {
    time: 'Acompanhamento', desempenho: 'Desempenho Equipes', quartis: 'Quartis',
    grafico: 'Gráfico recebimento', elite: 'Plantão Elite', ajuste: 'Ajuste de recebimento',
  },
  'diretoria': {
    visao: 'Visão geral', setores: 'Setores e equipes', operadores: 'Por pessoa',
    divergencias: 'Conferência 58 × 59', mestre: 'Relatório 59',
    equipes: 'Equipes a vincular', historico: 'Histórico de importações',
    fontes: 'Fonte dos dados', codigos: 'Códigos', painel: 'Painel',
    relatoriopp: 'Relatórios PaguePlay',
  },
  'diretoria:mestre': { vinculos: 'Vínculos', comparacao: 'Comparação' },
  'acordos': {
    todos: 'Todos', verificar: 'Verificar', pagos: 'Pagos / Quitados',
    nao_pagos: 'Não pagos', pix: 'Pix Automático',
  },
  'admin/usuarios': {
    usuarios: 'Lista', setores: 'Setores', equipes: 'Equipes', metas: 'Metas',
    acompanhamento: 'Acompanhamento', comemoracoes: 'Comemorações',
  },
  'admin/usuarios:metas': { metas: 'Metas', comissao: 'Comissão' },
  'admin/configuracoes': {
    geral: 'Geral', permissoes: 'Permissões', direto_extra: 'Direto e Extra',
    tags: 'Tags', logs: 'Logs', documentacoes: 'Documentações',
    multiempresa: 'Multiempresa', uso: 'Monitoramento de uso',
  },
  'admin/configuracoes:permissoes': { cargo: 'Por cargo', pessoa: 'Por pessoa' },
  'admin/configuracoes:direto_extra': { setor: 'Por setor', equipe: 'Por equipe', usuario: 'Por usuário' },
  'admin/configuracoes:logs': { trilha: 'Trilha de auditoria', uso: 'Monitoramento de uso' },
  'admin/configuracoes:logs/uso': {
    geral: 'Visão geral', pessoas: 'Pessoas', ausentes: 'Sem acesso', adocao: 'Adoção de tela',
  },
  'fechamento': { fechamento: 'Fechamento', premiacoes: 'Premiações e Comissões' },
  'controle-numeros': {
    celulares: 'Celulares', numeros: 'Números', lixeira: 'Lixeira', configuracao: 'Configuração',
  },
  'meus-chips': { numeros: 'Números de WhatsApp', fisicos: 'Chips Físicos' },
  'rh-gestao': {
    consolidado: 'Visão consolidada', setor: 'Setor aberto',
    historico: 'Histórico', configuracao: 'Configuração',
  },
  'chat': { lista: 'Lista de conversas', conversa: 'Conversa aberta', monitor: 'Monitoramento' },
  'vendas/painel-lider': {
    desempenho: 'Desempenho', pessoas: 'Pessoas', grafico: 'Gráfico de vendas', quartis: 'Quartis',
    desafios: 'Desafios',
  },
  'vendas/painel-diretoria': {
    visao: 'Visão geral', setores: 'Setores e equipes', pessoas: 'Por pessoa',
    relatorio: 'Relatório do mês', conferencia: 'Geral × prévia',
    vincular: 'Setores a vincular', quem: 'Pessoas do relatório',
    historico: 'Histórico de importações', fonte: 'Fonte dos dados',
    importar: 'Importar relatório', fechamento: 'Fechamento do setor',
  },
  'vendas': {
    todas: 'Todas', na_meta: 'Na meta', pendencias: 'Pendências', perdas: 'Perdas',
    fora_relatorio: 'Fora do relatório',
  },
};

/*
 * O recorte do Analítico não muda o nome das abas de dentro: «Ranking» é
 * Ranking no Mês, no Período e no Dia. As três chaves apontam para a mesma
 * tabela, para ninguém precisar escrever o mesmo nome três vezes.
 */
ROTULO_SEGMENTO['analitico:analitico/periodo'] = ROTULO_SEGMENTO['analitico:analitico/mes'];
ROTULO_SEGMENTO['analitico:analitico/dia']     = ROTULO_SEGMENTO['analitico:analitico/mes'];

/**
 * O rótulo, montado por partes quando a combinação não está no catálogo.
 *
 * `analitico:analitico/dia/ranking` vira «Analítico · Analítico · Dia ·
 * Ranking». Parte sem nome conhecido entra crua, em vez de sumir — e tela
 * desconhecida devolve o próprio identificador, como sempre.
 */
export function rotuloDaTela(tela: string): string {
  const direto = TELA_LABEL[tela];
  if (direto) return direto;

  const raiz = telaRaiz(tela);
  if (raiz === tela) return tela;

  const segmentos = tela.slice(raiz.length + 1).split('/').filter(Boolean);
  const partes = [TELA_LABEL[raiz] ?? raiz];
  segmentos.forEach((seg, i) => {
    const caminho = segmentos.slice(0, i).join('/');
    const contexto = caminho ? `${raiz}:${caminho}` : raiz;
    partes.push(ROTULO_SEGMENTO[contexto]?.[seg] ?? ROTULO_SEGMENTO[raiz]?.[seg] ?? seg);
  });
  return partes.join(' · ');
}

/**
 * Rotas que NÃO são medidas.
 *
 * Login e registro acontecem sem sessão — `fn_uso_registrar` devolveria em
 * silêncio de qualquer forma, e chamá-la ali só gastaria requisição.
 */
const FORA_DA_MEDICAO = new Set(['login', 'registro', '']);

/**
 * Rotas que são TELEVISÃO, e não pessoa.
 *
 * `/tv/:slug` é o palco que o PC da TV mostra o dia inteiro. Medido, cada slug
 * virava uma «tela» (`tv/teste`, `tv/clebertv`…) e o tempo da parede entrava
 * como uso de quem logou nela. A mesa de corte (`/modo-tv`) continua medida:
 * ali há uma pessoa montando cena.
 */
const TELEVISAO = new Set(['tv']);

/**
 * Nome de tela é letra, número, hífen e sublinhado. Qualquer outra coisa é
 * endereço quebrado — o banco tinha as «telas» `,` e `]` — e não vira linha.
 */
const SEGMENTO_VALIDO = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Segmentos que são VALOR e não nome de tela.
 *
 * UUID e número são identificadores de registro. Sem isto,
 * `/acordos/8f3e.../editar` viraria uma tela por acordo.
 */
function ehParametro(segmento: string): boolean {
  if (/^\d+$/.test(segmento)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segmento);
}

/**
 * O identificador de tela de uma rota.
 *
 * Devolve `null` para rota que não se mede (login, registro, vazia).
 *
 * O parâmetro vira o segmento seguinte quando existe (`/acordos/:id/editar` →
 * `acordos/editar`) e some quando é o último (`/acordos/:id` →
 * `acordos/detalhe`, com o sufixo explícito para não colidir com a lista).
 */
export function telaDaRota(pathname: string): string | null {
  const bruto = (pathname || '').split('?')[0].split('#')[0];
  const partes = bruto.split('/').filter(Boolean).map(s => s.toLowerCase());

  if (partes.length === 0) return 'dashboard';
  if (FORA_DA_MEDICAO.has(partes[0])) return null;
  if (TELEVISAO.has(partes[0])) return null;

  const semParametro = partes.filter(p => !ehParametro(p));
  if (semParametro.length === 0) return null;
  if (!semParametro.every(p => SEGMENTO_VALIDO.test(p))) return null;

  // `/acordos/<uuid>` perdeu o parâmetro e viraria `acordos`, empatando com a
  // LISTA de acordos. São telas diferentes e precisam de nomes diferentes.
  //
  // Só vale quando o identificador estava no FIM: em `/acordos/<uuid>/editar` o
  // nome da tela já vem depois dele (`acordos/editar`).
  const terminaEmParametro = ehParametro(partes[partes.length - 1]);
  if (terminaEmParametro && semParametro.length === 1) {
    return `${semParametro[0]}/detalhe`;
  }

  return semParametro.join('/');
}

/**
 * Junta tela e sub-aba num identificador.
 *
 * Sub-aba vazia devolve a tela pura, para a rota sem abas não virar
 * `lider:` com dois-pontos solto.
 */
export function telaComAba(tela: string, aba?: string | null): string {
  return telaComAbas(tela, [aba]);
}

/** Um nível de aba limpo: minúsculo, sem espaço e sem o separador `/`. */
function limparSegmento(aba: string | null | undefined): string {
  return (aba ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

/**
 * Junta a tela e os níveis de aba, do mais externo ao mais interno.
 *
 * Nível vazio é pulado: a tela que só tem a aba de fora devolve `tela:aba`, e a
 * que não tem nenhuma devolve a tela pura.
 */
export function telaComAbas(tela: string, abas: ReadonlyArray<string | null | undefined>): string {
  const niveis = abas.map(limparSegmento).filter(Boolean);
  return niveis.length ? `${tela}:${niveis.join('/')}` : tela;
}

/**
 * A tela "mãe" de um identificador com sub-aba.
 *
 * `lider:desempenho` → `lider`. Serve para agrupar o painel por módulo sem
 * perder o detalhe das abas.
 */
export function telaRaiz(tela: string): string {
  const i = tela.indexOf(':');
  return i === -1 ? tela : tela.slice(0, i);
}
