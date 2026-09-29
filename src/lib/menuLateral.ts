/**
 * menuLateral.ts — QUAIS abas o menu tem, e quem enxerga cada uma.
 *
 * ## Por que isto saiu do `Layout.tsx`
 *
 * A lista e o filtro moravam dentro do componente, e enquanto o menu só era
 * desenhado para quem estava logado isso bastava. O editor de ordem mudou a
 * pergunta: ele precisa mostrar **o menu de OUTRO cargo**, para o super_admin
 * arrastar as abas na ordem que aquele cargo vai ver.
 *
 * Reescrever o filtro dentro do editor daria duas réguas para a mesma decisão,
 * e a segunda envelheceria: aba nova entra no `NAV_ITEMS`, o menu de verdade
 * passa a mostrá-la e a prévia do editor continua com a lista de ontem. Aqui a
 * régua é uma só, parametrizada por quem pergunta.
 *
 * ## O que o filtro NÃO é
 *
 * Não é barreira de segurança. Quem manda no dado é a RLS; esconder um item de
 * menu é conforto. É por isso que a prévia por cargo pode ser aproximada nas
 * duas concessões que dependem de PESSOA (ver `ContextoMenu` abaixo) sem que
 * isso vire um risco: errar a prévia mostra uma aba a mais num desenho, nunca
 * concede acesso a coisa nenhuma.
 *
 * ## O recorte por setor que existiu aqui
 *
 * Entre 10 e 11/09/2026 houve um terceiro eixo, o SETOR (`nucleo: 'so' |
 * 'fora'`), para o Núcleo de Inteligência e Gestão não herdar a cobrança
 * inteira pelo cargo `operador`. O Núcleo ganhou cargo próprio,
 * `assistente_adm`, sem as chaves da cobrança, e o eixo saiu:
 * `menuLateral.nucleo.contrato.test.ts` trava que ele não volta.
 */
import {
  LayoutDashboard, FileText, Plus, Users, Settings, Trash2, TrendingUp,
  BarChart3, BarChart2, Megaphone, MessageSquarePlus, Database, Zap,
  Ticket, ClipboardList, ClipboardCheck, Tv, MessageCircle, Gauge,
  ShoppingBag, Handshake,
} from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { produtoPermite, type Produto } from '@/lib/produto';
import {
  abasDoDesempenho, abasDoFechamentoDoMes, abasDoNucleo, abasDosDados, algumaAba,
  type ContextoAbas,
} from '@/lib/mapaAbas';

export interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  roles?: string[];
  /**
   * Em quais PRODUTOS esta aba existe. Obrigatório na prática: sem a lista, a
   * aba não aparece em lugar nenhum.
   *
   * É uma lista BRANCA, e essa é a mudança de 25/08. Antes a régua era por
   * exclusão (`hiddenForPaguePay`), e uma aba sem marcação aparecia em todo
   * tenant — o Comercial abriu mostrando Acordos, Novo Acordo e Campanha
   * Fácil, a cobrança inteira, vazia. Com lista branca, esquecer de declarar
   * some com a aba: o erro fica visível em vez de vazar.
   *
   * Não confundir com os dois campos abaixo. Aqui se decide QUAL PRODUTO; lá,
   * qual das duas empresas de cobrança.
   */
  produtos?: readonly Produto[];
  /**
   * Oculta na PaguePlay. Distinção INTERNA da cobrança — as duas empresas
   * cobram, mas nem toda tela serve às duas. Não tem efeito fora de `cobranca`,
   * porque fora dela a aba já não existe.
   */
  hiddenForPaguePay?: boolean;
  /** Oculta na BookPlay. Mesma natureza do campo acima. */
  hiddenForBookplay?: boolean;
  /** Chave de `cargos_permissoes` que precisa estar true (admin bypassa) */
  permissaoKey?: string;
  /**
   * Para as telas que o Mapa de Abas juntou: basta UMA destas chaves. Quais
   * abas a tela desenha — e se sobra alguma — é refinado em `abasDoMenu` pela
   * mesma régua da tela (`lib/mapaAbas.ts`).
   */
  permissoes?: readonly string[];
  /** Em que seção do menu o item mora. */
  secao?: SecaoMenu;
}

/**
 * As abas que toda operação tem, seja qual for o produto.
 *
 * Três, e a lista é curta de propósito: a porta de entrada, cadastrar gente e
 * configurar a empresa. Todo o resto — acordo, recebimento, meta, analítico —
 * é vocabulário da cobrança e não significa nada em Vendas ou RH.
 *
 * A Lixeira esteve aqui por um dia e saiu: ela lista ACORDOS excluídos, não
 * "coisas apagadas" em geral. Foi o tipo de engano que a lista branca torna
 * barato — reclassificar é mudar uma constante, e nada vazou enquanto isso,
 * porque a tela é isolada por empresa.
 */
const TODOS_OS_PRODUTOS: readonly Produto[] = ['cobranca', 'comercial', 'rh'];

/** Só cobrança. O apelido existe para a lista abaixo ficar legível. */
const SO_COBRANCA: readonly Produto[] = ['cobranca'];

/**
 * Só o Comercial. Nasceu com a aba Vendas, em 15/09/2026.
 *
 * É o primeiro apelido que aponta para fora da cobrança, e a existência dele é
 * a prova de que a lista branca de 25/08 valeu: acrescentar a primeira aba de
 * um produto novo não exigiu revisar aba nenhuma das outras — o que não declara
 * `comercial` continua sem aparecer lá.
 */
const SO_COMERCIAL: readonly Produto[] = ['comercial'];

/**
 * As duas operações que já existem de verdade.
 *
 * Não é «todos menos RH»: é a lista das abas cuja tela é neutra o bastante
 * para servir às duas, e que alguém conferiu que serve. Tickets é a primeira
 * — chamado, fila e chat não têm vocabulário de produto.
 *
 * Escrever `TODOS_OS_PRODUTOS` aqui seria mais curto e estaria errado: o RH
 * não tem tela nenhuma, nem cargo, nem gente, e uma aba que aparece lá é uma
 * aba que ninguém revisou aparecendo para ninguém.
 */
const COBRANCA_E_COMERCIAL: readonly Produto[] = ['cobranca', 'comercial'];

/**
 * As seções do menu, na ordem em que aparecem (Mapa de Abas, 29/09/2026).
 *
 * O menu era uma lista corrida de dezoito itens, e o que era trabalho do dia
 * ficava misturado com ferramenta técnica. As seções agrupam pelo TRABALHO:
 * o que se faz todo dia, o que a gestão faz, as ferramentas, a área do Núcleo e
 * a administração. Cada cargo continua vendo só o que a permissão libera — e
 * uma seção sem item liberado não desenha nem o título.
 */
export const SECOES_MENU = [
  { chave: 'operacao',      rotulo: 'Operação' },
  { chave: 'gestao',        rotulo: 'Gestão' },
  { chave: 'ferramentas',   rotulo: 'Ferramentas' },
  { chave: 'nucleo',        rotulo: 'Núcleo ADM' },
  { chave: 'administracao', rotulo: 'Administração' },
] as const;

export type SecaoMenu = typeof SECOES_MENU[number]['chave'];

export const NAV_ITEMS: NavItem[] = [
  // ── Operação ──────────────────────────────────────────────────────────────
  //
  // A única aba que existe em todo produto por necessidade: é a rota `/`, a
  // porta de entrada. Era «Dashboard»; virou «Início» e absorveu a Visão geral
  // da Diretoria, o Gráfico recebimento e a gaveta Desempenho do Dia.
  { label: 'Início',           icon: LayoutDashboard, to: ROUTE_PATHS.DASHBOARD,           produtos: TODOS_OS_PRODUTOS, secao: 'operacao', permissaoKey: 'ver_dashboard' },
  // Acordos nas DUAS empresas. Na PaguePlay a lista morava dentro do Dashboard
  // e abria com `ver_dashboard`; a chave veio junto, e por isso são dois itens
  // com a mesma rota — um por empresa, nunca os dois ao mesmo tempo.
  // «Novo acordo» deixou de ser item: é o botão fixo no topo do menu. A
  // Lixeira virou a aba Excluídos, e Importar Excel um botão da tela.
  { label: 'Acordos',          icon: FileText,        to: ROUTE_PATHS.ACORDOS,             produtos: SO_COBRANCA, secao: 'operacao', roles: ['operador','lider','administrador','elite','gerencia','diretoria'], hiddenForPaguePay: true, permissaoKey: 'ver_acordos' },
  { label: 'Acordos',          icon: FileText,        to: ROUTE_PATHS.ACORDOS,             produtos: SO_COBRANCA, secao: 'operacao', hiddenForBookplay: true, permissaoKey: 'ver_dashboard' },
  // O Pix Automático era a quinta aba de Acordos e tinha virado um módulo
  // inteiro escondido. Só BookPlay, pela mesma chave.
  { label: 'Pix Automático',   icon: Zap,             to: ROUTE_PATHS.PIX_AUTOMATICO,      produtos: SO_COBRANCA, secao: 'operacao', hiddenForPaguePay: true, permissaoKey: 'ver_pix_automatico' },
  // Estes eram renderizados À MÃO abaixo do laço, com condição só de slug e
  // cargo, e escapavam do filtro de permissão. Dentro da lista, todo item
  // passa pelo mesmo filtro.
  { label: 'Analítico',        icon: BarChart2,       to: ROUTE_PATHS.ANALITICO,           produtos: SO_COBRANCA, secao: 'operacao', permissaoKey: 'ver_analitico' },
  // Painel Líder, a parte de desempenho do Painel Diretoria, Ranking e
  // Desafios. Qualquer uma das chaves abre; quais abas aparecem sai de
  // `abasDoDesempenho`.
  { label: 'Desempenho',       icon: BarChart3,       to: ROUTE_PATHS.DESEMPENHO,          produtos: SO_COBRANCA, secao: 'operacao', permissoes: ['ver_painel_lider', 'ver_painel_diretoria', 'ver_analitico'] },

  // ── Gestão ────────────────────────────────────────────────────────────────
  //
  // Cadastrar gente é necessidade de qualquer operação. Era «Usuários».
  { label: 'Pessoas',          icon: Users,           to: ROUTE_PATHS.ADMIN_USUARIOS,      produtos: TODOS_OS_PRODUTOS, secao: 'gestao', roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_usuarios' },
  // Fechamento + RH Gestão: os dois calculavam a mesma premiação e comissão
  // por operador. Fica em `cobranca` e NÃO no produto `rh`: é a gestão de
  // pessoal DA cobrança, construída sobre os setores e equipes dela.
  { label: 'Fechamento do mês', icon: ClipboardCheck, to: ROUTE_PATHS.FECHAMENTO,          produtos: SO_COBRANCA, secao: 'gestao', permissoes: ['ver_fechamento', 'ver_rh_gestao'] },

  // ── Ferramentas ───────────────────────────────────────────────────────────
  { label: 'Campanha Fácil',   icon: Megaphone,       to: ROUTE_PATHS.CAMPANHA_FACIL,      produtos: SO_COBRANCA, secao: 'ferramentas', hiddenForPaguePay: true, permissaoKey: 'ver_campanha_facil' },
  // Meus Chips nasce LIGADA: todo cargo de setor enxerga a aba, e o escopo de
  // dentro decide se ela mostra o setor ou só o que foi lançado para a pessoa.
  { label: 'Meus Chips',       icon: MessageCircle,   to: ROUTE_PATHS.MEUS_CHIPS,          produtos: SO_COBRANCA, secao: 'ferramentas', hiddenForPaguePay: true, permissaoKey: 'ver_meus_chips' },
  // Visibilidade especial (PaguePlay + gate de rollout) — ver filtro abaixo.
  { label: 'Solicitar Atendimento', icon: MessageSquarePlus, to: ROUTE_PATHS.SOLICITACOES_WHATSAPP, produtos: SO_COBRANCA, secao: 'ferramentas', permissaoKey: 'ver_solicitacoes_whatsapp' },
  // `ver_tickets` decide quem tem a porta; o interruptor em `tickets_config` e
  // o cadastro de atendentes decidem quando ela abre. Nas DUAS operações desde
  // a Fase 9 (15/09/2026): nada na tela é de cobrança.
  { label: 'Tickets',          icon: Ticket,          to: ROUTE_PATHS.TICKETS,             produtos: COBRANCA_E_COMERCIAL, secao: 'ferramentas', permissaoKey: 'ver_tickets' },
  // A chave nasce desligada para todo cargo configurável. O palco
  // (`/tv/:slug`) não entra em menu nenhum: é endereço de TV, não tela de gente.
  { label: 'Modo TV',          icon: Tv,              to: ROUTE_PATHS.MODO_TV,             produtos: SO_COBRANCA, secao: 'ferramentas', permissaoKey: 'ver_modo_tv' },

  // ── Núcleo ADM ────────────────────────────────────────────────────────────
  //
  // Dashboard – ADM e Controle de Números eram a mesma área, com os mesmos
  // quatro usuários. Viraram um item, com o painel como primeira aba. Só
  // BookPlay; as chaves nascem só no Assistente ADM (11/09/2026).
  { label: 'Núcleo',           icon: Gauge,           to: ROUTE_PATHS.NUCLEO,              produtos: SO_COBRANCA, secao: 'nucleo', hiddenForPaguePay: true, permissoes: ['ver_dashboard_adm', 'ver_controle_numeros'] },

  // ── Administração ─────────────────────────────────────────────────────────
  { label: 'Configurações',    icon: Settings,        to: ROUTE_PATHS.ADMIN_CONFIGURACOES, produtos: TODOS_OS_PRODUTOS, secao: 'administracao', roles: ['administrador'], permissaoKey: 'ver_configuracoes' },
  // Relatório 59, vínculos, códigos, fontes, restaurar tabulações e banco.
  // Estavam espalhados pelo Painel Diretoria e por Configurações › Geral.
  { label: 'Dados e importações', icon: Database,     to: ROUTE_PATHS.ADMIN_DADOS,         produtos: SO_COBRANCA, secao: 'administracao', permissoes: ['ver_banco_dados', 'ver_painel_diretoria'] },
  // Trilha e monitoramento de uso. Eram Configurações › Logs, a cinco níveis
  // de profundidade no pior caminho.
  { label: 'Auditoria',        icon: ClipboardList,   to: ROUTE_PATHS.ADMIN_AUDITORIA,     produtos: TODOS_OS_PRODUTOS, secao: 'administracao', permissaoKey: 'ver_logs' },

  // ── Comercial ─────────────────────────────────────────────────────────────
  //
  // A aba Vendas: o que Acordos é para a cobrança, ela é para o comercial.
  { label: 'Vendas',           icon: ShoppingBag,     to: ROUTE_PATHS.VENDAS,              produtos: SO_COMERCIAL, secao: 'operacao', permissaoKey: 'ver_vendas' },
  // Indicações — o que acontece ANTES da venda. Chave própria, e não
  // `ver_vendas`: quem prospecta pode precisar do ranking do setor sem ver a
  // carteira de ninguém.
  { label: 'Indicações',       icon: Handshake,       to: ROUTE_PATHS.VENDAS_INDICACOES,   produtos: SO_COMERCIAL, secao: 'operacao', permissaoKey: 'ver_indicacoes' },
  // Fase 9 — os painéis do Comercial. Rota própria e CHAVE COMPARTILHADA com a
  // cobrança: a tela é outra, mas a pergunta que a chave faz é a mesma. Metas,
  // Acompanhamento, Fechamento, Importar Vendas e Desafios viraram abas
  // internas em 16 e 21/09/2026 — as rotas antigas redirecionam (App.tsx).
  { label: 'Painel Líder',     icon: BarChart3,       to: ROUTE_PATHS.VENDAS_PAINEL_LIDER,     produtos: SO_COMERCIAL, secao: 'operacao', roles: ['lider','administrador','elite','gerencia'], permissaoKey: 'ver_painel_lider' },
  { label: 'Painel Diretoria', icon: TrendingUp,      to: ROUTE_PATHS.VENDAS_PAINEL_DIRETORIA, produtos: SO_COMERCIAL, secao: 'operacao', roles: ['diretoria','administrador'], permissaoKey: 'ver_painel_diretoria' },
  // A lixeira do Comercial é outra TABELA (`lixeira_vendas`), não outro filtro.
  { label: 'Lixeira',          icon: Trash2,          to: ROUTE_PATHS.VENDAS_LIXEIRA,          produtos: SO_COMERCIAL, secao: 'operacao', permissaoKey: 'ver_lixeira' },
];

/**
 * O botão fixo «Novo acordo», no topo do menu.
 *
 * Era item de menu, e 240 operadores o abriam em 60 dias: precisa continuar a
 * um clique de qualquer tela. Não entra em `NAV_ITEMS` porque não é uma seção
 * do sistema — é uma ação —, mas passa pela mesma régua de produto, cargo e
 * chave que o item antigo passava.
 *
 * Na PaguePlay o acordo nasce na própria lista (formulário em linha), e o
 * botão leva até ela com o formulário aberto.
 */
export const NOVO_ACORDO = {
  label: 'Novo acordo',
  icon: Plus,
  produtos: SO_COBRANCA,
  permissaoKey: 'criar_acordos',
} as const;

export function destinoNovoAcordo(isPaguePlay: boolean): string {
  return isPaguePlay ? `${ROUTE_PATHS.ACORDOS}?novoInline=1` : ROUTE_PATHS.ACORDO_NOVO;
}

/** O botão fixo aparece para este contexto? */
export function mostrarNovoAcordo(ctx: ContextoMenu): boolean {
  if (!produtoPermite(NOVO_ACORDO.produtos, ctx.produto)) return false;
  if (!ctx.temPermissao(NOVO_ACORDO.permissaoKey)) return false;
  // Na PaguePlay quem cria acordo é quem vê a lista — que lá abre com
  // `ver_dashboard`, como abria dentro do Dashboard. A lista de cargos que o
  // item antigo carregava nunca era lida: item com chave obedece só à chave.
  return !ctx.isPaguePlay || ctx.temPermissao('ver_dashboard');
}

/** Os itens já filtrados, agrupados nas seções, na ordem das seções. */
export function agruparPorSecao<T extends { secao?: SecaoMenu }>(
  itens: T[],
): { chave: SecaoMenu; rotulo: string; itens: T[] }[] {
  return SECOES_MENU
    .map(s => ({ chave: s.chave, rotulo: s.rotulo, itens: itens.filter(i => (i.secao ?? 'operacao') === s.chave) }))
    .filter(s => s.itens.length > 0);
}

/**
 * Tudo o que a decisão «esta aba aparece?» precisa saber.
 *
 * As duas últimas dependem de PESSOA, e não de cargo. No menu de verdade elas
 * chegam resolvidas pelos hooks; na prévia por cargo do editor, o super_admin
 * escolhe um cargo e não uma pessoa, então elas chegam pelo que vale para o
 * cargo — e o editor diz isso na tela, em vez de fingir precisão que não tem.
 */
export interface ContextoMenu {
  /** O cargo de quem está vendo (ou o cargo que a prévia simula). */
  cargo: string;
  /**
   * O produto da empresa onde a pessoa está. `null` enquanto carrega — e nesse
   * estado o menu sai VAZIO, de propósito: meio segundo sem abas é melhor do
   * que meio segundo com as abas do produto errado.
   */
  produto: Produto | null;
  isPaguePlay: boolean;
  isBookplay: boolean;
  /**
   * A permissão configurável. No menu real é `temPermissao` (da pessoa); na
   * prévia é `valorDoCargo` (do cargo escolhido). Os dois já respondem `true`
   * para administrador e super_admin, que têm acesso total por construção.
   */
  temPermissao: (chave: string) => boolean;
  /** Interruptor da empresa + cadastro de atendentes de Tickets. */
  acessoTickets: boolean;
}

/**
 * As abas que este contexto enxerga, na ordem do código.
 *
 * Itens COM `permissaoKey` são controlados exclusivamente pela permissão:
 *   - admin/super_admin sempre veem (`temPermissao` retorna true);
 *   - outros cargos: visível se e somente se a permissão estiver ativa.
 *   Isso mantém a nav consistente com o `ProtectedRoute` da rota correspondente.
 *
 * Itens SEM `permissaoKey` são controlados pelo cargo (`roles`).
 */
export function abasDoMenu(ctx: ContextoMenu): NavItem[] {
  return NAV_ITEMS.filter(item => {
    // PRIMEIRO de tudo, e por lista branca: a aba existe neste produto?
    //
    // Vem antes de cargo e de permissão porque é uma pergunta de outra ordem.
    // Cargo e permissão respondem «esta pessoa pode ver?»; esta responde «isto
    // sequer existe aqui?». Um vendedor com `ver_acordos` ligado por engano
    // continua sem ver Acordos, porque acordo não é coisa do Comercial.
    if (!produtoPermite(item.produtos, ctx.produto)) return false;

    // As duas empresas de cobrança. Só têm efeito dentro de `cobranca` — fora
    // dela a aba já saiu na linha acima.
    if (item.hiddenForPaguePay && ctx.isPaguePlay) return false;
    if (item.hiddenForBookplay && ctx.isBookplay) return false;

    // A permissão configurável vem PRIMEIRO e vale para todo item que a
    // declara. Ela ficava depois dos casos especiais abaixo, que retornam cedo
    // — então Solicitar Atendimento nunca chegava a consultá-la, e o menu
    // continuava mostrando a aba de quem tinha a permissão desligada.
    if (item.permissaoKey && !ctx.temPermissao(item.permissaoKey)) return false;
    if (item.permissoes && !item.permissoes.some(ctx.temPermissao)) return false;

    // As telas que juntam outras aparecem quando sobra ao menos UMA aba — a
    // mesma régua que a tela usa para desenhá-las.
    //
    // `superAdmin: false` de propósito: as abas do 59 são de super_admin por
    // cargo, e o super_admin já tem `ver_banco_dados` — a de Dados aparece
    // para ele de qualquer forma. O menu não precisa perguntar o cargo.
    const emp: ContextoAbas = {
      isPaguePlay: ctx.isPaguePlay,
      isBookplay: ctx.isBookplay,
      superAdmin: false,
    };
    if (item.to === ROUTE_PATHS.DESEMPENHO) {
      const a = abasDoDesempenho(ctx.temPermissao, emp);
      return a.equipes || a.pessoas || a.desafios || a.elite;
    }
    if (item.to === ROUTE_PATHS.FECHAMENTO)  return abasDoFechamentoDoMes(ctx.temPermissao, emp).premiacao;
    if (item.to === ROUTE_PATHS.NUCLEO)      return algumaAba(abasDoNucleo(ctx.temPermissao, emp));
    if (item.to === ROUTE_PATHS.ADMIN_DADOS) return algumaAba(abasDosDados(ctx.temPermissao, emp));

    // Solicitar Atendimento: PaguePlay. O operador enxerga só os pedidos dele,
    // e quem garante isso é a RLS, não este filtro.
    if (item.to === ROUTE_PATHS.SOLICITACOES_WHATSAPP) {
      return ctx.isPaguePlay;
    }

    // Tickets: nasce só para administrador. A liderança entra quando a chave
    // `tickets_config.liberado_para_lideranca` for virada na própria aba.
    if (item.to === ROUTE_PATHS.TICKETS) {
      // A permissao ja foi conferida acima (o item declara `ver_tickets`).
      // O que sobra aqui e o interruptor da empresa e o cadastro de
      // atendentes — dois controles que o proprio admin liga na tela.
      return ctx.acessoTickets;
    }

    if (item.permissaoKey || item.permissoes) return true;

    return !item.roles || item.roles.includes(ctx.cargo) || ctx.cargo === 'super_admin';
  });
}

/**
 * Tickets para um CARGO, sem olhar pessoa.
 *
 * `useTicketsAcesso` responde pela pessoa logada e soma um caminho que é
 * individual: estar em `tickets_atendentes`. Numa prévia por cargo esse caminho
 * não existe — não há pessoa —, e o que sobra são as duas chaves do painel.
 *
 * Recebe `temPermissao` e não `cargo` desde 24/08/2026. Antes eram
 * `isPerfilAdmin`/`isPerfilLider` escritos aqui, e a prévia mentia assim que
 * alguém mexesse em Tickets no painel: a réplica mostrava a aba pela lista de
 * cargo enquanto a tela real já a escondia pela chave.
 */
export function ticketsVisivelParaCargo(
  temPermissao: (chave: string) => boolean,
  liberadoParaLideranca: boolean,
): boolean {
  if (temPermissao('tickets_administrar')) return true;
  return liberadoParaLideranca && temPermissao('tickets_abrir');
}
