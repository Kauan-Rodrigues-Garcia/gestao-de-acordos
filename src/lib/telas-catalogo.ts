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
  'lider:time':                'Painel do Líder · Acompanhamento',
  'lider:desempenho':          'Painel do Líder · Desempenho Equipes',
  'lider:quartis':             'Painel do Líder · Quartis',
  'lider:grafico':             'Painel do Líder · Gráfico recebimento',
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
  'ouvidoria':                 'Ouvidoria',
  'campanha-facil':            'Campanha Fácil',
  'solicitacoes-whatsapp':     'Solicitações WhatsApp',
  'comemoracoes':              'Comemorações',
  'creators':                  'Creators Lab',
};

/** O rótulo, ou o próprio identificador quando a tela é nova. */
export function rotuloDaTela(tela: string): string {
  return TELA_LABEL[tela] ?? tela;
}

/**
 * Rotas que NÃO são medidas.
 *
 * Login e registro acontecem sem sessão — `fn_uso_registrar` devolveria em
 * silêncio de qualquer forma, e chamá-la ali só gastaria requisição.
 */
const FORA_DA_MEDICAO = new Set(['login', 'registro', '']);

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

  const semParametro = partes.filter(p => !ehParametro(p));
  if (semParametro.length === 0) return null;

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
  const limpa = (aba ?? '').trim().toLowerCase();
  return limpa ? `${tela}:${limpa}` : tela;
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
